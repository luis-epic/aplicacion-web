import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RainMapPanel } from '../components/RainMapPanel'
import { OptionalFeatureBoundary } from '../components/OptionalFeatureBoundary'
import { summarizePrecipitation } from '../domain/precipitationSummary'
import {
  fetchPrecipitationForecast,
  type PrecipitationForecast,
} from '../services/precipitationForecast'
import type { LocationState, OutingDraft, RequestStatus, ResolvedLocation } from '../types/app'

interface RainMapPageProps {
  draft: OutingDraft
  onBack: () => void
  onResolveLocation: (signal?: AbortSignal) => Promise<ResolvedLocation>
}

const FORECAST_TIMEOUT = 10_000

function formatLocalHour(time: string): string {
  return time.slice(11, 16)
}

function weatherCodeLabel(code: number): string {
  if (code === 0) return 'Despejado'
  if (code <= 3) return 'Nubosidad variable'
  if (code === 45 || code === 48) return 'Niebla'
  if (code >= 51 && code <= 57) return 'Llovizna'
  if (code >= 61 && code <= 67) return 'Lluvia'
  if (code >= 71 && code <= 77) return 'Nieve'
  if (code >= 80 && code <= 82) return 'Chubascos'
  if (code >= 85 && code <= 86) return 'Chubascos de nieve'
  if (code >= 95) return 'Tormenta'
  return 'Condiciones variables'
}

function forecastErrorMessage(error: unknown, timedOut: boolean): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return timedOut
      ? 'El pronóstico tardó demasiado en responder. El radar puede seguir funcionando.'
      : ''
  }
  return error instanceof Error ? error.message : 'No pudimos cargar el pronóstico de lluvia.'
}

export function RainMapPage({ draft, onBack, onResolveLocation }: RainMapPageProps) {
  const resolveLocationRef = useRef(onResolveLocation)
  const locationControllerRef = useRef<AbortController | null>(null)
  const locationRequestRef = useRef(0)
  const forecastRequestRef = useRef(0)
  const [locationState, setLocationState] = useState<LocationState>({ status: 'idle' })
  const [forecastStatus, setForecastStatus] = useState<RequestStatus>('idle')
  const [forecast, setForecast] = useState<PrecipitationForecast | null>(null)
  const [forecastMessage, setForecastMessage] = useState('')
  const [forecastRefreshVersion, setForecastRefreshVersion] = useState(0)

  useEffect(() => {
    resolveLocationRef.current = onResolveLocation
  }, [onResolveLocation])

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
        message: 'Ubicación temporal lista. No se guardará al salir del mapa.',
      })
    } catch (error) {
      if (
        locationRequestRef.current !== requestId ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) return
      setLocationState({
        status: 'error',
        message: error instanceof Error ? error.message : 'No pudimos resolver la ubicación del mapa.',
      })
    } finally {
      if (locationControllerRef.current === controller) locationControllerRef.current = null
    }
  }, [draft.city, draft.locationMode])

  useEffect(() => {
    void requestLocation()
    return () => {
      locationControllerRef.current?.abort()
      locationRequestRef.current += 1
    }
  }, [requestLocation])

  useEffect(() => {
    const location = locationState.location
    if (!location) {
      setForecastStatus('idle')
      setForecast(null)
      setForecastMessage('')
      return
    }

    const requestId = forecastRequestRef.current + 1
    forecastRequestRef.current = requestId
    const controller = new AbortController()
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, FORECAST_TIMEOUT)

    setForecastStatus('loading')
    setForecastMessage('Calculando las próximas 12 horas…')

    fetchPrecipitationForecast(location, controller.signal)
      .then((nextForecast) => {
        if (forecastRequestRef.current !== requestId) return
        setForecast(nextForecast)
        setForecastStatus('success')
        setForecastMessage('Pronóstico actualizado.')
      })
      .catch((error) => {
        if (forecastRequestRef.current !== requestId) return
        const message = forecastErrorMessage(error, timedOut)
        if (!message) return
        setForecastStatus('error')
        setForecastMessage(message)
      })
      .finally(() => window.clearTimeout(timeoutId))

    return () => {
      forecastRequestRef.current += 1
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [forecastRefreshVersion, locationState.location])

  const summary = useMemo(() => forecast ? summarizePrecipitation(forecast) : null, [forecast])

  return (
    <div className="rain-map-page">
      <div className="rain-map-workspace">
        <OptionalFeatureBoundary featureName="el radar de lluvia" onClose={onBack}>
          <RainMapPanel
            immersive
            locationState={locationState}
            onClose={onBack}
            onRequestLocation={() => void requestLocation()}
          />
        </OptionalFeatureBoundary>

        <aside aria-labelledby="rain-forecast-title" className="rain-forecast-panel">
          <div className="rain-forecast-heading">
            <div>
              <span className="eyebrow">Pronóstico del modelo</span>
              <h2 id="rain-forecast-title">Próximas horas</h2>
            </div>
            {locationState.location && (
              <span
                className="rain-live-badge"
                title={forecast ? `Zona horaria del pronóstico: ${forecast.timezone}` : 'Las horas usarán la zona local de la ubicación'}
              >Hora local · 12 h</span>
            )}
          </div>

          {!locationState.location && (
            <div className="forecast-empty" aria-live="polite">
              <strong>Esperando ubicación</strong>
              <p>El radar y el pronóstico se cargarán por separado cuando la ubicación temporal esté lista.</p>
            </div>
          )}

          {locationState.location && forecastStatus === 'loading' && !forecast && (
            <div className="forecast-empty" role="status">
              <span className="loading-spinner" />
              <strong>Consultando Open-Meteo</strong>
              <p>{forecastMessage}</p>
            </div>
          )}

          {locationState.location && forecastStatus === 'error' && !forecast && (
            <div className="forecast-empty error" role="alert">
              <strong>Pronóstico no disponible</strong>
              <p>{forecastMessage}</p>
              <button
                className="secondary-button"
                onClick={() => setForecastRefreshVersion((current) => current + 1)}
                type="button"
              >Reintentar pronóstico</button>
            </div>
          )}

          {forecast && summary && (
            <>
              <section aria-labelledby="rain-now-title" className="rain-now-card">
                <span>Ahora · {formatLocalHour(forecast.current.time)}</span>
                <div>
                  <div>
                    <h3 id="rain-now-title">{weatherCodeLabel(forecast.current.weatherCode)}</h3>
                    <p>{summary.hasCurrentPrecipitation ? 'El modelo detecta precipitación en este punto.' : 'El modelo no detecta precipitación medible en este punto.'}</p>
                  </div>
                  <strong>{summary.currentPrecipitation.toFixed(1)} <small>mm</small></strong>
                </div>
              </section>

              <dl className="rain-summary-grid">
                <div>
                  <dt>Máxima probabilidad</dt>
                  <dd>{summary.maximumProbability}%</dd>
                  <small>próximas 6 h</small>
                </div>
                <div>
                  <dt>Acumulado estimado</dt>
                  <dd>{summary.projectedAccumulation.toFixed(1)} mm</dd>
                  <small>próximas 6 h</small>
                </div>
                <div>
                  <dt>Primera señal</dt>
                  <dd>{summary.nextRain ? formatLocalHour(summary.nextRain.time) : 'Sin señal'}</dd>
                  <small>{summary.nextRain ? `${Math.round(summary.nextRain.probability)}% · ${summary.nextRain.precipitation.toFixed(1)} mm` : 'en las próximas 12 h'}</small>
                </div>
                <div>
                  <dt>{summary.peakHour ? 'Hora de mayor lluvia' : 'Mayor precipitación'}</dt>
                  <dd>{summary.peakHour ? formatLocalHour(summary.peakHour.time) : 'Sin lluvia'}</dd>
                  <small>{summary.peakHour ? `${summary.peakHour.precipitation.toFixed(1)} mm estimados` : 'sin acumulado medible en 6 h'}</small>
                </div>
              </dl>

              <section aria-labelledby="hourly-rain-title" className="rain-hourly-section">
                <div className="rain-hourly-heading">
                  <h3 id="hourly-rain-title">Detalle horario</h3>
                  <button
                    disabled={forecastStatus === 'loading'}
                    onClick={() => setForecastRefreshVersion((current) => current + 1)}
                    type="button"
                  >{forecastStatus === 'loading' ? 'Actualizando…' : 'Actualizar'}</button>
                </div>
                <div className="rain-hourly-list">
                  {forecast.hourly.map((hour) => (
                    <div className="rain-hour-row" key={hour.time}>
                      <time dateTime={hour.time}>{formatLocalHour(hour.time)}</time>
                      <span>{weatherCodeLabel(hour.weatherCode)}</span>
                      <strong>{Math.round(hour.probability)}%</strong>
                      <small>{hour.precipitation.toFixed(1)} mm</small>
                    </div>
                  ))}
                </div>
              </section>

              <p aria-live="polite" className={forecastStatus === 'error' ? 'forecast-update-status error' : 'forecast-update-status'}>
                {forecastStatus === 'error' ? `${forecastMessage} Se mantienen los últimos datos visibles.` : forecastMessage}
              </p>
            </>
          )}

          <footer className="rain-forecast-footer">
            <p><strong>Cómo leerlo:</strong> el radar muestra observaciones pasadas; estas cifras son estimaciones futuras del modelo y no garantizan que llueva.</p>
            <p>La ubicación vive solo en memoria durante esta pantalla: no se añade a tu checklist ni al almacenamiento local. Las coordenadas se envían temporalmente a Open-Meteo para obtener el pronóstico y los proveedores del mapa reciben las teselas del área visible.</p>
            <p>Las horas del pronóstico son locales de la ubicación consultada; las del radar usan la zona horaria de tu dispositivo.</p>
            <a href="https://open-meteo.com/" rel="noreferrer" target="_blank">Pronóstico: Open-Meteo</a>
          </footer>
        </aside>
      </div>
    </div>
  )
}
