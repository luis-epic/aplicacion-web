import { useEffect, useRef, useState } from 'react'
import type { CircleMarker, LayerGroup, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { magnitudeTone, type NearbyEarthquake } from '../domain/earthquakeProximity'
import type { LocationState } from '../types/app'
import { Icon } from './Icon'

interface EarthquakeMapPanelProps {
  events: NearbyEarthquake[]
  locationState: LocationState
  onBack: () => void
  onRequestLocation: () => void
  onSelectEvent: (eventId: string) => void
  selectedEventId?: string
}

const BASE_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const BASE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function markerColor(magnitude: number): string {
  const tone = magnitudeTone(magnitude)
  if (tone === 'high') return '#b8322a'
  if (tone === 'medium') return '#d47b20'
  return '#3d7190'
}

export function EarthquakeMapPanel({
  events,
  locationState,
  onBack,
  onRequestLocation,
  onSelectEvent,
  selectedEventId,
}: EarthquakeMapPanelProps) {
  const mapNodeRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const eventLayerRef = useRef<LayerGroup | null>(null)
  const locationMarkerRef = useRef<CircleMarker | null>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const location = locationState.location

  useEffect(() => {
    if (!location || !mapNodeRef.current) return

    let cancelled = false
    let resizeObserver: ResizeObserver | undefined
    setMapError('')
    setMapReady(false)

    import('leaflet')
      .then((leaflet) => {
        if (cancelled || !mapNodeRef.current) return

        leafletRef.current = leaflet
        const map = leaflet.map(mapNodeRef.current, {
          center: [location.latitude, location.longitude],
          keyboard: true,
          maxZoom: 12,
          minZoom: 2,
          scrollWheelZoom: true,
          zoom: 5,
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
            fillOpacity: 1,
            radius: 7,
            weight: 3,
          },
        ).addTo(map).bindTooltip('Tu ubicación aproximada')
        eventLayerRef.current = leaflet.layerGroup().addTo(map)
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
      eventLayerRef.current?.clearLayers()
      eventLayerRef.current = null
      locationMarkerRef.current?.remove()
      locationMarkerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      leafletRef.current = null
    }
  }, [location])

  useEffect(() => {
    const leaflet = leafletRef.current
    const map = mapRef.current
    const eventLayer = eventLayerRef.current
    if (!leaflet || !map || !eventLayer || !location || !mapReady) return

    eventLayer.clearLayers()
    events.forEach((event) => {
      const selected = event.id === selectedEventId
      const marker = leaflet.circleMarker([event.latitude, event.longitude], {
        color: selected ? '#172e28' : '#ffffff',
        fillColor: markerColor(event.magnitude),
        fillOpacity: 0.9,
        radius: Math.min(17, Math.max(6, 5 + event.magnitude * 1.4)),
        weight: selected ? 4 : 2,
      })
      const markerLabel = `M ${event.magnitude.toFixed(1)} · ${event.place} · ${event.distanceKm} km`
      const tooltipContent = document.createElement('span')
      tooltipContent.textContent = markerLabel
      marker.bindTooltip(tooltipContent)
      marker.on('click', () => onSelectEvent(event.id))
      marker.addTo(eventLayer)

      const markerElement = marker.getElement()
      if (markerElement) {
        markerElement.setAttribute('aria-label', markerLabel)
        markerElement.setAttribute('role', 'button')
        markerElement.setAttribute('tabindex', '0')
        markerElement.addEventListener('keydown', (domEvent) => {
          const keyboardEvent = domEvent as KeyboardEvent
          if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return
          keyboardEvent.preventDefault()
          onSelectEvent(event.id)
        })
      }
    })

    if (events.length) {
      const bounds = leaflet.latLngBounds([
        [location.latitude, location.longitude],
        ...events.map((event) => [event.latitude, event.longitude] as [number, number]),
      ])
      map.fitBounds(bounds, { animate: false, maxZoom: 7, padding: [35, 35] })
    } else {
      map.setView([location.latitude, location.longitude], 5, { animate: false })
    }
  }, [events, location, mapReady, onSelectEvent, selectedEventId])

  useEffect(() => {
    const selected = events.find((event) => event.id === selectedEventId)
    if (!selected || !mapRef.current) return
    mapRef.current.panTo([selected.latitude, selected.longitude], { animate: false })
  }, [events, selectedEventId])

  return (
    <section aria-labelledby="earthquake-map-title" className="earthquake-map-card">
      <div className="earthquake-map-heading">
        <div>
          <span className="eyebrow">Observaciones de las últimas 24 h</span>
          <h1 id="earthquake-map-title">Sismos cerca de ti</h1>
          <p>{location ? `${location.name} · ubicación temporal` : 'Las distancias se calculan localmente; al mostrar el mapa, OpenStreetMap recibe las teselas de la zona visible.'}</p>
        </div>
        <button aria-label="Volver al inicio" autoFocus className="rain-map-close" onClick={onBack} type="button">×</button>
      </div>

      {!location && (
        <div className="rain-map-location-state earthquake-location-state" role="status">
          <span><Icon name="location" size={20} /></span>
          <div>
            <strong>{locationState.status === 'loading' ? 'Obteniendo ubicación…' : 'Necesitamos una ubicación temporal'}</strong>
            <p>{locationState.message ?? 'Usaremos tu ubicación aproximada o la ciudad escrita para calcular distancias localmente.'}</p>
            {locationState.status !== 'loading' && (
              <button className="secondary-button" onClick={onRequestLocation} type="button">Intentar de nuevo</button>
            )}
          </div>
        </div>
      )}

      {location && (
        <div className="earthquake-map-stage">
          <div
            aria-label={`Mapa de sismos detectados alrededor de ${location.name}`}
            className="earthquake-map-canvas"
            ref={mapNodeRef}
            role="region"
            tabIndex={0}
          />
          <div className="earthquake-map-count" aria-live="polite">
            <strong>{events.length}</strong>
            <span>{events.length === 1 ? 'evento visible' : 'eventos visibles'}</span>
          </div>
        </div>
      )}

      {mapError && <p className="earthquake-map-error" role="alert">{mapError}</p>}
      <div className="earthquake-map-legend" aria-label="Leyenda por magnitud">
        <span><i className="low" /> Menor de 4.5</span>
        <span><i className="medium" /> 4.5 a 5.9</span>
        <span><i className="high" /> 6 o más</span>
      </div>
      <p className="earthquake-map-disclaimer">Los círculos representan epicentros reportados, no el área exacta de movimiento percibido.</p>
    </section>
  )
}
