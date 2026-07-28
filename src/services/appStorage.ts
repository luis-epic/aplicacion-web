import type {
  ActivityId,
  AppPreferences,
  CachedForecast,
  ChecklistItem,
  ItemHabit,
  OutingDraft,
  PersistedAppState,
  PersonalizationProfile,
  RecommendationResult,
  Routine,
  TransportId,
} from '../types/app'

const DATABASE_NAME = 'salida-lista'
const DATABASE_VERSION = 2
const STORE_NAME = 'app-state'
const FIELD_REPORT_STORE = 'field-reports'
const OUTBOX_STORE = 'outbox'
const SESSION_STORE = 'session-metadata'
const STATE_KEY = 'current'

let storageWriteQueue: Promise<void> = Promise.resolve()

function enqueueStorageWrite(operation: () => Promise<void>): Promise<void> {
  const queuedOperation = storageWriteQueue.then(operation, operation)
  storageWriteQueue = queuedOperation.catch(() => undefined)
  return queuedOperation
}

const activities: ActivityId[] = [
  'work',
  'university',
  'gym',
  'bike',
  'errand',
  'custom',
]
const transports: TransportId[] = ['walking', 'public', 'car', 'bike']
const categories: ChecklistItem['category'][] = [
  'Esenciales',
  'Clima',
  'Actividad',
  'Transporte',
  'Personales',
]

interface StoredRecord {
  key: string
  value: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOutingDraft(value: unknown): value is OutingDraft {
  if (!isRecord(value)) return false
  return (
    activities.includes(value.activity as ActivityId) &&
    isString(value.date) &&
    isString(value.time) &&
    isString(value.duration) &&
    transports.includes(value.transport as TransportId) &&
    (value.locationMode === 'current' || value.locationMode === 'manual') &&
    isString(value.city)
  )
}

function isChecklistItem(value: unknown): value is ChecklistItem {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    isString(value.label) &&
    isString(value.reason) &&
    categories.includes(value.category as ChecklistItem['category']) &&
    (value.priority === 'high' || value.priority === 'normal') &&
    typeof value.completed === 'boolean'
  )
}

function isRecommendation(value: unknown): value is RecommendationResult {
  if (!isRecord(value)) return false
  return (
    Array.isArray(value.items) &&
    value.items.every(isChecklistItem) &&
    Array.isArray(value.appliedRules) &&
    value.appliedRules.every(isString)
  )
}

function isRoutine(value: unknown): value is Routine {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.description) &&
    activities.includes(value.activity as ActivityId) &&
    isString(value.duration) &&
    transports.includes(value.transport as TransportId) &&
    typeof value.itemCount === 'number' &&
    isString(value.lastUsed) &&
    Array.isArray(value.customItems) &&
    value.customItems.every(isString)
  )
}

function isPreferences(value: unknown): value is AppPreferences {
  if (!isRecord(value)) return false
  return (
    isString(value.defaultCity) &&
    (value.temperatureUnit === 'celsius' || value.temperatureUnit === 'fahrenheit') &&
    typeof value.suggestions === 'boolean' &&
    typeof value.notifications === 'boolean'
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isCachedForecast(value: unknown): value is CachedForecast {
  if (!isRecord(value) || !isRecord(value.weather)) return false
  const weather = value.weather
  return (
    isFiniteNumber(weather.temperature) &&
    isFiniteNumber(weather.temperatureMax) &&
    isFiniteNumber(weather.temperatureMin) &&
    isFiniteNumber(weather.rainProbability) &&
    isFiniteNumber(weather.windSpeed) &&
    isString(weather.condition) &&
    isString(weather.sunset) &&
    (weather.source === 'live' || weather.source === 'cached' || weather.source === 'mock') &&
    isString(value.date) &&
    (value.locationMode === 'current' || value.locationMode === 'manual') &&
    isString(value.cityKey) &&
    isString(value.locationLabel) &&
    isString(value.savedAt)
  )
}

function isItemHabit(value: unknown): value is ItemHabit {
  if (!isRecord(value)) return false
  return (
    isString(value.key) &&
    activities.includes(value.activity as ActivityId) &&
    isString(value.label) &&
    categories.includes(value.category as ChecklistItem['category']) &&
    isFiniteNumber(value.addedCount) &&
    isFiniteNumber(value.removedCount) &&
    isFiniteNumber(value.completedCount) &&
    isFiniteNumber(value.pendingReviewCount) &&
    isString(value.updatedAt)
  )
}

function isPersonalizationProfile(value: unknown): value is PersonalizationProfile {
  if (!isRecord(value) || !isRecord(value.habits)) return false
  return (
    value.version === 1 &&
    isFiniteNumber(value.totalSignals) &&
    Object.values(value.habits).every(isItemHabit)
  )
}

function isPersistedState(value: unknown): value is PersistedAppState {
  if (!isRecord(value)) return false
  return (
    value.version === 1 &&
    isString(value.updatedAt) &&
    isOutingDraft(value.draft) &&
    isRecommendation(value.recommendation) &&
    Array.isArray(value.routines) &&
    value.routines.every(isRoutine) &&
    isPreferences(value.preferences) &&
    (value.cachedForecast === undefined || isCachedForecast(value.cachedForecast)) &&
    (value.personalization === undefined || isPersonalizationProfile(value.personalization))
  )
}

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('Este navegador no admite almacenamiento IndexedDB.'))
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(FIELD_REPORT_STORE)) {
        database.createObjectStore(FIELD_REPORT_STORE, { keyPath: 'localId' })
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
    request.onerror = () => reject(new Error('No pudimos abrir el almacenamiento local.'))
    request.onblocked = () => reject(new Error('El almacenamiento local está bloqueado por otra pestaña.'))
  })
}

export async function loadAppState(): Promise<PersistedAppState | null> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY)

    request.onsuccess = () => {
      const record = request.result as StoredRecord | undefined
      resolve(record && isPersistedState(record.value) ? record.value : null)
    }
    request.onerror = () => reject(new Error('No pudimos recuperar tus datos locales.'))
    transaction.oncomplete = () => database.close()
    transaction.onabort = () => reject(new Error('La lectura de datos locales fue cancelada.'))
  })
}

export function saveAppState(state: PersistedAppState): Promise<void> {
  return enqueueStorageWrite(async () => {
    const database = await openDatabase()

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put({ key: STATE_KEY, value: state })
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
      transaction.onerror = () => reject(new Error('No pudimos guardar los cambios localmente.'))
      transaction.onabort = () => reject(new Error('El guardado local fue cancelado.'))
    })
  })
}

export function clearAppState(): Promise<void> {
  return enqueueStorageWrite(async () => {
    const database = await openDatabase()
    const storeNames = Array.from(database.objectStoreNames)

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeNames, 'readwrite')
      storeNames.forEach((storeName) => transaction.objectStore(storeName).clear())
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
      transaction.onerror = () => reject(new Error('No pudimos borrar los datos locales.'))
      transaction.onabort = () => reject(new Error('El borrado local fue cancelado.'))
    })
  })
}
