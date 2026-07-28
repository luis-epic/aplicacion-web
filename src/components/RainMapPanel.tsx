import { useEffect, useMemo, useRef, useState } from 'react'
import type { CircleMarker, Map as LeafletMap, TileLayer } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { rainMapProvider, type RainFrame, type RainMapSnapshot } from '../services/rainMapProvider'
import type { LocationState, RequestStatus } from '../types/app'
import { Icon } from './Icon'

interface RainMapPanelProps {
  immersive?: boolean
  locationState: LocationState
  onClose: () => void
  onRequestLocation: () => void
}

const MAP_LOAD_TIMEOUT = 10_000
const RADAR_REFRESH_INTERVAL = 5 * 60 * 1000
const RADAR_ANIMATION_INTERVAL = 1_100
const BASE_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const BASE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function formatRadarTime(timestamp: number): string {
  return new Intl.DateTimeFormat('es', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}

function formatRadarAge(timestamp: number): string {
  const ageMinutes = Math.max(0, Math.floor((Date.now() - timestamp * 1000) / 60_000))
  if (ageMinutes < 1) return 'hace menos de 1 min'
  return `hace ${ageMinutes} min`
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'El radar tardó demasiado en responder. Inténtalo de nuevo.'
  }
  return error instanceof Error ? error.message : 'No pudimos cargar el radar.'
}

export function RainMapPanel({
  immersive = false,
  locationState,
  onClose,
  onRequestLocation,
}: RainMapPanelProps) {
  const mapNodeRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const radarLayerRef = useRef<TileLayer | null>(null)
  const locationMarkerRef = useRef<CircleMarker | null>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const [snapshot, setSnapshot] = useState<RainMapSnapshot | null>(null)
  const [selectedFramePath, setSelectedFramePath] = useState('')
  const [renderedFrame, setRenderedFrame] = useState<RainFrame | null>(null)
  const [radarStatus, setRadarStatus] = useState<RequestStatus>('idle')
  const [radarMessage, setRadarMessage] = useState('')
  const [mapError, setMapError] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const [hasRenderedRadar, setHasRenderedRadar] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [canAutoRefresh, setCanAutoRefresh] = useState(
    () => navigator.onLine && document.visibilityState === 'visible',
  )
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const availabilityRef = useRef(canAutoRefresh)
  const location = locationState.location

  const selectedFrame = useMemo(
    () => snapshot?.frames.find((frame) => frame.path === selectedFramePath),
    [selectedFramePath, snapshot],
  )
  const selectedFrameIndex = useMemo(
    () => snapshot?.frames.findIndex((frame) => frame.path === selectedFramePath) ?? -1,
    [selectedFramePath, snapshot],
  )
  const isLatestFrame = Boolean(
    snapshot && selectedFrameIndex === snapshot.frames.length - 1,
  )
  const isRenderedFrameLatest = Boolean(
    snapshot && renderedFrame?.path === snapshot.frames.at(-1)?.path,
  )

  const moveFrame = (direction: -1 | 1) => {
    if (!snapshot?.frames.length) return
    setIsPlaying(false)
    const currentIndex = Math.max(0, selectedFrameIndex)
    const nextIndex = Math.min(snapshot.frames.length - 1, Math.max(0, currentIndex + direction))
    setSelectedFramePath(snapshot.frames[nextIndex].path)
  }

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleMotionChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
      if (event.matches) setIsPlaying(false)
    }
    motionQuery.addEventListener('change', handleMotionChange)
    return () => motionQuery.removeEventListener('change', handleMotionChange)
  }, [])

  useEffect(() => {
    const updateAvailability = () => {
      const available = navigator.onLine && document.visibilityState === 'visible'
      if (available && !availabilityRef.current) {
        setRefreshVersion((current) => current + 1)
      }
      availabilityRef.current = available
      setCanAutoRefresh(available)
      if (!available) setIsPlaying(false)
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
    if (!location || !canAutoRefresh) return
    const intervalId = window.setInterval(
      () => setRefreshVersion((current) => current + 1),
      RADAR_REFRESH_INTERVAL,
    )
    return () => window.clearInterval(intervalId)
  }, [canAutoRefresh, location])

  useEffect(() => {
    if (
      !isPlaying ||
      prefersReducedMotion ||
      radarStatus !== 'success' ||
      !snapshot ||
      snapshot.frames.length < 2
    ) return

    const timeoutId = window.setTimeout(() => {
      setSelectedFramePath((currentPath) => {
        const currentIndex = snapshot.frames.findIndex((frame) => frame.path === currentPath)
        const nextIndex = currentIndex < 0 || currentIndex === snapshot.frames.length - 1
          ? 0
          : currentIndex + 1
        return snapshot.frames[nextIndex].path
      })
    }, RADAR_ANIMATION_INTERVAL)
    return () => window.clearTimeout(timeoutId)
  }, [isPlaying, prefersReducedMotion, radarStatus, snapshot])

  useEffect(() => {
    if (!location) return

    let active = true
    let timedOut = false
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, MAP_LOAD_TIMEOUT)

    setRadarStatus('loading')
    setRadarMessage('Consultando las imágenes recientes del radar…')

    rainMapProvider.loadSnapshot(controller.signal)
      .then((nextSnapshot) => {
        if (!active) return
        const latestFrame = nextSnapshot.frames.at(-1)
        setSnapshot(nextSnapshot)
        setSelectedFramePath(latestFrame?.path ?? '')
        setRadarStatus('loading')
        setRadarMessage('Preparando la capa de radar más reciente…')
      })
      .catch((error) => {
        if (!active) return
        if (error instanceof DOMException && error.name === 'AbortError' && !timedOut) return
        setRadarStatus('error')
        setRadarMessage(errorMessage(error))
      })
      .finally(() => window.clearTimeout(timeoutId))

    return () => {
      active = false
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [location, refreshVersion])

  useEffect(() => {
    if (!location || !mapNodeRef.current) return

    let cancelled = false
    let resizeObserver: ResizeObserver | undefined
    setMapError('')
    setMapReady(false)
    setHasRenderedRadar(false)
    setRenderedFrame(null)

    import('leaflet')
      .then((leaflet) => {
        if (cancelled || !mapNodeRef.current) return

        leafletRef.current = leaflet
        const map = leaflet.map(mapNodeRef.current, {
          center: [location.latitude, location.longitude],
          keyboard: true,
          maxZoom: 10,
          minZoom: 3,
          scrollWheelZoom: immersive,
          zoom: 7,
        })
        const baseLayer = leaflet.tileLayer(BASE_TILE_URL, {
          attribution: BASE_ATTRIBUTION,
          maxZoom: 19,
        })
        baseLayer.once('tileerror', () => {
          if (!cancelled) setMapError('No se pudo cargar una parte del mapa base.')
        })
        baseLayer.addTo(map)
        locationMarkerRef.current = leaflet.circleMarker(
          [location.latitude, location.longitude],
          {
            color: '#ffffff',
            fillColor: '#176b54',
            fillOpacity: 0.08,
            radius: 10,
            weight: 4,
          },
        ).addTo(map).bindTooltip(
          location.accuracyMeters
            ? `Tu ubicación aproximada · precisión ±${location.accuracyMeters} m`
            : 'Tu ubicación aproximada',
        )
        mapRef.current = map
        setMapReady(true)
        resizeObserver = new ResizeObserver(() => map.invalidateSize())
        resizeObserver.observe(mapNodeRef.current)
        window.requestAnimationFrame(() => map.invalidateSize())
      })
      .catch(() => {
        if (!cancelled) setMapError('No pudimos iniciar el mapa interactivo.')
      })

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      radarLayerRef.current?.remove()
      radarLayerRef.current = null
      locationMarkerRef.current?.remove()
      locationMarkerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      leafletRef.current = null
    }
  }, [immersive, location])

  useEffect(() => {
    const leaflet = leafletRef.current
    const map = mapRef.current
    if (!leaflet || !map || !snapshot || !selectedFrame) return

    let tileUrl: string
    try {
      tileUrl = rainMapProvider.tileUrl(snapshot, selectedFrame)
    } catch (error) {
      setRadarStatus('error')
      setRadarMessage(errorMessage(error))
      return
    }

    let active = true
    let loaded = false
    let hadTileError = false
    const previousLayer = radarLayerRef.current
    const nextLayer = leaflet.tileLayer(tileUrl, {
      attribution: '<a href="https://www.rainviewer.com/" rel="noreferrer">Radar: RainViewer</a>',
      maxNativeZoom: 7,
      maxZoom: 10,
      opacity: 0.9,
      tileSize: 256,
    })

    setRadarStatus('loading')
    setRadarMessage('Cargando la observación seleccionada…')

    const tileTimeout = window.setTimeout(() => {
      if (!active || loaded) return
      setRadarStatus('error')
      setRadarMessage('El radar tardó demasiado en cargar las imágenes visibles.')
    }, MAP_LOAD_TIMEOUT)
    const handleTileError = () => {
      hadTileError = true
    }
    const handleTilesLoaded = () => {
      if (!active || loaded) return
      loaded = true
      window.clearTimeout(tileTimeout)
      previousLayer?.remove()
      radarLayerRef.current = nextLayer
      setRenderedFrame(selectedFrame)
      setHasRenderedRadar(true)
      if (hadTileError) {
        setRadarStatus('error')
        setRadarMessage('El radar cargó de forma incompleta. Puedes reintentarlo.')
      } else {
        setRadarStatus('success')
        setRadarMessage(
          isLatestFrame
            ? `Última observación disponible cargada · ${formatRadarAge(selectedFrame.time)}.`
            : `Observación histórica cargada · ${formatRadarAge(selectedFrame.time)}.`,
        )
      }
    }

    nextLayer.on('tileerror', handleTileError)
    nextLayer.once('load', handleTilesLoaded)
    nextLayer.addTo(map)

    return () => {
      active = false
      window.clearTimeout(tileTimeout)
      nextLayer.off('tileerror', handleTileError)
      nextLayer.off('load', handleTilesLoaded)
      if (!loaded) nextLayer.remove()
    }
  }, [isLatestFrame, mapReady, selectedFrame, snapshot])

  return (
    <section
      aria-labelledby="rain-map-title"
      className={immersive ? 'rain-map-card immersive' : 'rain-map-card'}
    >
      <div className="rain-map-heading">
        <div>
          <span className="eyebrow">Radar observado</span>
          <h1 id="rain-map-title">Lluvia cerca de ti</h1>
          <p>
            {location
              ? `${location.name} · ubicación temporal${location.accuracyMeters ? ` · precisión aproximada ±${location.accuracyMeters} m` : ''}`
              : 'La ubicación se usa solo mientras esta pantalla permanece abierta.'}
          </p>
        </div>
        <button aria-label="Volver al inicio" autoFocus className="rain-map-close" onClick={onClose} type="button">×</button>
      </div>

      {!location && (
        <div className="rain-map-location-state" role="status">
          <span><Icon name="location" size={20} /></span>
          <div>
            <strong>{locationState.status === 'loading' ? 'Obteniendo ubicación…' : 'Necesitamos una ubicación temporal'}</strong>
            <p>{locationState.message ?? 'Usaremos tu ubicación aproximada o la ciudad escrita solo mientras el mapa esté abierto.'}</p>
            {locationState.status !== 'loading' && (
              <button className="secondary-button" onClick={onRequestLocation} type="button">Intentar de nuevo</button>
            )}
          </div>
        </div>
      )}

      {location && (
        <>
          <div className="rain-map-stage">
            <div
              aria-label={`Mapa de lluvia reciente alrededor de ${location.name}`}
              className="rain-map-canvas"
              ref={mapNodeRef}
              role="region"
              tabIndex={0}
            />
            {!hasRenderedRadar && radarStatus === 'loading' && (
              <div className="rain-map-overlay" role="status">Cargando radar…</div>
            )}

            {snapshot && selectedFrame && (
              <div className="rain-playback" aria-label="Controles de animación del radar">
                <div className="rain-playback-buttons">
                  <button
                    aria-label="Observación anterior"
                    disabled={selectedFrameIndex <= 0}
                    onClick={() => moveFrame(-1)}
                    type="button"
                  >Anterior</button>
                  <button
                    aria-pressed={isPlaying}
                    disabled={prefersReducedMotion || snapshot.frames.length < 2}
                    onClick={() => setIsPlaying((current) => !current)}
                    type="button"
                  >{isPlaying ? 'Pausar' : 'Reproducir'}</button>
                  <button
                    aria-label="Observación siguiente"
                    disabled={selectedFrameIndex >= snapshot.frames.length - 1}
                    onClick={() => moveFrame(1)}
                    type="button"
                  >Siguiente</button>
                </div>
                <label className="rain-timeline">
                  <span>
                    {renderedFrame ? (
                      <>
                        <strong>{isRenderedFrameLatest ? 'Última observación visible' : 'Observación histórica visible'}</strong>
                        {' · '}{formatRadarTime(renderedFrame.time)} · {formatRadarAge(renderedFrame.time)}
                      </>
                    ) : 'Cargando la observación seleccionada…'}
                  </span>
                  <input
                    aria-valuetext={`${isLatestFrame ? 'Última observación disponible' : 'Observación histórica'} de las ${formatRadarTime(selectedFrame.time)}, ${formatRadarAge(selectedFrame.time)}; ${radarStatus === 'loading' ? 'cargando' : renderedFrame?.path === selectedFrame.path ? 'visible' : 'no visible'}`}
                    max={snapshot.frames.length - 1}
                    min="0"
                    onChange={(event) => {
                      setIsPlaying(false)
                      setSelectedFramePath(snapshot.frames[Number(event.target.value)].path)
                    }}
                    step="1"
                    type="range"
                    value={Math.max(0, selectedFrameIndex)}
                  />
                  <span className="rain-timeline-ends">
                    <span>{formatRadarTime(snapshot.frames[0].time)}</span>
                    <span>Último disponible · {formatRadarTime(snapshot.frames.at(-1)?.time ?? 0)}</span>
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className="rain-map-meta">
            <div className="rain-map-legend" aria-label="Leyenda de intensidad de lluvia">
              <span>Menor</span><span className="rain-gradient" /><span>Mayor intensidad</span>
            </div>
            <button
              className="rain-map-refresh"
              disabled={radarStatus === 'loading'}
              onClick={() => setRefreshVersion((current) => current + 1)}
              type="button"
            >
              {radarStatus === 'loading' ? <><span className="loading-spinner" /> Actualizando</> : 'Actualizar radar'}
            </button>
          </div>

          <p aria-live={isPlaying ? 'off' : 'polite'} className={radarStatus === 'error' || mapError ? 'rain-map-status error' : 'rain-map-status'}>
            {mapError || radarMessage}
            {prefersReducedMotion ? ' La reproducción está desactivada por tu preferencia de movimiento reducido.' : ''}
          </p>
          {mapError && (
            <button className="secondary-button rain-map-retry" onClick={() => window.location.reload()} type="button">Recargar mapa</button>
          )}
          {!mapError && radarStatus === 'error' && (
            <button className="secondary-button rain-map-retry" onClick={() => setRefreshVersion((current) => current + 1)} type="button">Reintentar radar</button>
          )}
          <p className="rain-map-disclaimer">El radar muestra la última observación real disponible, no una lectura instantánea: normalmente llega con varios minutos de retraso. El círculo blanco es transparente para que puedas ver la lluvia justo debajo de tu ubicación. Se consulta cada cinco minutos solo si esta pestaña está visible y en línea. RainViewer y OpenStreetMap reciben las teselas del área visible.</p>
        </>
      )}
    </section>
  )
}
