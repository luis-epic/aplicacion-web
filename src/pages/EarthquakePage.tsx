import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EarthquakeMapPanel } from '../components/EarthquakeMapPanel'
import { OptionalFeatureBoundary } from '../components/OptionalFeatureBoundary'
import {
  magnitudeTone,
  nearbyEarthquakes,
  type EarthquakeFilters,
  type NearbyEarthquake,
} from '../domain/earthquakeProximity'
import { showEarthquakeNotification } from '../services/browserFeatures'
import {
  fetchEarthquakeSnapshot,
  type EarthquakeSnapshot,
} from '../services/earthquakeFeed'
import type {
  LocationState,
  NotificationPermissionState,
  OutingDraft,
  RequestStatus,
  ResolvedLocation,
} from '../types/app'

interface EarthquakePageProps {
  draft: OutingDraft
  notificationPermission: NotificationPermissionState
  onBack: () => void
  onEnableNotifications: () => Promise<NotificationPermissionState>
  onResolveLocation: (signal?: AbortSignal) => Promise<ResolvedLocation>
}

interface MonitoringSettings {
  earthquakeAlertsEnabled: boolean
  filters: EarthquakeFilters
  location?: ResolvedLocation
  notificationPermission: NotificationPermissionState
}

const FEED_TIMEOUT = 10_000
const POLL_INTERVAL = 60_000
const DEFAULT_FILTERS: EarthquakeFilters = {
  minimumMagnitude: 4.5,
  radiusKm: 500,
}

function formatEventTime(timestamp: number): string {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function formatGeneratedTime(timestamp: number): string {
  return new Intl.DateTimeFormat('es', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}

function requestErrorMessage(error: unknown, timedOut: boolean): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return timedOut ? 'La fuente sísmica tardó demasiado en responder.' : ''
  }
  return error instanceof Error ? error.message : 'No pudimos actualizar los sismos detectados.'
}

export function EarthquakePage({
  draft,
  notificationPermission,
  onBack,
  onEnableNotifications,
  onResolveLocation,
}: EarthquakePageProps) {
  const resolveLocationRef = useRef(onResolveLocation)
  const locationControllerRef = useRef<AbortController | null>(null)
  const feedControllerRef = useRef<AbortController | null>(null)
  const locationRequestRef = useRef(0)
  const feedRequestRef = useRef(0)
  const knownEventIdsRef = useRef(new Set<string>())
  const hasBaselineRef = useRef(false)
  const monitoringRef = useRef<MonitoringSettings>({
    earthquakeAlertsEnabled: false,
    filters: DEFAULT_FILTERS,
    notificationPermission,
  })
  const [locationState, setLocationState] = useState<LocationState>({ status: 'idle' })
  const [filters, setFilters] = useState<EarthquakeFilters>(DEFAULT_FILTERS)
  const [earthquakeAlertsEnabled, setEarthquakeAlertsEnabled] = useState(false)
  const [snapshot, setSnapshot] = useState<EarthquakeSnapshot | null>(null)
  const [feedStatus, setFeedStatus] = useState<RequestStatus>('idle')
  const [feedMessage, setFeedMessage] = useState('')
  const [alertMessage, setAlertMessage] = useState('')
  const [selectedEventId, setSelectedEventId] = useState<string>()
  const [isAvailable, setIsAvailable] = useState(
    () => navigator.onLine && document.visibilityState === 'visible',
  )

  useEffect(() => {
    resolveLocationRef.current = onResolveLocation
  }, [onResolveLocation])

  useEffect(() => {
    monitoringRef.current = {
      earthquakeAlertsEnabled,
      filters,
      location: locationState.location,
      notificationPermission,
    }
  }, [earthquakeAlertsEnabled, filters, locationState.location, notificationPermission])

  const requestLocation = useCallback(async () => {
    locationControllerRef.current?.abort()
    const controller = new AbortController()
    locationControllerRef.current = controller
    const requestId = locationRequestRef.current + 1
    locationRequestRef.current = requestId
    setLocationState({
      status: 'loading',
      message: draft.locationMode === 'manual'
        ? `Buscando “${draft.city.trim()}”…`
        : 'Esperando permiso del navegador…',
    })

    try {
      const location = await resolveLocationRef.current(controller.signal)
      if (locationRequestRef.current !== requestId) return
      setLocationState({
        status: 'success',
        location,
        message: 'Ubicación temporal lista. Las distancias se calculan en este dispositivo.',
      })
    } catch (error) {
      if (
        locationRequestRef.current !== requestId ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) return
      setLocationState({
        status: 'error',
        message: error instanceof Error ? error.message : 'No pudimos resolver la ubicación.',
      })
    } finally {
      if (locationControllerRef.current === controller) locationControllerRef.current = null
    }
  }, [draft.city, draft.locationMode])

  const loadSnapshot = useCallback(async () => {
    const settings = monitoringRef.current
    if (!settings.location || !navigator.onLine || document.visibilityState !== 'visible') return

    feedControllerRef.current?.abort()
    const controller = new AbortController()
    feedControllerRef.current = controller
    const requestId = feedRequestRef.current + 1
    feedRequestRef.current = requestId
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, FEED_TIMEOUT)

    setFeedStatus('loading')
    setFeedMessage('Consultando eventos reportados durante las últimas 24 horas…')

    try {
      const nextSnapshot = await fetchEarthquakeSnapshot(controller.signal)
      if (
        feedRequestRef.current !== requestId ||
        !navigator.onLine ||
        document.visibilityState !== 'visible'
      ) return

      if (!hasBaselineRef.current) {
        nextSnapshot.events.forEach((event) => knownEventIdsRef.current.add(event.id))
        hasBaselineRef.current = true
        setAlertMessage('Monitoreo iniciado. Los eventos existentes forman la línea base y no generarán avisos.')
      } else {
        const newEvents = nextSnapshot.events.filter((event) => !knownEventIdsRef.current.has(event.id))
        nextSnapshot.events.forEach((event) => knownEventIdsRef.current.add(event.id))
        const currentSettings = monitoringRef.current
        const nearbyNewEvents = currentSettings.location
          ? nearbyEarthquakes(newEvents, currentSettings.location, currentSettings.filters)
          : []

        if (nearbyNewEvents.length) {
          setAlertMessage(
            `${nearbyNewEvents.length} ${nearbyNewEvents.length === 1 ? 'sismo nuevo coincide' : 'sismos nuevos coinciden'} con tus filtros en esta actualización.`,
          )
          if (
            currentSettings.earthquakeAlertsEnabled &&
            currentSettings.notificationPermission === 'granted'
          ) {
            nearbyNewEvents.slice(0, 3).forEach((event) => {
              showEarthquakeNotification({
                distanceKm: event.distanceKm,
                eventId: event.id,
                magnitude: event.magnitude,
                place: event.place,
              })
            })
          }
        } else {
          setAlertMessage('Sin eventos nuevos que coincidan con tus filtros en esta actualización.')
        }
      }

      setSnapshot(nextSnapshot)
      setFeedStatus('success')
      setFeedMessage(`Fuente actualizada a las ${formatGeneratedTime(nextSnapshot.generatedAt)}.`)
    } catch (error) {
      if (feedRequestRef.current !== requestId) return
      const message = requestErrorMessage(error, timedOut)
      if (!message) return
      setFeedStatus('error')
      setFeedMessage(message)
    } finally {
      window.clearTimeout(timeoutId)
      if (feedControllerRef.current === controller) feedControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    void requestLocation()
    return () => {
      locationControllerRef.current?.abort()
      feedControllerRef.current?.abort()
      locationRequestRef.current += 1
      feedRequestRef.current += 1
    }
  }, [requestLocation])

  useEffect(() => {
    const updateAvailability = () => {
      const available = navigator.onLine && document.visibilityState === 'visible'
      if (!available) {
        feedControllerRef.current?.abort()
        feedRequestRef.current += 1
        setFeedStatus('idle')
        setFeedMessage('Monitor pausado hasta que la pantalla vuelva a estar visible y en línea.')
      }
      setIsAvailable(available)
    }
    window.addEventListener('online', updateAvailability)
    window.addEventListener('offline', updateAvailability)
    document.addEventListener('visibilitychange', updateAvailability)
    return () => {
      window.removeEventListener('online', updateAvailability)
      window.removeEventListener('offline', updateAvailability)
      document.removeEventListener('visibilitychange', updateAvailability)
    }
  }, [])

  useEffect(() => {
    if (!locationState.location || !isAvailable) return
    void loadSnapshot()
    const intervalId = window.setInterval(() => void loadSnapshot(), POLL_INTERVAL)
    return () => window.clearInterval(intervalId)
  }, [isAvailable, loadSnapshot, locationState.location])

  const visibleEvents = useMemo(
    () => snapshot && locationState.location
      ? nearbyEarthquakes(snapshot.events, locationState.location, filters)
      : [],
    [filters, locationState.location, snapshot],
  )

  useEffect(() => {
    if (!visibleEvents.length) {
      setSelectedEventId(undefined)
      return
    }
    if (!selectedEventId || !visibleEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(visibleEvents[0].id)
    }
  }, [selectedEventId, visibleEvents])

  const selectEvent = useCallback((eventId: string) => {
    setSelectedEventId(eventId)
    window.requestAnimationFrame(() => {
      document.getElementById(`earthquake-${eventId}`)?.focus({ preventScroll: false })
    })
  }, [])

  const enableEarthquakeAlerts = async () => {
    setAlertMessage('Esperando tu decisión sobre los avisos sísmicos…')
    try {
      const permission = await onEnableNotifications()
      if (permission === 'granted') {
        setEarthquakeAlertsEnabled(true)
        setAlertMessage('Avisos sísmicos activados para eventos nuevos durante esta sesión.')
      } else if (permission === 'denied') {
        setAlertMessage('El navegador bloqueó los avisos. Puedes cambiarlo en los permisos del sitio.')
      } else if (permission === 'unsupported') {
        setAlertMessage('Este navegador no admite notificaciones.')
      } else {
        setAlertMessage('No se activaron los avisos sísmicos.')
      }
    } catch {
      setAlertMessage('No pudimos solicitar el permiso de notificaciones.')
    }
  }

  const notificationDescription = (() => {
    if (notificationPermission === 'unsupported') return 'Este navegador no admite notificaciones.'
    if (notificationPermission === 'denied') return 'El navegador bloqueó las notificaciones. Puedes cambiarlo en los permisos del sitio.'
    if (earthquakeAlertsEnabled && notificationPermission === 'granted') {
      return 'Avisos sísmicos activos solo durante esta sesión y mientras la pantalla permanezca abierta y en línea.'
    }
    return 'Activa de forma independiente los avisos de nuevos reportes sísmicos para esta sesión.'
  })()

  return (
    <div className="earthquake-page">
      <div className="earthquake-workspace">
        <OptionalFeatureBoundary featureName="el mapa de sismos" onClose={onBack}>
          <EarthquakeMapPanel
            events={visibleEvents}
            locationState={locationState}
            onBack={onBack}
            onRequestLocation={() => void requestLocation()}
            onSelectEvent={selectEvent}
            selectedEventId={selectedEventId}
          />
        </OptionalFeatureBoundary>

        <aside aria-labelledby="earthquake-monitor-title" className="earthquake-monitor-panel">
          <header className="earthquake-monitor-heading">
            <div>
              <span className="eyebrow">Feed global de USGS</span>
              <h2 id="earthquake-monitor-title">Monitor sísmico</h2>
            </div>
            <span className={isAvailable ? 'earthquake-monitor-badge active' : 'earthquake-monitor-badge'}>
              {isAvailable ? 'En línea' : 'Pausado'}
            </span>
          </header>

          <section className="earthquake-warning" aria-label="Limitación importante">
            <strong>No es alerta temprana</strong>
            <p>Informa sismos después de ser detectados y publicados por USGS. No predice terremotos ni garantiza aviso antes del movimiento.</p>
          </section>

          <fieldset className="earthquake-filters" disabled={!locationState.location}>
            <legend>Filtrar eventos cercanos</legend>
            <label>
              <span>Radio</span>
              <select
                onChange={(event) => {
                  setFilters((current) => ({ ...current, radiusKm: Number(event.target.value) }))
                  setAlertMessage('Filtros actualizados. Los próximos eventos nuevos se evaluarán con estos límites.')
                }}
                value={filters.radiusKm}
              >
                <option value="100">100 km</option>
                <option value="250">250 km</option>
                <option value="500">500 km</option>
                <option value="1000">1.000 km</option>
                <option value="2000">2.000 km</option>
              </select>
            </label>
            <label>
              <span>Magnitud mínima</span>
              <select
                onChange={(event) => {
                  setFilters((current) => ({ ...current, minimumMagnitude: Number(event.target.value) }))
                  setAlertMessage('Filtros actualizados. Los próximos eventos nuevos se evaluarán con estos límites.')
                }}
                value={filters.minimumMagnitude}
              >
                <option value="2.5">M 2.5</option>
                <option value="3">M 3.0</option>
                <option value="4">M 4.0</option>
                <option value="4.5">M 4.5</option>
                <option value="5">M 5.0</option>
                <option value="6">M 6.0</option>
              </select>
            </label>
          </fieldset>

          <section className="earthquake-alert-settings" aria-labelledby="earthquake-alert-title">
            <div>
              <strong id="earthquake-alert-title">Avisos durante esta sesión</strong>
              <p>{notificationDescription}</p>
            </div>
            {!earthquakeAlertsEnabled && notificationPermission !== 'denied' && notificationPermission !== 'unsupported' && (
              <button className="secondary-button" onClick={() => void enableEarthquakeAlerts()} type="button">
                Activar avisos sísmicos
              </button>
            )}
          </section>

          <div className="earthquake-feed-status">
            <p aria-live="polite" className={feedStatus === 'error' ? 'error' : ''}>
              {feedStatus === 'loading' && <span className="loading-spinner" />}
              {feedMessage || 'Esperando ubicación para iniciar el monitor.'}
            </p>
            <button
              disabled={!locationState.location || !isAvailable || feedStatus === 'loading'}
              onClick={() => void loadSnapshot()}
              type="button"
            >Actualizar</button>
          </div>
          {alertMessage && <p className="earthquake-alert-message" role="status">{alertMessage}</p>}

          <section aria-labelledby="earthquake-list-title" className="earthquake-list-section">
            <div className="earthquake-list-heading">
              <h3 id="earthquake-list-title">Eventos que coinciden</h3>
              <span>{visibleEvents.length}</span>
            </div>

            {!snapshot && feedStatus !== 'loading' && (
              <div className="earthquake-empty"><p>Aún no hay datos sísmicos disponibles.</p></div>
            )}
            {snapshot && !visibleEvents.length && (
              <div className="earthquake-empty">
                <strong>Sin eventos en estos filtros</strong>
                <p>No se reportaron sismos de M {filters.minimumMagnitude.toFixed(1)} o superior dentro de {filters.radiusKm.toLocaleString('es')} km durante las últimas 24 horas.</p>
              </div>
            )}
            <div className="earthquake-event-list">
              {visibleEvents.map((event) => (
                <EarthquakeEventCard
                  event={event}
                  key={event.id}
                  onSelect={selectEvent}
                  selected={event.id === selectedEventId}
                />
              ))}
            </div>
          </section>

          <footer className="earthquake-monitor-footer">
            <p>La app descarga un feed global sin enviar tus coordenadas a USGS. El radio y la distancia se calculan localmente; la ubicación no se guarda. OpenStreetMap recibe las teselas de la zona visible y la dirección IP necesaria para servirlas.</p>
            <p>El sondeo se ejecuta cada minuto solo mientras esta pantalla está abierta, visible y conectada. Los navegadores no garantizan avisos con la PWA cerrada.</p>
            {snapshot && (
              <a href={snapshot.sourceUrl} rel="noreferrer" target="_blank">
                Datos: {snapshot.sourceLabel}
              </a>
            )}
          </footer>
        </aside>
      </div>
    </div>
  )
}

interface EarthquakeEventCardProps {
  event: NearbyEarthquake
  onSelect: (eventId: string) => void
  selected: boolean
}

function EarthquakeEventCard({ event, onSelect, selected }: EarthquakeEventCardProps) {
  const tone = magnitudeTone(event.magnitude)
  return (
    <article
      className={selected ? `earthquake-event-card ${tone} selected` : `earthquake-event-card ${tone}`}
      id={`earthquake-${event.id}`}
      tabIndex={-1}
    >
      <button aria-pressed={selected} onClick={() => onSelect(event.id)} type="button">
        <span className="earthquake-magnitude">M {event.magnitude.toFixed(1)}</span>
        <span className="earthquake-event-copy">
          <strong>{event.place}</strong>
          <small>{formatEventTime(event.occurredAt)}</small>
        </span>
        <span className="earthquake-distance">{event.distanceKm.toLocaleString('es')} km</span>
      </button>
      <dl>
        <div><dt>Profundidad</dt><dd>{event.depthKm.toFixed(1)} km</dd></div>
        <div><dt>Actualizado</dt><dd>{formatEventTime(event.updatedAt)}</dd></div>
      </dl>
      <a href={event.sourceUrl} rel="noreferrer" target="_blank">Ver informe oficial de USGS</a>
    </article>
  )
}
