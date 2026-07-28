import type {
  FieldProject,
  LocalFieldReport,
  OutboxEntry,
  ServerFieldReport,
  SessionIdentity,
} from '../types/fieldReports'

const DATABASE_NAME = 'salida-lista'
const DATABASE_VERSION = 2
const REPORT_STORE = 'field-reports'
const OUTBOX_STORE = 'outbox'
const SESSION_STORE = 'session-metadata'
const APP_STATE_STORE = 'app-state'
const IDENTITY_KEY = 'identity'

interface MetadataRecord<T> {
  key: string
  value: T
  updatedAt: string
}

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('Este navegador no admite almacenamiento IndexedDB.'))
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(APP_STATE_STORE)) {
        database.createObjectStore(APP_STATE_STORE, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(REPORT_STORE)) {
        database.createObjectStore(REPORT_STORE, { keyPath: 'localId' })
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        database.createObjectStore(OUTBOX_STORE, { keyPath: 'localId' })
      }
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => reject(new Error('No pudimos abrir los datos de reportes de campo.'))
    request.onblocked = () => reject(new Error('Cierra otras pestañas para actualizar el almacenamiento local.'))
  })
}

async function getRecord<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(new Error('No pudimos leer los datos locales de campo.'))
    transaction.oncomplete = () => database.close()
    transaction.onabort = () => reject(new Error('La lectura local fue cancelada.'))
  })
}

async function getAllRecords<T>(storeName: string): Promise<T[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(new Error('No pudimos listar los datos locales de campo.'))
    transaction.oncomplete = () => database.close()
    transaction.onabort = () => reject(new Error('La lectura local fue cancelada.'))
  })
}

async function putRecord<T>(storeName: string, value: T): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(value)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(new Error('No pudimos guardar los datos de campo.'))
    transaction.onabort = () => reject(new Error('El guardado local fue cancelado.'))
  })
}

export async function loadCachedIdentity(): Promise<SessionIdentity | null> {
  const record = await getRecord<MetadataRecord<SessionIdentity>>(SESSION_STORE, IDENTITY_KEY)
  return record?.value ?? null
}

export function cacheIdentity(identity: SessionIdentity): Promise<void> {
  return putRecord(SESSION_STORE, {
    key: IDENTITY_KEY,
    value: identity,
    updatedAt: new Date().toISOString(),
  } satisfies MetadataRecord<SessionIdentity>)
}

function projectsKey(ownerId: string): string {
  return `projects:${ownerId}`
}

export async function loadCachedProjects(ownerId: string): Promise<FieldProject[]> {
  const record = await getRecord<MetadataRecord<FieldProject[]>>(SESSION_STORE, projectsKey(ownerId))
  return record?.value ?? []
}

export function cacheProjects(ownerId: string, projects: FieldProject[]): Promise<void> {
  return putRecord(SESSION_STORE, {
    key: projectsKey(ownerId),
    value: projects,
    updatedAt: new Date().toISOString(),
  } satisfies MetadataRecord<FieldProject[]>)
}

export async function loadFieldReports(ownerId: string): Promise<LocalFieldReport[]> {
  const reports = await getAllRecords<LocalFieldReport>(REPORT_STORE)
  return reports
    .filter((report) => report.ownerId === ownerId)
    .sort((left, right) => right.payload.reportDate.localeCompare(left.payload.reportDate))
}

export function saveFieldReport(report: LocalFieldReport): Promise<void> {
  return putRecord(REPORT_STORE, report)
}

export async function cacheServerReports(
  ownerId: string,
  serverReports: ServerFieldReport[],
): Promise<void> {
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
  await saveFieldReport({ ...report, syncState: 'pending', updatedAt: now })
  await putRecord(OUTBOX_STORE, {
    localId: report.localId,
    ownerId: report.ownerId,
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
  } satisfies OutboxEntry)
}

export async function loadOutbox(ownerId: string): Promise<OutboxEntry[]> {
  const entries = await getAllRecords<OutboxEntry>(OUTBOX_STORE)
  return entries
    .filter((entry) => entry.ownerId === ownerId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export function saveOutboxEntry(entry: OutboxEntry): Promise<void> {
  return putRecord(OUTBOX_STORE, entry)
}

export async function removeOutboxEntry(localId: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OUTBOX_STORE, 'readwrite')
    transaction.objectStore(OUTBOX_STORE).delete(localId)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(new Error('No pudimos actualizar la cola local.'))
    transaction.onabort = () => reject(new Error('La actualización de la cola fue cancelada.'))
  })
}

export async function clearFieldSessionData(): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [REPORT_STORE, OUTBOX_STORE, SESSION_STORE],
      'readwrite',
    )
    transaction.objectStore(REPORT_STORE).clear()
    transaction.objectStore(OUTBOX_STORE).clear()
    transaction.objectStore(SESSION_STORE).clear()
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(new Error('No pudimos limpiar los datos operativos.'))
    transaction.onabort = () => reject(new Error('La limpieza de datos fue cancelada.'))
  })
}
