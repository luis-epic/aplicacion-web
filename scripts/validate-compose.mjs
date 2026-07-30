import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const windowsDocker = resolve(process.env.LOCALAPPDATA ?? '', 'Programs/DockerDesktop/resources/bin/docker.exe')
const docker = process.platform === 'win32' && existsSync(windowsDocker) ? windowsDocker : 'docker'
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'opeconca-compose-validation-'))
const secret = () => randomBytes(32).toString('base64url')
const digest = (character) => `sha256:${character.repeat(64)}`
const secretFiles = {
  POSTGRES_PASSWORD_FILE: join(temporaryDirectory, 'postgres-password'),
  DATABASE_URL_FILE: join(temporaryDirectory, 'database-url'),
  JWT_ACCESS_SECRET_FILE: join(temporaryDirectory, 'jwt-access-secret'),
  JWT_REFRESH_SECRET_FILE: join(temporaryDirectory, 'jwt-refresh-secret'),
  METRICS_TOKEN_FILE: join(temporaryDirectory, 'metrics-token'),
  ADMIN_PASSWORD_FILE: join(temporaryDirectory, 'admin-password'),
}

const environment = {
  ...process.env,
  POSTGRES_DB: 'opeconca_validation',
  POSTGRES_USER: 'opeconca_validation',
  POSTGRES_PASSWORD: secret(),
  POSTGRES_IMAGE: `postgres:17.5-alpine3.22@${digest('0')}`,
  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
  ADMIN_EMAIL: 'validation@opeconca.invalid',
  ADMIN_PASSWORD: `${secret()}aA1!`,
  ADMIN_NAME: 'Validation Admin',
  ADMIN_BOOTSTRAP_CONFIRM: 'CREATE_INITIAL_ADMIN',
  API_MIGRATION_IMAGE: `registry.opeconca.invalid/api-migration@${digest('a')}`,
  API_IMAGE: `registry.opeconca.invalid/api@${digest('b')}`,
  WEB_IMAGE: `registry.opeconca.invalid/web@${digest('c')}`,
  FIELD_IMAGE: `registry.opeconca.invalid/field@${digest('d')}`,
  PUBLICATION_MEDIA_PATH: temporaryDirectory,
  TEST_PUBLICATION_MEDIA_PATH: temporaryDirectory,
  TRUST_PROXY_HOPS: '1',
  JWT_ACCESS_TTL_SECONDS: '900',
  JWT_REFRESH_TTL_DAYS: '30',
  APP_URL: 'https://portal.opeconca.invalid',
  FIELD_APP_URL: 'https://campo.opeconca.invalid',
  NEXT_PUBLIC_API_URL: 'https://api.opeconca.invalid/api/v1',
  SERVICE_VERSION: 'compose-validation',
  ...secretFiles,
}

function composeConfig(files, { json = false, profile } = {}) {
  const args = ['compose']
  files.forEach((file) => args.push('-f', file))
  if (profile) args.push('--profile', profile)
  args.push('config', ...(json ? ['--format', 'json'] : ['--quiet']))
  const result = spawnSync(docker, args, {
    cwd: root,
    env: environment,
    encoding: json ? 'utf8' : undefined,
    stdio: json ? 'pipe' : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (json && result.stderr) process.stderr.write(result.stderr)
    throw new Error(`${files.join(' + ')} no es una configuración Compose válida.`)
  }
  return json ? JSON.parse(result.stdout) : undefined
}

function assertImmutableProduction(config) {
  const digestReference = /^[^\s@]+@sha256:[a-f0-9]{64}$/
  for (const serviceName of ['postgres', 'api-migrate', 'api', 'web', 'field']) {
    const service = config.services?.[serviceName]
    if (!service) throw new Error(`Falta el servicio productivo ${serviceName}.`)
    if (service.build) throw new Error(`${serviceName} no puede contener build en producción.`)
    if (!digestReference.test(service.image ?? '')) {
      throw new Error(`${serviceName} debe usar una referencia OCI inmutable nombre@sha256:digest.`)
    }
  }
}

const composeFiles = [
  'infra/compose.yaml',
  'infra/compose.mvp.yaml',
  'infra/compose.test.yaml',
]

try {
  writeFileSync(secretFiles.POSTGRES_PASSWORD_FILE, environment.POSTGRES_PASSWORD, { mode: 0o600 })
  writeFileSync(secretFiles.DATABASE_URL_FILE, `postgresql://${environment.POSTGRES_USER}:${environment.POSTGRES_PASSWORD}@postgres:5432/${environment.POSTGRES_DB}?schema=public`, { mode: 0o600 })
  writeFileSync(secretFiles.JWT_ACCESS_SECRET_FILE, environment.JWT_ACCESS_SECRET, { mode: 0o600 })
  writeFileSync(secretFiles.JWT_REFRESH_SECRET_FILE, environment.JWT_REFRESH_SECRET, { mode: 0o600 })
  writeFileSync(secretFiles.METRICS_TOKEN_FILE, secret(), { mode: 0o600 })
  writeFileSync(secretFiles.ADMIN_PASSWORD_FILE, environment.ADMIN_PASSWORD, { mode: 0o600 })

  composeFiles.forEach((composeFile) => composeConfig([composeFile]))
  const production = composeConfig(['infra/compose.production.yaml'], { json: true })
  assertImmutableProduction(production)
  const bootstrap = composeConfig(
    ['infra/compose.production.yaml', 'infra/compose.bootstrap.yaml'],
    { json: true, profile: 'bootstrap' },
  )
  assertImmutableProduction(bootstrap)
  if (bootstrap.services?.['api-bootstrap']?.build) {
    throw new Error('api-bootstrap no puede contener build en producción.')
  }
  if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(bootstrap.services?.['api-bootstrap']?.image ?? '')) {
    throw new Error('api-bootstrap debe reutilizar una imagen de migración fijada por digest.')
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}

console.log('Compose base, MVP, pruebas, producción inmutable y bootstrap validados.')
