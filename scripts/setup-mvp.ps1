[CmdletBinding()]
param(
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root '.env'
$composePath = Join-Path $root 'infra/compose.mvp.yaml'
$postgresVolumeName = 'opeconca-mvp_postgres_data'
$generatedCredentials = $false

function New-RandomHex([int]$bytes) {
  return [Convert]::ToHexString(
    [Security.Cryptography.RandomNumberGenerator]::GetBytes($bytes)
  ).ToLowerInvariant()
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker no está instalado. Instala Docker Desktop y vuelve a ejecutar pnpm mvp:setup.'
}

& docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Desktop está instalado, pero el motor no está disponible. Inícialo y vuelve a intentar.'
}

if (-not (Test-Path $envPath)) {
  $existingVolumes = @(& docker volume ls --format '{{.Name}}')
  if ($existingVolumes -contains $postgresVolumeName) {
    throw "Existe el volumen $postgresVolumeName pero falta .env. Restaura el archivo original o elimina el volumen explícitamente si deseas reiniciar todos los datos."
  }

  $databasePassword = New-RandomHex 16
  $adminPassword = "Mvp!$(New-RandomHex 12)"
  $accessSecret = New-RandomHex 48
  $refreshSecret = New-RandomHex 48
  $adminEmail = 'admin@opeconca.local'

  @"
NODE_ENV=development
PORT=4000
TRUST_PROXY_HOPS=0

POSTGRES_DB=opeconca
POSTGRES_USER=opeconca
POSTGRES_PASSWORD=$databasePassword
DATABASE_URL=postgresql://opeconca:$databasePassword@localhost:5432/opeconca?schema=public
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=$accessSecret
JWT_REFRESH_SECRET=$refreshSecret
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_DAYS=30

ADMIN_EMAIL=$adminEmail
ADMIN_PASSWORD=$adminPassword
ADMIN_NAME=Administrador OPECONCA

APP_URL=http://localhost:3000
FIELD_APP_URL=http://localhost:5173
API_URL=http://localhost:4000
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1

S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
EMAIL_API_KEY=
"@ | Set-Content -Path $envPath -Encoding utf8NoBOM

  $generatedCredentials = $true
} else {
  $environmentContent = Get-Content -Path $envPath -Raw
  if ($environmentContent.Contains('replace-with-')) {
    throw 'El archivo .env contiene valores de ejemplo. Sustitúyelos o elimina .env únicamente si aún no existe el volumen PostgreSQL del MVP.'
  }
  $adminEmailLine = Get-Content $envPath | Where-Object { $_ -like 'ADMIN_EMAIL=*' } | Select-Object -First 1
  $adminEmail = if ($adminEmailLine) { $adminEmailLine.Substring(12) } else { '(definido en .env)' }
}

$composeArguments = @('compose', '--env-file', $envPath, '-f', $composePath)
& docker @composeArguments config --quiet
if ($LASTEXITCODE -ne 0) {
  throw 'La configuración de Docker Compose no es válida.'
}

$upArguments = $composeArguments + @('up', '-d')
if (-not $SkipBuild) {
  $upArguments += '--build'
}
& docker @upArguments
if ($LASTEXITCODE -ne 0) {
  throw 'No se pudo levantar el MVP. Revisa los mensajes de Docker Compose.'
}

$pendingEndpoints = [ordered]@{
  API = 'http://localhost:4000/api/v1/health/ready'
  Portal = 'http://localhost:3000'
  Campo = 'http://localhost:5173'
}
$httpClient = [System.Net.Http.HttpClient]::new()
$httpClient.Timeout = [TimeSpan]::FromSeconds(5)
$healthDeadline = [DateTime]::UtcNow.AddMinutes(3)
try {
  while ($pendingEndpoints.Count -gt 0 -and [DateTime]::UtcNow -lt $healthDeadline) {
    foreach ($name in @($pendingEndpoints.Keys)) {
      $response = $null
      try {
        $response = $httpClient.GetAsync($pendingEndpoints[$name]).GetAwaiter().GetResult()
        if ($response.IsSuccessStatusCode) {
          $pendingEndpoints.Remove($name)
        }
      } catch {
        # El servicio puede seguir arrancando o esperando una dependencia saludable.
      } finally {
        if ($response) {
          $response.Dispose()
        }
      }
    }
    if ($pendingEndpoints.Count -gt 0) {
      Start-Sleep -Seconds 2
    }
  }
} finally {
  $httpClient.Dispose()
}

if ($pendingEndpoints.Count -gt 0) {
  & docker @composeArguments logs --tail 100 api-migrate api web field
  $pendingNames = $pendingEndpoints.Keys -join ', '
  throw "Los siguientes servicios no respondieron correctamente: $pendingNames."
}

Write-Host ''
Write-Host 'OPECONCA MVP está disponible:' -ForegroundColor Green
Write-Host '  Portal:  http://localhost:3000'
Write-Host '  Campo:   http://localhost:5173'
Write-Host '  API:     http://localhost:4000/api/v1/health/ready'
Write-Host '  Swagger: http://localhost:4000/docs'
Write-Host "  Usuario: $adminEmail"
if ($generatedCredentials) {
  Write-Host "  Clave:   $adminPassword" -ForegroundColor Yellow
  Write-Host 'Guarda esta clave: fue generada para la demostración local.' -ForegroundColor Yellow
}
