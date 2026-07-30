import { deleteFieldRecord, fieldStores, getAllFieldRecords, openFieldDatabase, putFieldRecord, putFieldRecordsAtomically } from './fieldDatabase'
import type {
  CachedPublication,
  EnterpriseOperation,
  EnterpriseOutboxEntry,
  PublicationView,
  WorkTaskView,
} from '../types/enterprise'

interface PublicationRecord {
  key: string
  ownerId: string
  value: CachedPublication
  updatedAt: string
}

interface TaskRecord {
  key: string
  ownerId: string
  value: WorkTaskView
  updatedAt: string
}

function publicationKey(ownerId: string, publicationId: string): string {
  return `${ownerId}:${publicationId}`
}

function taskKey(ownerId: string, taskId: string): string {
  return `${ownerId}:${taskId}`
}

interface OwnedCacheRecord<T extends { id: string }> {
  key: string
  ownerId: string
  value: T
  updatedAt: string
}

async function replaceOwnerSnapshot<TRemote extends { id: string }, TLocal extends { id: string }>(
  storeName: string,
  ownerId: string,
  incoming: TRemote[],
  merge: (remote: TRemote, local: TLocal | undefined) => TLocal,
  protects: (entry: EnterpriseOutboxEntry, id: string) => boolean,
): Promise<void> {
  const database = await openFieldDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName, fieldStores.outbox], 'readwrite')
    const cacheStore = transaction.objectStore(storeName)
    const cacheRequest = cacheStore.getAll()
    const outboxRequest = transaction.objectStore(fieldStores.outbox).getAll()
    let cachedRecords: OwnedCacheRecord<TLocal>[] | undefined
    let outboxEntries: EnterpriseOutboxEntry[] | undefined
    let applied = false

    const applySnapshot = () => {
      if (applied || !cachedRecords || !outboxEntries) return
      applied = true
      const ownerRecords = cachedRecords.filter((record) => record.ownerId === ownerId)
      const existing = new Map(ownerRecords.map((record) => [record.value.id, record.value]))
      const ownerOutbox = outboxEntries.filter((entry) => entry.ownerId === ownerId && isEnterpriseOutboxEntry(entry))
      const protectedIds = new Set(ownerRecords
        .map((record) => record.value.id)
        .filter((id) => ownerOutbox.some((entry) => protects(entry, id))))
      const incomingIds = new Set(incoming.map((item) => item.id))
      const now = new Date().toISOString()

      incoming.forEach((remote) => cacheStore.put({
        key: `${ownerId}:${remote.id}`,
        ownerId,
        value: merge(remote, existing.get(remote.id)),
        updatedAt: now,
      } satisfies OwnedCacheRecord<TLocal>))
      ownerRecords
        .filter((record) => !incomingIds.has(record.value.id) && !protectedIds.has(record.value.id))
        .forEach((record) => cacheStore.delete(record.key))
    }

    cacheRequest.onsuccess = () => {
      cachedRecords = cacheRequest.result as OwnedCacheRecord<TLocal>[]
      applySnapshot()
    }
    outboxRequest.onsuccess = () => {
      outboxEntries = (outboxRequest.result as unknown[]).filter(isEnterpriseOutboxEntry)
      applySnapshot()
    }
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(new Error('No pudimos reemplazar la caché operativa.'))
    transaction.onabort = () => reject(new Error('La actualización de caché fue cancelada sin cambios parciales.'))
  })
}

export async function loadCachedPublications(ownerId: string): Promise<CachedPublication[]> {
  const records = await getAllFieldRecords<PublicationRecord>(fieldStores.publications)
  return records
    .filter((record) => record.ownerId === ownerId)
    .map((record) => record.value)
    .sort((left, right) => (right.publishedAt ?? right.createdAt).localeCompare(left.publishedAt ?? left.createdAt))
}

export function cachePublications(ownerId: string, publications: PublicationView[]): Promise<void> {
  return replaceOwnerSnapshot<PublicationView, CachedPublication>(
    fieldStores.publications,
    ownerId,
    publications,
    (publication, local) => ({
      ...publication,
      acknowledgedAt: local?.acknowledgedAt,
      pendingAcknowledgement: local?.pendingAcknowledgement,
      acknowledgementError: local?.acknowledgementError,
    }),
    (entry, id) => entry.operation.kind === 'publication.acknowledge' && entry.operation.publicationId === id,
  )
}

export async function saveCachedPublication(ownerId: string, publication: CachedPublication): Promise<void> {
  await putFieldRecord(fieldStores.publications, {
    key: publicationKey(ownerId, publication.id),
    ownerId,
    value: publication,
    updatedAt: new Date().toISOString(),
  } satisfies PublicationRecord)
}

export async function loadCachedTasks(ownerId: string): Promise<WorkTaskView[]> {
  const records = await getAllFieldRecords<TaskRecord>(fieldStores.tasks)
  return records
    .filter((record) => record.ownerId === ownerId)
    .map((record) => record.value)
    .sort((left, right) => {
      if (!left.dueAt) return 1
      if (!right.dueAt) return -1
      return left.dueAt.localeCompare(right.dueAt)
    })
}

export function cacheTasks(ownerId: string, tasks: WorkTaskView[]): Promise<void> {
  return replaceOwnerSnapshot<WorkTaskView, WorkTaskView>(
    fieldStores.tasks,
    ownerId,
    tasks,
    (task, local) => ({
      ...task,
      pendingTransition: local?.pendingTransition,
      syncError: local?.syncError,
    }),
    (entry, id) => entry.operation.kind === 'task.transition' && entry.operation.taskId === id,
  )
}

export async function saveCachedTask(ownerId: string, task: WorkTaskView): Promise<void> {
  await putFieldRecord(fieldStores.tasks, {
    key: taskKey(ownerId, task.id),
    ownerId,
    value: task,
    updatedAt: new Date().toISOString(),
  } satisfies TaskRecord)
}

function isEnterpriseOutboxEntry(value: unknown): value is EnterpriseOutboxEntry {
  return typeof value === 'object' && value !== null && 'operation' in value
}

export async function loadEnterpriseOutbox(ownerId: string): Promise<EnterpriseOutboxEntry[]> {
  const entries = await getAllFieldRecords<unknown>(fieldStores.outbox)
  return entries
    .filter(isEnterpriseOutboxEntry)
    .filter((entry) => entry.ownerId === ownerId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export function saveEnterpriseOutboxEntry(entry: EnterpriseOutboxEntry): Promise<void> {
  return putFieldRecord(fieldStores.outbox, entry)
}

export function removeEnterpriseOutboxEntry(localId: string): Promise<void> {
  return deleteFieldRecord(fieldStores.outbox, localId)
}

export async function enqueuePublicationAcknowledgement(
  ownerId: string,
  publication: CachedPublication,
): Promise<void> {
  const now = new Date().toISOString()
  const optimistic: CachedPublication = {
    ...publication,
    pendingAcknowledgement: true,
    acknowledgementError: undefined,
  }
  const entry: EnterpriseOutboxEntry = {
    localId: `ack:${ownerId}:${publication.id}`,
    ownerId,
    operation: { kind: 'publication.acknowledge', publicationId: publication.id },
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
  }
  await putFieldRecordsAtomically([
    {
      storeName: fieldStores.publications,
      value: {
        key: publicationKey(ownerId, publication.id),
        ownerId,
        value: optimistic,
        updatedAt: now,
      } satisfies PublicationRecord,
    },
    { storeName: fieldStores.outbox, value: entry },
  ])
}

export async function enqueueTaskTransition(
  ownerId: string,
  task: WorkTaskView,
  operation: Extract<EnterpriseOperation, { kind: 'task.transition' }>,
): Promise<void> {
  const now = new Date().toISOString()
  const entry: EnterpriseOutboxEntry = {
    localId: crypto.randomUUID(),
    ownerId,
    operation,
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
  }
  await putFieldRecordsAtomically([
    {
      storeName: fieldStores.tasks,
      value: {
        key: taskKey(ownerId, task.id),
        ownerId,
        value: task,
        updatedAt: now,
      } satisfies TaskRecord,
    },
    { storeName: fieldStores.outbox, value: entry },
  ])
}
