export const FIELD_DATABASE_NAME = 'salida-lista'
export const FIELD_DATABASE_VERSION = 3

export const fieldStores = {
  appState: 'app-state',
  identity: 'identity',
  projects: 'projects',
  publications: 'publications',
  tasks: 'tasks',
  reports: 'field-reports',
  outbox: 'outbox',
  legacySession: 'session-metadata',
} as const

function ensureIndex(store: IDBObjectStore, name: string, keyPath: string): void {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false })
}

function migrateLegacySession(transaction: IDBTransaction): void {
  if (!transaction.db.objectStoreNames.contains(fieldStores.legacySession)) return
  const legacy = transaction.objectStore(fieldStores.legacySession)
  const identity = transaction.objectStore(fieldStores.identity)
  const projects = transaction.objectStore(fieldStores.projects)

  legacy.openCursor().onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
    if (!cursor) return
    const record = cursor.value as { key?: string; value?: unknown; updatedAt?: string }
    if (record.key === 'identity' && record.value) {
      identity.put({ key: 'current', value: record.value, updatedAt: record.updatedAt })
    } else if (record.key?.startsWith('projects:') && Array.isArray(record.value)) {
      const ownerId = record.key.slice('projects:'.length)
      projects.put({ key: ownerId, ownerId, items: record.value, updatedAt: record.updatedAt })
    }
    cursor.continue()
  }
}

export function openFieldDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('Este navegador no admite almacenamiento IndexedDB.'))
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(FIELD_DATABASE_NAME, FIELD_DATABASE_VERSION)
    request.onupgradeneeded = (event) => {
      const database = request.result
      const transaction = request.transaction
      if (!transaction) return

      if (!database.objectStoreNames.contains(fieldStores.appState)) {
        database.createObjectStore(fieldStores.appState, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(fieldStores.identity)) {
        database.createObjectStore(fieldStores.identity, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(fieldStores.projects)) {
        const store = database.createObjectStore(fieldStores.projects, { keyPath: 'key' })
        ensureIndex(store, 'ownerId', 'ownerId')
      }
      if (!database.objectStoreNames.contains(fieldStores.publications)) {
        const store = database.createObjectStore(fieldStores.publications, { keyPath: 'key' })
        ensureIndex(store, 'ownerId', 'ownerId')
      }
      if (!database.objectStoreNames.contains(fieldStores.tasks)) {
        const store = database.createObjectStore(fieldStores.tasks, { keyPath: 'key' })
        ensureIndex(store, 'ownerId', 'ownerId')
      }
      if (!database.objectStoreNames.contains(fieldStores.reports)) {
        const store = database.createObjectStore(fieldStores.reports, { keyPath: 'localId' })
        ensureIndex(store, 'ownerId', 'ownerId')
      } else {
        ensureIndex(transaction.objectStore(fieldStores.reports), 'ownerId', 'ownerId')
      }
      if (!database.objectStoreNames.contains(fieldStores.outbox)) {
        const store = database.createObjectStore(fieldStores.outbox, { keyPath: 'localId' })
        ensureIndex(store, 'ownerId', 'ownerId')
        ensureIndex(store, 'nextAttemptAt', 'nextAttemptAt')
      } else {
        const store = transaction.objectStore(fieldStores.outbox)
        ensureIndex(store, 'ownerId', 'ownerId')
        ensureIndex(store, 'nextAttemptAt', 'nextAttemptAt')
      }
      if (!database.objectStoreNames.contains(fieldStores.legacySession)) {
        database.createObjectStore(fieldStores.legacySession, { keyPath: 'key' })
      }

      if (event.oldVersion < 3) migrateLegacySession(transaction)
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => reject(new Error('No pudimos abrir el almacenamiento operativo.'))
    request.onblocked = () => reject(new Error('Cierra otras pestañas para actualizar el almacenamiento local.'))
  })
}

export async function getFieldRecord<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const database = await openFieldDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(new Error('No pudimos leer los datos locales.'))
    transaction.oncomplete = () => database.close()
    transaction.onabort = () => reject(new Error('La lectura local fue cancelada.'))
  })
}

export async function getAllFieldRecords<T>(storeName: string): Promise<T[]> {
  const database = await openFieldDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(new Error('No pudimos listar los datos locales.'))
    transaction.oncomplete = () => database.close()
    transaction.onabort = () => reject(new Error('La lectura local fue cancelada.'))
  })
}

export async function putFieldRecord<T>(storeName: string, value: T): Promise<void> {
  const database = await openFieldDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(value)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(new Error('No pudimos guardar los datos locales.'))
    transaction.onabort = () => reject(new Error('El guardado local fue cancelado.'))
  })
}

export async function deleteFieldRecord(storeName: string, key: IDBValidKey): Promise<void> {
  const database = await openFieldDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).delete(key)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(new Error('No pudimos actualizar los datos locales.'))
    transaction.onabort = () => reject(new Error('La actualización local fue cancelada.'))
  })
}

export async function clearFieldStores(storeNames: string[]): Promise<void> {
  const database = await openFieldDatabase()
  const existing = storeNames.filter((name) => database.objectStoreNames.contains(name))
  if (!existing.length) {
    database.close()
    return
  }
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(existing, 'readwrite')
    existing.forEach((name) => transaction.objectStore(name).clear())
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(new Error('No pudimos limpiar los datos locales.'))
    transaction.onabort = () => reject(new Error('La limpieza local fue cancelada.'))
  })
}

export interface FieldRecordFilter {
  storeName: string
  matches: (value: unknown) => boolean
}

export async function deleteFieldRecordsWhereAtomically(filters: FieldRecordFilter[]): Promise<void> {
  if (!filters.length) return
  const database = await openFieldDatabase()
  const filtersByStore = new Map<string, Array<(value: unknown) => boolean>>()
  filters.forEach(({ storeName, matches }) => {
    if (!database.objectStoreNames.contains(storeName)) return
    const storeFilters = filtersByStore.get(storeName) ?? []
    storeFilters.push(matches)
    filtersByStore.set(storeName, storeFilters)
  })
  const storeNames = [...filtersByStore.keys()]
  if (!storeNames.length) {
    database.close()
    return
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, 'readwrite')
    storeNames.forEach((storeName) => {
      const request = transaction.objectStore(storeName).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if (filtersByStore.get(storeName)?.some((matches) => matches(cursor.value))) cursor.delete()
        cursor.continue()
      }
      request.onerror = () => transaction.abort()
    })
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(new Error('No pudimos revocar los datos locales de forma atómica.'))
    transaction.onabort = () => reject(new Error('La revocación local fue cancelada sin aplicar cambios parciales.'))
  })
}

export interface FieldRecordWrite {
  storeName: string
  value: unknown
}

export interface FieldRecordDelete {
  storeName: string
  key: IDBValidKey
}

export async function mutateFieldRecordsAtomically(
  writes: FieldRecordWrite[],
  deletions: FieldRecordDelete[] = [],
): Promise<void> {
  if (!writes.length && !deletions.length) return
  const database = await openFieldDatabase()
  const storeNames = [...new Set([
    ...writes.map((write) => write.storeName),
    ...deletions.map((deletion) => deletion.storeName),
  ])]
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, 'readwrite')
    writes.forEach((write) => transaction.objectStore(write.storeName).put(write.value))
    deletions.forEach((deletion) => transaction.objectStore(deletion.storeName).delete(deletion.key))
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(new Error('No pudimos guardar la operación de forma atómica.'))
    transaction.onabort = () => reject(new Error('La operación local fue cancelada sin aplicar cambios parciales.'))
  })
}

export function putFieldRecordsAtomically(writes: FieldRecordWrite[]): Promise<void> {
  return mutateFieldRecordsAtomically(writes)
}
