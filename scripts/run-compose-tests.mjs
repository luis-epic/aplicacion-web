import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const composeFile = resolve(root, 'infra/compose.test.yaml')
const envFile = resolve(root, '.env.test.generated')
const publicationMediaDirectory = resolve(root, '.test-publication-media.generated')
const mode = process.argv[2] ?? 'system'
const allowedModes = new Set(['integration', 'e2e', 'a11y', 'offline', 'system'])
if (!allowedModes.has(mode)) throw new Error(`Modo de pruebas desconocido: ${mode}`)

const apiPort = process.env.TEST_API_PORT ?? '4400'
const portalPort = process.env.TEST_PORTAL_PORT ?? '3300'
const fieldPort = process.env.TEST_FIELD_PORT ?? '5273'
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'release-admin@opeconca.invalid'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? `${randomBytes(24).toString('base64url')}aA1!`
const generated = {
  POSTGRES_DB: 'opeconca_test',
  POSTGRES_USER: 'opeconca_test',
  POSTGRES_PASSWORD: randomBytes(32).toString('base64url'),
  JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
  JWT_REFRESH_SECRET: randomBytes(48).toString('base64url'),
  ADMIN_EMAIL: adminEmail,
  ADMIN_PASSWORD: adminPassword,
  ADMIN_NAME: 'Administrador de release',
  TEST_API_PORT: apiPort,
  TEST_PORTAL_PORT: portalPort,
  TEST_FIELD_PORT: fieldPort,
  TEST_PUBLICATION_MEDIA_PATH: publicationMediaDirectory.replaceAll('\\', '/'),
}

const childEnvironment = {
  ...process.env,
  ...generated,
  API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
  PORTAL_BASE_URL: `http://localhost:${portalPort}`,
  FIELD_BASE_URL: `http://localhost:${fieldPort}`,
  E2E_ADMIN_EMAIL: adminEmail,
  E2E_ADMIN_PASSWORD: adminPassword,
  COMPOSE_PROGRESS: 'quiet',
}
const pnpmCli = resolve(root, 'node_modules/pnpm/bin/pnpm.cjs')
if (!existsSync(pnpmCli)) throw new Error('No se encontró el CLI local de pnpm. Ejecute pnpm install primero.')
const windowsDocker = resolve(process.env.LOCALAPPDATA ?? '', 'Programs/DockerDesktop/resources/bin/docker.exe')
const docker = process.platform === 'win32' && existsSync(windowsDocker) ? windowsDocker : 'docker'
const compose = ['compose', '--project-name', 'opeconca-test', '--env-file', envFile, '-f', composeFile]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: childEnvironment,
    stdio: 'inherit',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} terminó con código ${result.status}`)
}

const steps = {
  integration: [['exec', 'vitest', 'run', '--config', 'vitest.config.ts', 'tests/integration']],
  e2e: [['exec', 'playwright', 'test', 'tests/e2e/portal.spec.ts']],
  a11y: [['exec', 'playwright', 'test', 'tests/e2e/accessibility.spec.ts']],
  offline: [['exec', 'playwright', 'test', 'tests/e2e/offline.spec.ts']],
  system: [
    ['exec', 'vitest', 'run', '--config', 'vitest.config.ts', 'tests/integration'],
    ['exec', 'playwright', 'test', 'tests/e2e/portal.spec.ts'],
    ['exec', 'playwright', 'test', 'tests/e2e/accessibility.spec.ts'],
    ['exec', 'playwright', 'test', 'tests/e2e/offline.spec.ts'],
    ['exec', 'node', 'scripts/load-smoke.mjs'],
  ],
}

let executionError
try {
  rmSync(publicationMediaDirectory, { force: true, recursive: true })
  mkdirSync(resolve(publicationMediaDirectory, 'integration'), { recursive: true })
  writeFileSync(
    resolve(publicationMediaDirectory, 'integration/boletin.png'),
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    { mode: 0o644 },
  )
  writeFileSync(envFile, `${Object.entries(generated).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 })
  const buildArguments = process.env.TEST_SKIP_BUILD === 'true' ? [] : ['--build']
  run(docker, [...compose, 'up', ...buildArguments, '--wait', '--wait-timeout', '420'])
  for (const args of steps[mode]) run(process.execPath, [pnpmCli, ...args])
} catch (error) {
  executionError = error
  const diagnostics = spawnSync(docker, [...compose, 'logs', '--no-color', 'api-migrate', 'api'], {
    cwd: root,
    env: childEnvironment,
    stdio: 'inherit',
  })
  if (diagnostics.error) console.error(`No se pudieron obtener logs de diagnóstico: ${diagnostics.error.message}`)
} finally {
  let cleanupError
  if (existsSync(envFile)) {
    const cleanup = spawnSync(docker, [...compose, 'down', '--volumes', '--remove-orphans'], {
      cwd: root,
      env: childEnvironment,
      stdio: 'inherit',
    })
    if (cleanup.error) cleanupError = cleanup.error
    else if (cleanup.status !== 0) cleanupError = new Error(`docker compose down terminó con código ${cleanup.status}`)
  }
  rmSync(envFile, { force: true })
  rmSync(publicationMediaDirectory, { force: true, recursive: true })
  if (cleanupError) {
    executionError = executionError
      ? new AggregateError([executionError, cleanupError], 'Fallaron la ejecución de pruebas y su cleanup.')
      : cleanupError
  }
}
if (executionError) throw executionError
