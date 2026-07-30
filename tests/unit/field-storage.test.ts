import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FIELD_DATABASE_NAME,
  FIELD_DATABASE_VERSION,
  fieldStores,
  getAllFieldRecords,
  openFieldDatabase,
  putFieldRecord,
} from '../../src/services/fieldDatabase'
import {
  clearFieldSessionData,
  reconcileFieldAuthorizationData,
} from '../../src/services/fieldReportStorage'
import {
  cachePublications,
  cacheTasks,
  enqueuePublicationAcknowledgement,
  enqueueTaskTransition,
  loadCachedPublications,
  loadCachedTasks,
  loadEnterpriseOutbox,
  removeEnterpriseOutboxEntry,
  saveCachedPublication,
  saveCachedTask,
  saveEnterpriseOutboxEntry,
} from '../../src/services/enterpriseStorage'
import type { CachedPublication, PublicationView, WorkTaskView } from '../../src/types/enterprise'

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(FIELD_DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('No se pudo limpiar IndexedDB.'))
    request.onblocked = () => reject(new Error('IndexedDB quedó bloqueada por una conexión abierta.'))
  })
}

function publication(id: string, title = id): PublicationView {
  const now = '2026-07-29T12:00:00.000Z'
  return {
    id,
    title,
    slug: id,
    summary: `Resumen ${title}`,
    content: `Contenido ${title}`,
    coverImageUrl: null,
    type: 'NEWS',
    category: 'OPERATIONS',
    status: 'PUBLISHED',
    priority: 'NORMAL',
    audience: 'ALL',
    audienceRoleCode: null,
    projectId: null,
    projectCode: null,
    projectName: null,
    authorId: 'author-1',
    authorName: 'Autora',
    reviewerId: null,
    reviewerName: null,
    scheduledAt: null,
    publishedAt: now,
    expiresAt: null,
    acknowledgementCount: 0,
    generatedTaskCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function task(id: string): WorkTaskView {
  const now = '2026-07-29T12:00:00.000Z'
  return {
    id,
    projectId: null,
    projectCode: null,
    projectName: null,
    title: `Tarea ${id}`,
    description: null,
    status: 'PENDING',
    priority: 'NORMAL',
    recurrence: 'NONE',
    creatorId: 'creator-1',
    creatorName: 'Creador',
    assigneeId: 'owner-a',
    assigneeName: 'Operador',
    supervisorId: null,
    supervisorName: null,
    sourcePublicationId: null,
    idempotencyKey: null,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    estimatedMinutes: null,
    createdAt: now,
    updatedAt: now,
    checklist: [],
    comments: [],
  }
}

beforeEach(deleteDatabase)
afterEach(deleteDatabase)

describe('IndexedDB operativo v3', () => {
  it('creates every required store and index at the expected schema version', async () => {
    const database = await openFieldDatabase()
    expect(database.version).toBe(FIELD_DATABASE_VERSION)
    expect([...database.objectStoreNames]).toEqual(expect.arrayContaining(Object.values(fieldStores)))
    const transaction = database.transaction([fieldStores.outbox, fieldStores.reports], 'readonly')
    expect([...transaction.objectStore(fieldStores.outbox).indexNames]).toEqual(expect.arrayContaining(['ownerId', 'nextAttemptAt']))
    expect([...transaction.objectStore(fieldStores.reports).indexNames]).toContain('ownerId')
    database.close()
  })

  it('atomically persists optimistic acknowledgement and one deterministic outbox operation', async () => {
    const item: CachedPublication = publication('publication-1')
    await enqueuePublicationAcknowledgement('owner-a', item)
    await enqueuePublicationAcknowledgement('owner-a', { ...item, summary: 'Segundo intento' })

    expect(await loadCachedPublications('owner-a')).toEqual([
      expect.objectContaining({ id: item.id, pendingAcknowledgement: true, summary: 'Segundo intento' }),
    ])
    expect(await loadEnterpriseOutbox('owner-a')).toEqual([
      expect.objectContaining({
        localId: 'ack:owner-a:publication-1',
        ownerId: 'owner-a',
        operation: { kind: 'publication.acknowledge', publicationId: 'publication-1' },
      }),
    ])
  })

  it('isolates publication caches by owner and only prunes records not protected by outbox', async () => {
    await cachePublications('owner-a', [publication('keep'), publication('pending')])
    await cachePublications('owner-b', [publication('private-b')])
    const pending = (await loadCachedPublications('owner-a')).find((item) => item.id === 'pending')
    expect(pending).toBeDefined()
    await enqueuePublicationAcknowledgement('owner-a', pending!)

    await cachePublications('owner-a', [publication('keep', 'Actualizado')])
    expect((await loadCachedPublications('owner-a')).map((item) => item.id).sort()).toEqual(['keep', 'pending'])
    expect((await loadCachedPublications('owner-b')).map((item) => item.id)).toEqual(['private-b'])

    await removeEnterpriseOutboxEntry('ack:owner-a:pending')
    await cachePublications('owner-a', [publication('keep', 'Actualizado')])
    expect((await loadCachedPublications('owner-a')).map((item) => item.id)).toEqual(['keep'])
    expect((await loadCachedPublications('owner-b')).map((item) => item.id)).toEqual(['private-b'])
  })

  it('protects optimistic task transitions from snapshot pruning until synchronization completes', async () => {
    const pendingTask = { ...task('task-1'), status: 'IN_PROGRESS' as const, pendingTransition: 'start' as const }
    await cacheTasks('owner-a', [task('task-1')])
    await enqueueTaskTransition('owner-a', pendingTask, {
      kind: 'task.transition',
      taskId: 'task-1',
      transition: 'start',
    })
    const [entry] = await loadEnterpriseOutbox('owner-a')
    expect(entry).toBeDefined()

    await cacheTasks('owner-a', [])
    expect(await loadCachedTasks('owner-a')).toEqual([expect.objectContaining({ id: 'task-1', pendingTransition: 'start' })])

    await removeEnterpriseOutboxEntry(entry.localId)
    await cacheTasks('owner-a', [])
    expect(await loadCachedTasks('owner-a')).toEqual([])
    expect(await getAllFieldRecords(fieldStores.outbox)).toEqual([])
  })

  it('persists direct cache updates and retry metadata for synchronized enterprise operations', async () => {
    const now = '2026-07-29T12:00:00.000Z'
    await saveCachedPublication('owner-a', { ...publication('direct-publication'), acknowledgedAt: now })
    await saveCachedTask('owner-a', { ...task('direct-task'), syncError: 'Revisión manual' })
    await saveEnterpriseOutboxEntry({
      localId: 'retry-operation',
      ownerId: 'owner-a',
      operation: { kind: 'publication.acknowledge', publicationId: 'direct-publication' },
      attempts: 2,
      nextAttemptAt: now,
      createdAt: now,
      lastError: 'Temporal',
    })

    expect(await loadCachedPublications('owner-a')).toEqual([
      expect.objectContaining({ id: 'direct-publication', acknowledgedAt: now }),
    ])
    expect(await loadCachedTasks('owner-a')).toEqual([
      expect.objectContaining({ id: 'direct-task', syncError: 'Revisión manual' }),
    ])
    expect(await loadEnterpriseOutbox('owner-a')).toEqual([
      expect.objectContaining({ localId: 'retry-operation', attempts: 2, lastError: 'Temporal' }),
    ])
  })

  it('supports primitive CRUD, atomic multi-store mutation and selective clearing', async () => {
    const storage = await import('../../src/services/fieldDatabase')
    await storage.putFieldRecord(fieldStores.appState, { key: 'one', value: 1 })
    expect(await storage.getFieldRecord(fieldStores.appState, 'one')).toEqual({ key: 'one', value: 1 })
    expect(await storage.getFieldRecord(fieldStores.appState, 'missing')).toBeUndefined()

    await storage.putFieldRecordsAtomically([
      { storeName: fieldStores.appState, value: { key: 'two', value: 2 } },
      { storeName: fieldStores.identity, value: { key: 'current', value: { id: 'owner-a' } } },
    ])
    await storage.mutateFieldRecordsAtomically(
      [{ storeName: fieldStores.appState, value: { key: 'three', value: 3 } }],
      [{ storeName: fieldStores.appState, key: 'one' }],
    )
    expect((await storage.getAllFieldRecords<{ key: string }>(fieldStores.appState)).map((item) => item.key).sort())
      .toEqual(['three', 'two'])

    await storage.deleteFieldRecord(fieldStores.appState, 'two')
    expect(await storage.getFieldRecord(fieldStores.appState, 'two')).toBeUndefined()
    await storage.clearFieldStores([fieldStores.appState, fieldStores.identity, 'store-that-does-not-exist'])
    expect(await storage.getAllFieldRecords(fieldStores.appState)).toEqual([])
    expect(await storage.getAllFieldRecords(fieldStores.identity)).toEqual([])
    await storage.clearFieldStores(['store-that-does-not-exist'])
    await storage.mutateFieldRecordsAtomically([])
  })

  it('purges revoked owner data atomically without deleting another user or still-authorized caches', async () => {
    await putFieldRecord(fieldStores.identity, { key: 'current', value: { id: 'owner-a' } })
    await putFieldRecord(fieldStores.projects, { key: 'owner-a', ownerId: 'owner-a', items: [] })
    await putFieldRecord(fieldStores.projects, { key: 'owner-b', ownerId: 'owner-b', items: [] })
    await cachePublications('owner-a', [publication('private-a')])
    await cachePublications('owner-b', [publication('private-b')])
    await cacheTasks('owner-a', [task('task-a')])
    await cacheTasks('owner-b', [task('task-b')])
    await putFieldRecord(fieldStores.reports, { localId: 'pending-a', ownerId: 'owner-a', syncState: 'pending' })
    await putFieldRecord(fieldStores.reports, { localId: 'synced-a', ownerId: 'owner-a', syncState: 'synced' })
    await putFieldRecord(fieldStores.reports, { localId: 'pending-b', ownerId: 'owner-b', syncState: 'pending' })
    await putFieldRecord(fieldStores.outbox, {
      localId: 'publication-a', ownerId: 'owner-a', operation: { kind: 'publication.acknowledge' },
    })
    await putFieldRecord(fieldStores.outbox, {
      localId: 'task-a', ownerId: 'owner-a', operation: { kind: 'task.transition' },
    })
    await putFieldRecord(fieldStores.outbox, { localId: 'report-a', ownerId: 'owner-a' })
    await putFieldRecord(fieldStores.outbox, { localId: 'report-b', ownerId: 'owner-b' })

    await reconcileFieldAuthorizationData('owner-a', ['fieldReports.read', 'tasks.read'])

    expect((await getAllFieldRecords<{ ownerId: string }>(fieldStores.projects)).map((item) => item.ownerId)).toEqual(['owner-b'])
    expect(await loadCachedPublications('owner-a')).toEqual([])
    expect((await loadCachedPublications('owner-b')).map((item) => item.id)).toEqual(['private-b'])
    expect((await loadCachedTasks('owner-a')).map((item) => item.id)).toEqual(['task-a'])
    expect((await getAllFieldRecords<{ localId: string }>(fieldStores.reports)).map((item) => item.localId).sort())
      .toEqual(['pending-b', 'synced-a'])
    expect((await getAllFieldRecords<{ localId: string }>(fieldStores.outbox)).map((item) => item.localId).sort())
      .toEqual(['report-b', 'task-a'])

    await clearFieldSessionData('owner-a')
    expect(await getAllFieldRecords(fieldStores.identity)).toEqual([])
    expect(await loadCachedTasks('owner-a')).toEqual([])
    expect((await loadCachedTasks('owner-b')).map((item) => item.id)).toEqual(['task-b'])
    expect((await getAllFieldRecords<{ ownerId: string }>(fieldStores.reports)).map((item) => item.ownerId)).toEqual(['owner-b'])
    expect((await getAllFieldRecords<{ ownerId: string }>(fieldStores.outbox)).map((item) => item.ownerId)).toEqual(['owner-b'])
  })

  it('migrates legacy identity and project snapshots when upgrading to schema v3', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(FIELD_DATABASE_NAME, 2)
      request.onupgradeneeded = () => {
        const database = request.result
        database.createObjectStore(fieldStores.identity, { keyPath: 'key' })
        database.createObjectStore(fieldStores.projects, { keyPath: 'key' })
        database.createObjectStore(fieldStores.legacySession, { keyPath: 'key' })
      }
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction(fieldStores.legacySession, 'readwrite')
        const store = transaction.objectStore(fieldStores.legacySession)
        store.put({ key: 'identity', value: { id: 'legacy-owner' }, updatedAt: '2026-07-01T00:00:00.000Z' })
        store.put({ key: 'projects:legacy-owner', value: [{ id: 'legacy-project' }], updatedAt: '2026-07-01T00:00:00.000Z' })
        store.put({ key: 'ignored', value: 'not-migrated' })
        transaction.oncomplete = () => { database.close(); resolve() }
        transaction.onerror = () => reject(transaction.error)
      }
      request.onerror = () => reject(request.error)
    })

    const upgraded = await openFieldDatabase()
    upgraded.close()
    const storage = await import('../../src/services/fieldDatabase')
    expect(await storage.getFieldRecord(fieldStores.identity, 'current')).toEqual(expect.objectContaining({
      key: 'current',
      value: { id: 'legacy-owner' },
    }))
    expect(await storage.getFieldRecord(fieldStores.projects, 'legacy-owner')).toEqual(expect.objectContaining({
      ownerId: 'legacy-owner',
      items: [{ id: 'legacy-project' }],
    }))
  })
})
