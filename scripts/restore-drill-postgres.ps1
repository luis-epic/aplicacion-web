[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$BackupPath,

  [string]$DockerImage = 'postgres:17.5-alpine3.22',

  [ValidateRange(1, 300)]
  [int]$ReadyTimeoutSeconds = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-DockerCommand([string[]]$Arguments, [string]$FailureMessage) {
  $output = & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
  return $output
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker no está disponible.'
}

$drillStarted = [DateTime]::UtcNow
$resolvedBackup = [IO.Path]::GetFullPath($BackupPath)
$checksumPath = "$resolvedBackup.sha256"
if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
  throw "Falta el checksum requerido: $checksumPath"
}

$expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0]
$actualHash = (Get-FileHash -LiteralPath $resolvedBackup -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not $expectedHash -or $actualHash -ine $expectedHash) {
  throw 'El checksum SHA-256 del backup no coincide.'
}

$backupDirectory = Split-Path -Parent $resolvedBackup
$dumpFileName = Split-Path -Leaf $resolvedBackup
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$containerName = "opeconca-restore-drill-$runId"
$volumeName = "opeconca-restore-drill-data-$runId"
$temporaryPassword = [Guid]::NewGuid().ToString('N')
$containerCreated = $false
$volumeCreated = $false
$temporaryResourcesDeleted = $false
$result = $null

try {
  [void](Invoke-DockerCommand -Arguments @('volume', 'create', $volumeName) -FailureMessage 'No se pudo crear el volumen temporal del simulacro.')
  $volumeCreated = $true

  [void](Invoke-DockerCommand -Arguments @(
    'run', '--detach', '--name', $containerName, '--network', 'none',
    '--mount', "type=volume,src=$volumeName,dst=/var/lib/postgresql/data",
    '--mount', "type=bind,src=$backupDirectory,dst=/backups,readonly",
    '--env', 'POSTGRES_DB=restore_drill',
    '--env', 'POSTGRES_USER=restore_operator',
    '--env', "POSTGRES_PASSWORD=$temporaryPassword",
    $DockerImage
  ) -FailureMessage 'No se pudo iniciar PostgreSQL aislado.')
  $containerCreated = $true

  $ready = $false
  for ($attempt = 1; $attempt -le $ReadyTimeoutSeconds; $attempt++) {
    & docker exec $containerName pg_isready -U restore_operator -d restore_drill | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw "PostgreSQL aislado no alcanzó readiness en $ReadyTimeoutSeconds segundos."
  }

  $catalog = Invoke-DockerCommand -Arguments @('exec', $containerName, 'sh', '-ceu', "pg_restore --list /backups/$dumpFileName") -FailureMessage 'El archivo no es un backup PostgreSQL válido.'
  $catalogLines = @($catalog).Count
  if ($catalogLines -le 0) {
    throw 'El catálogo pg_restore está vacío.'
  }

  $restoreCommand = 'exec pg_restore --clean --if-exists --exit-on-error --single-transaction --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "/backups/{0}"' -f $dumpFileName
  [void](Invoke-DockerCommand -Arguments @('exec', $containerName, 'sh', '-ceu', $restoreCommand) -FailureMessage 'pg_restore falló; revise el dump antes de repetir el simulacro.')

  $postgresVersion = (Invoke-DockerCommand -Arguments @('exec', $containerName, 'psql', '-U', 'restore_operator', '-d', 'restore_drill', '-Atc', 'show server_version') -FailureMessage 'No se pudo consultar la versión PostgreSQL restaurada.').Trim()
  $tableCount = [int](Invoke-DockerCommand -Arguments @('exec', $containerName, 'psql', '-U', 'restore_operator', '-d', 'restore_drill', '-Atc', "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';") -FailureMessage 'No se pudo validar el esquema público.')
  $migrationCount = [int](Invoke-DockerCommand -Arguments @('exec', $containerName, 'psql', '-U', 'restore_operator', '-d', 'restore_drill', '-Atc', 'SELECT count(*) FROM _prisma_migrations;') -FailureMessage 'No se pudo validar _prisma_migrations.')
  if ($tableCount -le 0) {
    throw 'No se encontraron tablas de aplicación tras restaurar.'
  }

  $drillCompleted = [DateTime]::UtcNow
  $rpoMinutes = $null
  $rpoStatus = 'NO_CALCULABLE: el nombre del dump no contiene una marca UTC compatible.'
  if ($dumpFileName -match '^opeconca-postgres-(?<timestamp>\d{8}T\d{6}Z)\.dump$') {
    $backupTimestamp = [DateTime]::ParseExact($Matches.timestamp, 'yyyyMMddTHHmmssZ', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal)
    $rpoMinutes = [Math]::Round(($drillStarted - $backupTimestamp).TotalMinutes, 2)
    $rpoStatus = if ($rpoMinutes -ge 0) { 'COTA_LOCAL: diferencia entre la marca del dump y el inicio del simulacro; no sustituye un corte de incidente ni PITR.' } else { 'NO_CALCULABLE: la marca del dump es posterior al reloj del simulacro.' }
  }

  $result = [PSCustomObject]@{
    backup = $dumpFileName
    checksumSha256 = $actualHash
    postgresqlVersion = $postgresVersion
    catalogLines = $catalogLines
    publicTables = $tableCount
    prismaMigrations = $migrationCount
    network = 'none'
    publishedPorts = 0
    startedUtc = $drillStarted.ToString('o')
    completedUtc = $drillCompleted.ToString('o')
    rtoSeconds = [Math]::Round(($drillCompleted - $drillStarted).TotalSeconds, 2)
    rpoHorizonMinutes = $rpoMinutes
    rpoStatus = $rpoStatus
  }
} finally {
  if ($containerCreated) {
    [void](& docker rm --force $containerName 2>$null)
    if ($LASTEXITCODE -ne 0) {
      throw "No se pudo eliminar el contenedor temporal: $containerName"
    }
  }
  if ($volumeCreated) {
    [void](& docker volume rm --force $volumeName 2>$null)
    if ($LASTEXITCODE -ne 0) {
      throw "No se pudo eliminar el volumen temporal: $volumeName"
    }
  }
  $temporaryResourcesDeleted = $true
}

$result | Add-Member -NotePropertyName temporaryResourcesDeleted -NotePropertyValue $temporaryResourcesDeleted
$result
