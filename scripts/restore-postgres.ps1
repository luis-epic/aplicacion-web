[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$BackupPath,

  [Parameter(Mandatory)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$EnvironmentFile,

  [string]$ComposeFile = (Join-Path (Split-Path -Parent $PSScriptRoot) 'infra/compose.production.yaml')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-DockerRestore([string[]]$Arguments, [string]$Source, [string]$FailureMessage) {
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'docker'
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in $Arguments) {
    $startInfo.ArgumentList.Add($argument)
  }

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $input = $null
  try {
    if (-not $process.Start()) {
      throw $FailureMessage
    }
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $input = [IO.File]::OpenRead($Source)
    $input.CopyTo($process.StandardInput.BaseStream)
    $process.StandardInput.Close()
    $input.Dispose()
    $input = $null
    $process.WaitForExit()
    [void]$outputTask.GetAwaiter().GetResult()
    [void]$errorTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
      throw $FailureMessage
    }
  } finally {
    if ($input) {
      $input.Dispose()
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

$resolvedBackup = [IO.Path]::GetFullPath($BackupPath)
$checksumPath = "$resolvedBackup.sha256"
if (Test-Path -LiteralPath $checksumPath -PathType Leaf) {
  $expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0]
  $actualHash = (Get-FileHash -LiteralPath $resolvedBackup -Algorithm SHA256).Hash
  if ($actualHash -ine $expectedHash) {
    throw 'El checksum SHA-256 del backup no coincide.'
  }
} else {
  throw "Falta el checksum requerido: $checksumPath"
}

$confirmation = Read-Host "Esta operación reemplazará los objetos existentes de PostgreSQL desde '$resolvedBackup'. Escriba RESTORE para continuar"
if ($confirmation -cne 'RESTORE') {
  throw 'Restauración cancelada: confirmación incorrecta.'
}

$composeArgs = @('compose', '--env-file', $EnvironmentFile, '-f', $ComposeFile)
$containerId = (& docker @composeArgs ps --status running --quiet postgres).Trim()
if ($LASTEXITCODE -ne 0 -or -not $containerId) {
  throw 'El servicio postgres no está en ejecución.'
}

$listArgs = $composeArgs + @(
  'exec', '-T', 'postgres', 'sh', '-ceu',
  'exec pg_restore --list >/dev/null'
)
Invoke-DockerRestore -Arguments $listArgs -Source $resolvedBackup -FailureMessage 'El archivo no es un backup PostgreSQL válido.'

$restoreArgs = $composeArgs + @(
  'exec', '-T', 'postgres', 'sh', '-ceu',
  'exec pg_restore --clean --if-exists --exit-on-error --single-transaction --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"'
)
Invoke-DockerRestore -Arguments $restoreArgs -Source $resolvedBackup -FailureMessage 'pg_restore falló; revise los logs antes de reanudar tráfico.'

Write-Host 'Restauración completada. Valide /api/v1/health/ready y los flujos críticos antes de reanudar tráfico.' -ForegroundColor Green
