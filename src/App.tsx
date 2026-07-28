import { useEffect, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { initialDraft, initialPreferences, routines as initialRoutines } from './data/mockData'
import { generateChecklist } from './domain/recommendationEngine'
import {
  createEmptyProfile,
  personalizeRecommendation,
  recordHabitSignal,
  recordPendingSignals,
} from './domain/personalizationEngine'
import { ChecklistPage } from './pages/ChecklistPage'
import { EarthquakePage } from './pages/EarthquakePage'
import { HomePage } from './pages/HomePage'
import { RainMapPage } from './pages/RainMapPage'
import { RoutinesPage } from './pages/RoutinesPage'
import { SettingsPage } from './pages/SettingsPage'
import { clearAppState, loadAppState, saveAppState } from './services/appStorage'
import {
  getNotificationPermission,
  requestNotificationPermission,
  showChecklistNotification,
} from './services/browserFeatures'
import { requestCurrentLocation } from './services/browserLocation'
import { fetchForecast, searchCity } from './services/weatherApi'
import type {
  AppPreferences,
  CachedForecast,
  LocationState,
  NotificationPermissionState,
  OutingDraft,
  PageId,
  PersistedAppState,
  PersonalizationProfile,
  RecommendationResult,
  Routine,
  StorageStatus,
  WeatherContext,
  WeatherState,
} from './types/app'
import './App.css'

const pageHash: Record<PageId, string> = {
  home: 'inicio',
  checklist: 'lista',
  routines: 'rutinas',
  settings: 'ajustes',
  rain: 'mapa-lluvia',
  earthquakes: 'sismos-cercanos',
}

const pageTitle: Record<PageId, string> = {
  home: 'Inicio',
  checklist: 'Mi lista',
  routines: 'Rutinas',
  settings: 'Ajustes',
  rain: 'Mapa de lluvia',
  earthquakes: 'Sismos cercanos',
}

function getPageFromHash(): PageId {
  const hash = window.location.hash.replace('#/', '')
  const entry = Object.entries(pageHash).find(([, value]) => value === hash)
  return (entry?.[0] as PageId | undefined) ?? 'home'
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ha ocurrido un error inesperado. Generaremos la lista sin clima.'
}

function uniqueRoutineItems(result: RecommendationResult, labels: string[]): RecommendationResult {
  const existingLabels = new Set(result.items.map((item) => item.label.trim().toLocaleLowerCase()))
  const customItems = labels
    .map((label) => label.trim())
    .filter((label) => label && !existingLabels.has(label.toLocaleLowerCase()))
    .map((label, index) => ({
      id: `routine-${index}-${label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label,
      reason: 'Incluido en tu rutina guardada',
      category: 'Personales' as const,
      priority: 'normal' as const,
      completed: false,
    }))

  return { ...result, items: [...result.items, ...customItems] }
}

function matchesCachedForecast(
  cachedForecast: CachedForecast | undefined,
  draft: OutingDraft,
): cachedForecast is CachedForecast {
  if (!cachedForecast || cachedForecast.date !== draft.date) return false
  if (cachedForecast.locationMode !== draft.locationMode) return false
  if (draft.locationMode === 'manual') {
    return cachedForecast.cityKey === draft.city.trim().toLocaleLowerCase('es')
  }
  return true
}

function cachedForecastMessage(cachedForecast: CachedForecast): string {
  const savedAt = new Date(cachedForecast.savedAt).toLocaleString('es', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  return `Sin conexión meteorológica. Usamos el pronóstico guardado para ${cachedForecast.locationLabel} el ${savedAt}.`
}

function App() {
  const [activePage, setActivePage] = useState<PageId>(getPageFromHash)
  const [draft, setDraft] = useState<OutingDraft>(initialDraft)
  const [recommendation, setRecommendation] = useState<RecommendationResult>(
    () => generateChecklist(initialDraft),
  )
  const [routines, setRoutines] = useState<Routine[]>(initialRoutines)
  const [preferences, setPreferences] = useState<AppPreferences>(initialPreferences)
  const [personalization, setPersonalization] = useState<PersonalizationProfile>(createEmptyProfile)
  const [pendingRoutineItems, setPendingRoutineItems] = useState<string[]>([])
  const [locationState, setLocationState] = useState<LocationState>({ status: 'idle' })
  const [weatherState, setWeatherState] = useState<WeatherState>({ status: 'idle' })
  const [cachedForecast, setCachedForecast] = useState<CachedForecast | undefined>()
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('loading')
  const [storageMessage, setStorageMessage] = useState('Recuperando tus datos locales…')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(
    () => getNotificationPermission(),
  )
  const [notificationMessage, setNotificationMessage] = useState('')
  const [visibilityMessage, setVisibilityMessage] = useState('')
  const [isHydrated, setIsHydrated] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [notice, setNotice] = useState('')
  const skipNextSaveAfterClear = useRef(false)

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/inicio')
    }
    const handleHashChange = () => setActivePage(getPageFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    document.title = `${pageTitle[activePage]} · OPECONCA Campo`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activePage])

  useEffect(() => {
    if (!('hidden' in document)) return
    let wasHidden = document.hidden

    const handleVisibilityChange = () => {
      const incompleteItems = recommendation.items.filter((item) => !item.completed)
      const importantItems = incompleteItems.filter((item) => item.priority === 'high')

      if (document.hidden) {
        wasHidden = true
        if (activePage === 'checklist' && incompleteItems.length > 0) {
          document.title = `${incompleteItems.length} pendientes · OPECONCA Campo`
          if (preferences.notifications && notificationPermission === 'granted') {
            showChecklistNotification(incompleteItems.length)
          }
        }
        return
      }

      document.title = `${pageTitle[activePage]} · OPECONCA Campo`
      if (!wasHidden || activePage !== 'checklist') return
      wasHidden = false

      if (!incompleteItems.length) {
        setVisibilityMessage('Revisamos tu lista al volver: sigue completa.')
      } else if (importantItems.length) {
        setVisibilityMessage(`Revisión al volver: faltan ${incompleteItems.length} objetos, ${importantItems.length} importantes.`)
      } else {
        setVisibilityMessage(`Revisión al volver: todavía faltan ${incompleteItems.length} objetos.`)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [activePage, notificationPermission, preferences.notifications, recommendation.items])

  useEffect(() => {
    let cancelled = false

    loadAppState()
      .then((storedState) => {
        if (cancelled) return
        const currentPermission = getNotificationPermission()
        setNotificationPermission(currentPermission)
        if (storedState) {
          setDraft(storedState.draft)
          setRecommendation(storedState.recommendation)
          setRoutines(storedState.routines)
          setCachedForecast(storedState.cachedForecast)
          setPersonalization(storedState.personalization ?? createEmptyProfile())
          setPreferences({
            ...storedState.preferences,
            notifications:
              storedState.preferences.notifications && currentPermission === 'granted',
          })
          setStorageMessage('Datos locales restaurados.')
        } else {
          setStorageMessage('Almacenamiento local preparado.')
        }
        setStorageStatus('saved')
      })
      .catch((error) => {
        if (cancelled) return
        setStorageStatus('error')
        setStorageMessage(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    if (skipNextSaveAfterClear.current) {
      skipNextSaveAfterClear.current = false
      return
    }

    setStorageStatus('saving')
    setStorageMessage('Guardando cambios…')
    const timeoutId = window.setTimeout(() => {
      const state: PersistedAppState = {
        version: 1,
        updatedAt: new Date().toISOString(),
        draft,
        recommendation,
        routines,
        preferences,
        cachedForecast,
        personalization,
      }

      saveAppState(state)
        .then(() => {
          setStorageStatus('saved')
          setStorageMessage('Todos los cambios están guardados en este dispositivo.')
        })
        .catch((error) => {
          setStorageStatus('error')
          setStorageMessage(errorMessage(error))
        })
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [cachedForecast, draft, isHydrated, personalization, preferences, recommendation, routines])

  const navigate = (page: PageId) => {
    const nextHash = `#/${pageHash[page]}`
    if (window.location.hash === nextHash) {
      setActivePage(page)
      return
    }
    window.location.hash = nextHash
  }

  const updateDraft = (nextDraft: OutingDraft) => {
    const locationChanged =
      nextDraft.locationMode !== draft.locationMode ||
      (nextDraft.locationMode === 'manual' && nextDraft.city !== draft.city)
    const dateChanged = nextDraft.date !== draft.date

    setDraft(nextDraft)
    setNotice('')

    if (locationChanged) setLocationState({ status: 'idle' })
    if (locationChanged || dateChanged) setWeatherState({ status: 'idle' })
  }

  const updatePreferences = (nextPreferences: AppPreferences) => {
    setPreferences(nextPreferences)
    if (nextPreferences.defaultCity !== preferences.defaultCity) {
      setDraft((current) => ({ ...current, city: nextPreferences.defaultCity }))
    }
  }

  const toggleNotifications = async () => {
    if (preferences.notifications) {
      setPreferences((current) => ({ ...current, notifications: false }))
      setNotificationMessage('Los recordatorios de OPECONCA Campo están desactivados.')
      return
    }

    setNotificationMessage('Esperando tu decisión en el navegador…')
    try {
      const permission = await requestNotificationPermission()
      setNotificationPermission(permission)

      if (permission === 'granted') {
        setPreferences((current) => ({ ...current, notifications: true }))
        setNotificationMessage('Recordatorios activados. Te avisaremos si cambias de pestaña con objetos pendientes.')
      } else if (permission === 'denied') {
        setPreferences((current) => ({ ...current, notifications: false }))
        setNotificationMessage('El navegador bloqueó las notificaciones. Puedes cambiarlo desde sus permisos del sitio.')
      } else if (permission === 'unsupported') {
        setPreferences((current) => ({ ...current, notifications: false }))
        setNotificationMessage('Este navegador no admite notificaciones web en este contexto.')
      } else {
        setNotificationMessage('No se modificó el permiso de notificaciones.')
      }
    } catch {
      setNotificationMessage('No pudimos solicitar el permiso de notificaciones.')
    }
  }

  const requestEarthquakeNotificationPermission = async (): Promise<NotificationPermissionState> => {
    const permission = await requestNotificationPermission()
    setNotificationPermission(permission)
    return permission
  }

  const detectCurrentLocation = async () => {
    setLocationState({ status: 'loading', message: 'Esperando permiso del navegador…' })
    setWeatherState({ status: 'idle' })

    try {
      const location = await requestCurrentLocation()
      setLocationState({
        status: 'success',
        location,
        message: 'Ubicación aproximada lista. Se usará solo para consultar el clima.',
      })
    } catch (error) {
      setLocationState({ status: 'error', message: errorMessage(error) })
    }
  }

  const resolveMapLocation = (signal?: AbortSignal) => (
    draft.locationMode === 'manual'
      ? searchCity(draft.city, signal)
      : requestCurrentLocation()
  )

  const buildRecommendation = (weather?: WeatherContext) => {
    const generated = generateChecklist(draft, weather)
    const filtered = preferences.suggestions
      ? generated
      : {
          items: generated.items.filter((item) => item.category === 'Esenciales'),
          appliedRules: generated.appliedRules.filter((rule) => rule === 'Básicos para cualquier salida'),
        }
    const withRoutineItems = uniqueRoutineItems(filtered, pendingRoutineItems)
    return preferences.suggestions
      ? personalizeRecommendation(withRoutineItems, personalization, draft.activity)
      : withRoutineItems
  }

  const createChecklist = async () => {
    setIsGenerating(true)
    setVisibilityMessage('')
    setWeatherState({ status: 'loading', message: 'Consultando el pronóstico para tu salida…' })

    try {
      let resolvedLocation = locationState.location

      if (draft.locationMode === 'manual') {
        setLocationState({ status: 'loading', message: `Buscando “${draft.city.trim()}”…` })
        resolvedLocation = await searchCity(draft.city)
        setLocationState({
          status: 'success',
          location: resolvedLocation,
          message: `${resolvedLocation.name} encontrada.`,
        })
      } else if (!resolvedLocation || resolvedLocation.source !== 'device') {
        throw new Error(
          'No se detectó una ubicación. La lista se generó sin clima; también puedes usar una ciudad manual.',
        )
      }

      const weather = await fetchForecast(resolvedLocation, draft.date)
      const nextCachedForecast: CachedForecast = {
        weather,
        date: draft.date,
        locationMode: draft.locationMode,
        cityKey: draft.locationMode === 'manual' ? draft.city.trim().toLocaleLowerCase('es') : '',
        locationLabel: resolvedLocation.name,
        savedAt: new Date().toISOString(),
      }
      setCachedForecast(nextCachedForecast)
      setWeatherState({ status: 'success', weather })
      setRecommendation(buildRecommendation(weather))
    } catch (error) {
      const failureMessage = errorMessage(error)
      setLocationState((current) =>
        current.status === 'loading'
          ? { status: 'error', message: failureMessage }
          : current,
      )

      if (matchesCachedForecast(cachedForecast, draft)) {
        const cachedWeather: WeatherContext = {
          ...cachedForecast.weather,
          source: 'cached',
        }
        setWeatherState({
          status: 'success',
          weather: cachedWeather,
          message: cachedForecastMessage(cachedForecast),
        })
        setRecommendation(buildRecommendation(cachedWeather))
      } else {
        setWeatherState({ status: 'error', message: failureMessage })
        setRecommendation(buildRecommendation())
      }
    } finally {
      setPendingRoutineItems([])
      setIsGenerating(false)
      setNotice('')
      navigate('checklist')
    }
  }

  const useRoutine = (routine: Routine) => {
    setDraft((current) => ({
      ...current,
      activity: routine.activity,
      duration: routine.duration,
      transport: routine.transport,
    }))
    setPendingRoutineItems(routine.customItems)
    setRoutines((current) => current.map((item) =>
      item.id === routine.id ? { ...item, lastUsed: 'Ahora' } : item,
    ))
    setNotice(`Rutina “${routine.name}” aplicada. Revisa los detalles antes de crear la lista.`)
    navigate('home')
  }

  const saveRoutine = (name: string, description: string) => {
    const routine: Routine = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `routine-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || 'Rutina creada desde una checklist personalizada.',
      activity: draft.activity,
      duration: draft.duration,
      transport: draft.transport,
      itemCount: recommendation.items.length,
      lastUsed: 'Ahora',
      customItems: recommendation.items
        .filter((item) => item.category === 'Personales')
        .map((item) => item.label),
    }
    setRoutines((current) => [routine, ...current])
  }

  const updateRoutine = (id: string, name: string, description: string) => {
    setRoutines((current) => current.map((routine) =>
      routine.id === id
        ? { ...routine, name: name.trim(), description: description.trim() }
        : routine,
    ))
  }

  const addItem = (label: string) => {
    const item = {
      id: `custom-${Date.now()}`,
      label,
      reason: 'Añadido por ti',
      category: 'Personales' as const,
      priority: 'normal' as const,
      completed: false,
    }
    setRecommendation((current) => ({
      ...current,
      items: [...current.items, item],
    }))
    setPersonalization((current) =>
      recordHabitSignal(current, draft.activity, item, 'added'),
    )
  }

  const removeItem = (id: string) => {
    const item = recommendation.items.find((candidate) => candidate.id === id)
    setRecommendation((current) => ({
      ...current,
      items: current.items.filter((candidate) => candidate.id !== id),
    }))
    if (item) {
      setPersonalization((current) =>
        recordHabitSignal(current, draft.activity, item, 'removed'),
      )
    }
  }

  const toggleItem = (id: string) => {
    const item = recommendation.items.find((candidate) => candidate.id === id)
    setRecommendation((current) => ({
      ...current,
      items: current.items.map((candidate) =>
        candidate.id === id ? { ...candidate, completed: !candidate.completed } : candidate,
      ),
    }))
    if (item && !item.completed) {
      setPersonalization((current) =>
        recordHabitSignal(current, draft.activity, item, 'completed'),
      )
    }
  }

  const reviewPendingItems = (items: RecommendationResult['items']) => {
    if (!items.length) return
    setPersonalization((current) =>
      recordPendingSignals(current, draft.activity, items),
    )
  }

  const resetPersonalization = () => {
    setPersonalization(createEmptyProfile())
    setStorageMessage('Aprendizaje local eliminado. Las reglas base permanecen intactas.')
  }

  const clearLocalData = async () => {
    setIsHydrated(false)
    setStorageStatus('saving')
    setStorageMessage('Borrando los datos guardados en este dispositivo…')

    try {
      await clearAppState()
      skipNextSaveAfterClear.current = true
      setDraft(initialDraft)
      setRecommendation(generateChecklist(initialDraft))
      setRoutines(initialRoutines)
      setPreferences(initialPreferences)
      setPersonalization(createEmptyProfile())
      setPendingRoutineItems([])
      setLocationState({ status: 'idle' })
      setWeatherState({ status: 'idle' })
      setCachedForecast(undefined)
      setNotificationMessage('')
      setVisibilityMessage('')
      setIsGenerating(false)
      setNotice('')
      setStorageStatus('saved')
      setStorageMessage('Datos locales eliminados. El guardado se reactivará con tu próximo cambio.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos borrar los datos locales.'
      setStorageStatus('error')
      setStorageMessage(message)
      throw new Error(message)
    } finally {
      setIsHydrated(true)
    }
  }

  const currentPage = (() => {
    switch (activePage) {
      case 'earthquakes':
        return (
          <EarthquakePage
            draft={draft}
            notificationPermission={notificationPermission}
            onBack={() => navigate('home')}
            onEnableNotifications={requestEarthquakeNotificationPermission}
            onResolveLocation={resolveMapLocation}
          />
        )
      case 'rain':
        return (
          <RainMapPage
            draft={draft}
            onBack={() => navigate('home')}
            onResolveLocation={resolveMapLocation}
          />
        )
      case 'checklist':
        return (
          <ChecklistPage
            appliedRules={recommendation.appliedRules}
            draft={draft}
            forecastStatus={weatherState.status}
            items={recommendation.items}
            location={locationState.location}
            onAddItem={addItem}
            onNavigateHome={() => navigate('home')}
            onRemoveItem={removeItem}
            onReviewPending={reviewPendingItems}
            onSaveRoutine={saveRoutine}
            onToggleItem={toggleItem}
            temperatureUnit={preferences.temperatureUnit}
            visibilityMessage={visibilityMessage}
            weather={weatherState.weather}
            weatherMessage={weatherState.message}
          />
        )
      case 'routines':
        return (
          <RoutinesPage
            onCreateRoutine={() => navigate('checklist')}
            onUpdateRoutine={updateRoutine}
            onUseRoutine={useRoutine}
            routines={routines}
          />
        )
      case 'settings':
        return (
          <SettingsPage
            notificationMessage={notificationMessage}
            notificationPermission={notificationPermission}
            onClearLocalData={clearLocalData}
            onPreferencesChange={updatePreferences}
            onResetPersonalization={resetPersonalization}
            onToggleNotifications={toggleNotifications}
            personalization={personalization}
            preferences={preferences}
            storageMessage={storageMessage}
            storageStatus={storageStatus}
          />
        )
      default:
        return (
          <HomePage
            draft={draft}
            isGenerating={isGenerating}
            locationState={locationState}
            notice={notice}
            onDetectLocation={detectCurrentLocation}
            onDraftChange={updateDraft}
            onGenerate={createChecklist}
            onOpenEarthquakeMonitor={() => navigate('earthquakes')}
            onOpenRainMap={() => navigate('rain')}
            temperatureUnit={preferences.temperatureUnit}
            weatherState={weatherState}
          />
        )
    }
  })()

  return (
    <AppShell
      activePage={activePage}
      immersive={activePage === 'rain' || activePage === 'earthquakes'}
      onNavigate={navigate}
    >
      {currentPage}
    </AppShell>
  )
}

export default App
