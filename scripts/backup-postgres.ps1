[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateNotNullOrEmpty()]
  [string]$OutputDirectory,

  [Parameter(Mandatory)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$EnvironmentFile,

  [string]$ComposeFile = (Join-Path (Split-Path -Parent $PSScriptRoot) 'infra/compose.production.yaml'),

  [switch]$NonInteractive,

  [ValidateRange(0, 3650)]
  [int]$RetentionDays = 0,

  [ValidateRange(1, 365)]
  [int]$MinimumBackups = 7
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-DockerBackup([string[]]$Arguments, [string]$Destination) {
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'docker'
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in $Arguments) {
    $startInfo.ArgumentList.Add($argument)
  }

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $output = $null
  try {
    if (-not $process.Start()) {
      throw 'No se pudo iniciar pg_dump.'
    }
    $errorTask = $process.StandardError.ReadToEndAsync()
    $output = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $process.StandardOutput.BaseStream.CopyTo($output)
    $output.Dispose()
    $output = $null
    $process.WaitForExit()
    [void]$errorTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
      throw 'pg_dump falló; revise los logs del servicio PostgreSQL.'
    }
  } finally {
    if ($output) {
      $output.Dispose()
    }
    $process.Dispose()
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker no está disponible.'
}
if (-not (Test-Path -LiteralPath $ComposeFile -PathType Leaf)) {
  throw "No existe el archivo Compose: $ComposeFile"
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
if (-not (Test-Path -LiteralPath $resolvedOutput)) {
  New-Item -ItemType Directory -Path $resolvedOutput | Out-Null
}

if (-not $NonInteractive) {
  $confirmation = Read-Host "Se creará un backup PostgreSQL en '$resolvedOutput'. Escriba BACKUP para continuar"
  if ($confirmation -cne 'BACKUP') {
    throw 'Backup cancelado: confirmación incorrecta.'
  }
}

$composeArgs = @('compose', '--env-file', $EnvironmentFile, '-f', $ComposeFile)
$containerId = (& docker @composeArgs ps --status running --quiet postgres).Trim()
if ($LASTEXITCODE -ne 0 -or -not $containerId) {
  throw 'El servicio postgres no está en ejecución.'
}

$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$fileName = "opeconca-postgres-$timestamp.dump"
$outputPath = Join-Path $resolvedOutput $fileName
$dumpArgs = $composeArgs + @(
  'exec', '-T', 'postgres', 'sh', '-ceu',
  'exec pg_dump --format=custom --compress=9 --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"'
)

try {
  Invoke-DockerBackup -Arguments $dumpArgs -Destination $outputPath
} catch {
  Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
  throw
}

$hash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$outputPath.sha256" -Value "$hash  $fileName" -Encoding ascii

$removedBackups = 0
if ($RetentionDays -gt 0) {
  $cutoff = [DateTime]::UtcNow.AddDays(-$RetentionDays)
  $backups = @(Get-ChildItem -LiteralPath $resolvedOutput -File -Filter 'opeconca-postgres-*.dump' |
    Sort-Object LastWriteTimeUtc -Descending)
  $validBackups = @()
  $invalidBackups = @()

  foreach ($backup in $backups) {
    $backupChecksumPath = "$($backup.FullName).sha256"
    if (-not (Test-Path -LiteralPath $backupChecksumPath -PathType Leaf)) {
      $invalidBackups += "$($backup.Name) (sin checksum)"
      continue
    }
    try {
      $expectedHash = ((Get-Content -LiteralPath $backupChecksumPath -Raw).Trim() -split '\s+')[0]
      $actualHash = (Get-FileHash -LiteralPath $backup.FullName -Algorithm SHA256).Hash
      if (-not $expectedHash -or $actualHash -ine $expectedHash) {
        $invalidBackups += "$($backup.Name) (checksum inválido)"
        continue
      }
      $validBackups += $backup
    } catch {
      $invalidBackups += "$($backup.Name) (no verificable)"
    }
  }

  if ($invalidBackups.Count -gt 0) {
    throw "Retención cancelada: hay backups huérfanos o inválidos que requieren cuarentena: $($invalidBackups -join ', ')."
  }

  $eligible = @($validBackups | Select-Object -Skip $MinimumBackups | Where-Object {
    $_.LastWriteTimeUtc -lt $cutoff
  })
  foreach ($backup in $eligible) {
    Remove-Item -LiteralPath "$($backup.FullName).sha256" -Force
    Remove-Item -LiteralPath $backup.FullName -Force
    $removedBackups += 1
  }
}

Write-Host "Backup creado: $outputPath" -ForegroundColor Green
Write-Host "Checksum creado: $outputPath.sha256"
if ($RetentionDays -gt 0) {
  Write-Host "Retención aplicada: $removedBackups backup(s) completo(s) eliminado(s); se conservaron al menos $MinimumBackups."
}
