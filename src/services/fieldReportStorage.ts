import { clearFieldStores, deleteFieldRecord, deleteFieldRecordsWhereAtomically, fieldStores, getAllFieldRecords, getFieldRecord, putFieldRecord, putFieldRecordsAtomically } from './fieldDatabase'
import type {
  FieldProject,
  LocalFieldReport,
  OutboxEntry,
  ServerFieldReport,
  SessionIdentity,
} from '../types/fieldReports'

const IDENTITY_KEY = 'current'

interface IdentityRecord {
  key: string
  value: SessionIdentity
  updatedAt: string
}

interface ProjectsRecord {
  key: string
  ownerId: string
  items: FieldProject[]
  updatedAt: string
}

export async function loadCachedIdentity(): Promise<SessionIdentity | null> {
  const record = await getFieldRecord<IdentityRecord>(fieldStores.identity, IDENTITY_KEY)
  return record?.value ?? null
}

export function cacheIdentity(identity: SessionIdentity): Promise<void> {
  return putFieldRecord(fieldStores.identity, {
    key: IDENTITY_KEY,
    value: identity,
    updatedAt: new Date().toISOString(),
  } satisfies IdentityRecord)
}

export async function loadCachedProjects(ownerId: string): Promise<FieldProject[]> {
  const record = await getFieldRecord<ProjectsRecord>(fieldStores.projects, ownerId)
  return record?.items ?? []
}

export function cacheProjects(ownerId: string, projects: FieldProject[]): Promise<void> {
  return putFieldRecord(fieldStores.projects, {
    key: ownerId,
    ownerId,
    items: projects,
    updatedAt: new Date().toISOString(),
  } satisfies ProjectsRecord)
}

export async function loadFieldReports(ownerId: string): Promise<LocalFieldReport[]> {
  const reports = await getAllFieldRecords<LocalFieldReport>(fieldStores.reports)
  return reports
    .filter((report) => report.ownerId === ownerId)
    .sort((left, right) => right.payload.reportDate.localeCompare(left.payload.reportDate))
}

export function saveFieldReport(report: LocalFieldReport): Promise<void> {
  return putFieldRecord(fieldStores.reports, report)
}

export async function cacheServerReports(ownerId: string, serverReports: ServerFieldReport[]): Promise<void> {
  const localReports = await loadFieldReports(ownerId)
  const byKey = new Map(localReports.map((report) => [report.payload.idempotencyKey, report]))
  await Promise.all(serverReports.map((serverReport) => {
    const existing = byKey.get(serverReport.idempotencyKey)
    const now = new Date().toISOString()
    return saveFieldReport({
      localId: existing?.localId ?? `server-${serverReport.id}`,
      ownerId,
      payload: {
        projectId: serverReport.projectId,
        reportDate: serverReport.reportDate,
        summary: serverReport.summary,
        personnelCount: serverReport.personnelCount,
        weatherNotes: serverReport.weatherNotes ?? undefined,
        incidentNotes: serverReport.incidentNotes ?? undefined,
        clientUpdatedAt: serverReport.clientUpdatedAt,
        idempotencyKey: serverReport.idempotencyKey,
      },
      projectCode: serverReport.projectCode,
      projectName: serverReport.projectName,
      submitAfterCreate: serverReport.status !== 'DRAFT',
      syncState: 'synced',
      serverReport,
      createdAt: existing?.createdAt ?? serverReport.createdAt ?? now,
      updatedAt: serverReport.updatedAt ?? now,
    })
  }))
}

export async function enqueueReport(report: LocalFieldReport): Promise<void> {
  const now = new Date().toISOString()
  const pendingReport = { ...report, syncState: 'pending' as const, updatedAt: now }
  const outboxEntry: OutboxEntry = {
    localId: report.localId,
    ownerId: report.ownerId,
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
  }
  await putFieldRecordsAtomically([
    { storeName: fieldStores.reports, value: pendingReport },
    { storeName: fieldStores.outbox, value: outboxEntry },
  ])
}

function isReportOutboxEntry(value: unknown): value is OutboxEntry {
  return typeof value === 'object' && value !== null && !('operation' in value)
}

export async function loadOutbox(ownerId: string): Promise<OutboxEntry[]> {
  const entries = await getAllFieldRecords<unknown>(fieldStores.outbox)
  return entries
    .filter(isReportOutboxEntry)
    .filter((entry) => entry.ownerId === ownerId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export function saveOutboxEntry(entry: OutboxEntry): Promise<void> {
  return putFieldRecord(fieldStores.outbox, entry)
}

export function removeOutboxEntry(localId: string): Promise<void> {
  return deleteFieldRecord(fieldStores.outbox, localId)
}

function belongsToOwner(value: unknown, ownerId: string): boolean {
  return typeof value === 'object' && value !== null && 'ownerId' in value && value.ownerId === ownerId
}

function identityBelongsToOwner(value: unknown, ownerId: string): boolean {
  if (typeof value !== 'object' || value === null || !('value' in value)) return false
  const identity = value.value
  return typeof identity === 'object' && identity !== null && 'id' in identity && identity.id === ownerId
}

function enterpriseOperationKind(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('operation' in value)) return undefined
  const operation = value.operation
  return typeof operation === 'object' && operation !== null && 'kind' in operation && typeof operation.kind === 'string'
    ? operation.kind
    : undefined
}

export function reconcileFieldAuthorizationData(ownerId: string, permissions: readonly string[]): Promise<void> {
  const allowed = new Set(permissions)
  const filters: Array<{ storeName: string; matches: (value: unknown) => boolean }> = []
  if (!allowed.has('projects.read')) {
    filters.push({ storeName: fieldStores.projects, matches: (value) => belongsToOwner(value, ownerId) })
  }
  if (!allowed.has('fieldReports.read')) {
    filters.push({ storeName: fieldStores.reports, matches: (value) => belongsToOwner(value, ownerId) })
  } else if (!allowed.has('fieldReports.create')) {
    filters.push({
      storeName: fieldStores.reports,
      matches: (value) => belongsToOwner(value, ownerId)
        && typeof value === 'object' && value !== null && 'syncState' in value && value.syncState !== 'synced',
    })
  }
  if (!allowed.has('publications.read')) {
    filters.push({ storeName: fieldStores.publications, matches: (value) => belongsToOwner(value, ownerId) })
  }
  if (!allowed.has('tasks.read')) {
    filters.push({ storeName: fieldStores.tasks, matches: (value) => belongsToOwner(value, ownerId) })
  }
  filters.push({
    storeName: fieldStores.outbox,
    matches: (value) => {
      if (!belongsToOwner(value, ownerId)) return false
      const kind = enterpriseOperationKind(value)
      if (!kind) return !allowed.has('fieldReports.read') || !allowed.has('fieldReports.create')
      if (kind === 'publication.acknowledge') return !allowed.has('publications.read')
      if (kind === 'task.transition') return !allowed.has('tasks.read')
      return true
    },
  })
  return deleteFieldRecordsWhereAtomically(filters)
}

export function clearFieldSessionData(ownerId?: string): Promise<void> {
  if (!ownerId) {
    return clearFieldStores([
      fieldStores.identity,
      fieldStores.projects,
      fieldStores.publications,
      fieldStores.tasks,
      fieldStores.reports,
      fieldStores.outbox,
      fieldStores.legacySession,
    ])
  }

  const ownedStores = [
    fieldStores.projects,
    fieldStores.publications,
    fieldStores.tasks,
    fieldStores.reports,
    fieldStores.outbox,
  ]
  return deleteFieldRecordsWhereAtomically([
    { storeName: fieldStores.identity, matches: (value) => identityBelongsToOwner(value, ownerId) },
    ...ownedStores.map((storeName) => ({
      storeName,
      matches: (value: unknown) => belongsToOwner(value, ownerId),
    })),
    {
      storeName: fieldStores.legacySession,
      matches: (value) => {
        if (identityBelongsToOwner(value, ownerId)) return true
        return typeof value === 'object' && value !== null && 'key' in value
          && value.key === `projects:${ownerId}`
      },
    },
  ])
}

export function clearCachedIdentity(): Promise<void> {
  return deleteFieldRecord(fieldStores.identity, IDENTITY_KEY)
}
