export type PageId = 'home' | 'publications' | 'tasks' | 'reports' | 'checklist' | 'routines' | 'settings' | 'rain' | 'earthquakes'

export type IconName =
  | 'home'
  | 'checklist'
  | 'routines'
  | 'settings'
  | 'briefcase'
  | 'book'
  | 'activity'
  | 'bike'
  | 'shopping'
  | 'sparkles'
  | 'location'
  | 'weather'
  | 'clock'
  | 'arrow'
  | 'plus'
  | 'share'
  | 'check'
  | 'edit'
  | 'trash'
  | 'microphone'
  | 'bell'
  | 'shield'
  | 'earthquake'

export type ActivityId =
  | 'work'
  | 'university'
  | 'gym'
  | 'bike'
  | 'errand'
  | 'custom'

export type TransportId = 'walking' | 'public' | 'car' | 'bike'

export interface ActivityOption {
  id: ActivityId
  label: string
  description: string
  icon: IconName
}

export interface OutingDraft {
  activity: ActivityId
  date: string
  time: string
  duration: string
  transport: TransportId
  locationMode: 'current' | 'manual'
  city: string
}

export type RequestStatus = 'idle' | 'loading' | 'success' | 'error'

export interface ResolvedLocation {
  latitude: number
  longitude: number
  name: string
  accuracyMeters?: number
  detail?: string
  source: 'device' | 'search'
}

export interface LocationState {
  status: RequestStatus
  location?: ResolvedLocation
  message?: string
}

export interface WeatherState {
  status: RequestStatus
  weather?: WeatherContext
  message?: string
}

export interface WeatherContext {
  temperature: number
  temperatureMax: number
  temperatureMin: number
  rainProbability: number
  windSpeed: number
  condition: string
  sunset: string
  source: 'mock' | 'live' | 'cached'
}

export interface RecommendationResult {
  items: ChecklistItem[]
  appliedRules: string[]
}

export interface ChecklistItem {
  id: string
  label: string
  reason: string
  category: 'Esenciales' | 'Clima' | 'Actividad' | 'Transporte' | 'Personales'
  priority: 'high' | 'normal'
  completed: boolean
}

export type StorageStatus = 'loading' | 'saving' | 'saved' | 'error'

export type NotificationPermissionState = NotificationPermission | 'unsupported'
export type ShareOutcome = 'shared' | 'copied' | 'cancelled'

export interface AppPreferences {
  defaultCity: string
  temperatureUnit: 'celsius' | 'fahrenheit'
  suggestions: boolean
  notifications: boolean
}

export interface CachedForecast {
  weather: WeatherContext
  date: string
  locationMode: OutingDraft['locationMode']
  cityKey: string
  locationLabel: string
  savedAt: string
}

export interface ItemHabit {
  key: string
  activity: ActivityId
  label: string
  category: ChecklistItem['category']
  addedCount: number
  removedCount: number
  completedCount: number
  pendingReviewCount: number
  updatedAt: string
}

export interface PersonalizationProfile {
  version: 1
  habits: Record<string, ItemHabit>
  totalSignals: number
}

export interface PersistedAppState {
  version: 1
  updatedAt: string
  draft: OutingDraft
  recommendation: RecommendationResult
  routines: Routine[]
  preferences: AppPreferences
  cachedForecast?: CachedForecast
  personalization?: PersonalizationProfile
}

export interface Routine {
  id: string
  name: string
  description: string
  activity: ActivityId
  duration: string
  transport: TransportId
  itemCount: number
  lastUsed: string
  customItems: string[]
}
