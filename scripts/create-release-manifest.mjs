import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const digestReference = /^[^\s@]+@sha256:([a-f0-9]{64})$/
const outputArgument = process.argv.indexOf('--output')
const output = resolve(outputArgument >= 0 ? process.argv[outputArgument + 1] : 'artifacts/release/release-manifest.json')
const commit = (process.env.RELEASE_COMMIT ?? process.env.GITHUB_SHA ?? '').trim()
if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('RELEASE_COMMIT/GITHUB_SHA debe ser un SHA completo.')

const references = {
  api: process.env.API_IMAGE,
  apiMigration: process.env.API_MIGRATION_IMAGE,
  web: process.env.WEB_IMAGE,
  field: process.env.FIELD_IMAGE,
}
const images = Object.fromEntries(Object.entries(references).map(([name, reference]) => {
  const normalized = reference?.trim() ?? ''
  const match = digestReference.exec(normalized)
  if (!match) throw new Error(`${name} debe usar nombre@sha256:digest.`)
  return [name, { digest: `sha256:${match[1]}`, reference: normalized }]
}))

const manifest = {
  schemaVersion: 1,
  commit,
  createdAt: new Date().toISOString(),
  source: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/commit/${commit}`
    : null,
  workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
  images,
}

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
const environmentFile = resolve(dirname(output), 'images.env')
writeFileSync(environmentFile, [
  `API_IMAGE=${images.api.reference}`,
  `API_MIGRATION_IMAGE=${images.apiMigration.reference}`,
  `WEB_IMAGE=${images.web.reference}`,
  `FIELD_IMAGE=${images.field.reference}`,
  `SERVICE_VERSION=${commit}`,
  '',
].join('\n'), { flag: 'wx' })
console.log(`Manifiesto de release creado en ${output}`)
