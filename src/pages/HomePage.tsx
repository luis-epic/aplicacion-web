import { useState, type FormEvent } from 'react'
import { activityOptions, transportLabels } from '../data/mockData'
import { interpretOutingText } from '../services/localIntelligence'
import { parseSpokenOuting, recognizeOuting, supportsSpeechRecognition } from '../services/speechPlanner'
import type { AppPreferences, LocationState, OutingDraft, RequestStatus, WeatherState } from '../types/app'
import { getForecastDateRange } from '../utils/dates'
import { formatTemperature } from '../utils/temperature'
import { Icon } from '../components/Icon'

interface HomePageProps {
  draft: OutingDraft
  isGenerating: boolean
  locationState: LocationState
  notice: string
  temperatureUnit: AppPreferences['temperatureUnit']
  weatherState: WeatherState
  onDetectLocation: () => void
  onDraftChange: (draft: OutingDraft) => void
  onGenerate: () => void
  onOpenEarthquakeMonitor: () => void
  onOpenRainMap: () => void
}

export function HomePage({
  draft,
  isGenerating,
  locationState,
  notice,
  temperatureUnit,
  weatherState,
  onDetectLocation,
  onDraftChange,
  onGenerate,
  onOpenEarthquakeMonitor,
  onOpenRainMap,
}: HomePageProps) {
  const [speechStatus, setSpeechStatus] = useState<RequestStatus>('idle')
  const [speechMessage, setSpeechMessage] = useState('')
  const [smartText, setSmartText] = useState('')
  const [smartStatus, setSmartStatus] = useState<RequestStatus>('idle')
  const [smartMessage, setSmartMessage] = useState('')
  const [isInterpreting, setIsInterpreting] = useState(false)
  const weather = weatherState.weather
  const resolvedLocation = locationState.location
  const speechSupported = supportsSpeechRecognition()
  const { minimum: minimumDate, maximum: maximumDate } = getForecastDateRange()

  const updateDraft = <Key extends keyof OutingDraft>(
    key: Key,
    value: OutingDraft[Key],
  ) => onDraftChange({ ...draft, [key]: value })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onGenerate()
  }

  const handleVoicePlanning = async () => {
    setSpeechStatus('loading')
    setSpeechMessage('Escuchando… describe tu actividad, transporte, duración, hora o ciudad.')

    try {
      const transcript = await recognizeOuting()
      const result = parseSpokenOuting(transcript, draft)
      onDraftChange(result.draft)
      setSpeechStatus('success')
      setSpeechMessage(
        result.changes.length
          ? `“${result.transcript}” · Aplicamos: ${result.changes.join(', ')}.`
          : `“${result.transcript}” · No identificamos datos concretos; revisa el formulario.`,
      )
    } catch (error) {
      setSpeechStatus('error')
      setSpeechMessage(error instanceof Error ? error.message : 'No pudimos usar el dictado.')
    }
  }

  const handleSmartInterpretation = async () => {
    if (smartText.trim().length < 3) {
      setSmartStatus('error')
      setSmartMessage('Escribe una descripción de al menos tres caracteres.')
      return
    }

    setIsInterpreting(true)
    setSmartStatus('loading')
    setSmartMessage('Comprobando si hay una IA disponible en el dispositivo…')

    try {
      const result = await interpretOutingText(smartText, draft, {
        onStatus: setSmartMessage,
      })
      onDraftChange(result.draft)
      setSmartStatus('success')
      const source = result.source === 'local-ai' ? 'IA local' : 'reglas locales'
      const changes = result.changes.length
        ? ` Aplicamos: ${result.changes.join(', ')}.`
        : ' No encontramos cambios seguros; revisa el formulario.'
      setSmartMessage(`${source}: ${result.note}${changes}`)
    } catch (error) {
      setSmartStatus('error')
      setSmartMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos interpretar la descripción. Puedes completar el formulario manualmente.',
      )
    } finally {
      setIsInterpreting(false)
    }
  }

  const chipLabel = weather
    ? `${resolvedLocation?.name ?? draft.city} · ${weather.condition}`
    : locationState.status === 'success'
      ? `${resolvedLocation?.name ?? 'Ubicación'} · lista para consultar`
      : 'El clima se consulta al crear la lista'

  return (
    <div className="page home-page">
      <section className="welcome-row">
        <div>
          <span className="eyebrow">Planifica con tranquilidad</span>
          <h1>¿Qué tienes preparado para hoy?</h1>
          <p>
            Cuéntanos lo esencial. Organizaremos una lista clara para que salgas
            sin olvidar nada importante.
          </p>
        </div>
        <div aria-live="polite" className="weather-chip">
          <span className="weather-icon"><Icon name="weather" size={22} /></span>
          <span>
            <strong>{weather ? `${formatTemperature(weather.temperatureMax, temperatureUnit)} máx.${weather.source === 'cached' ? ' · guardado' : ''}` : weatherState.status === 'loading' ? 'Consultando…' : 'Pronóstico real'}</strong>
            <small>{chipLabel}</small>
          </span>
        </div>
      </section>

      {notice && <div className="notice-banner" role="status">{notice}</div>}

      <div className="home-layout">
        <form className="planner-card" onSubmit={handleSubmit}>
          <div className="card-heading">
            <div>
              <span className="step-label">Paso 1 de 1</span>
              <h2>Planifica tu salida</h2>
              <p>Solo necesitamos algunos detalles.</p>
            </div>
            <span className="draft-status">Borrador local</span>
          </div>

          <section className="voice-planner" aria-labelledby="voice-planner-title">
            <span className={speechStatus === 'loading' ? 'voice-icon listening' : 'voice-icon'}>
              <Icon name="microphone" size={20} />
            </span>
            <div className="voice-copy">
              <strong id="voice-planner-title">Descríbelo con tu voz</strong>
              <p>Por ejemplo: “Mañana voy a la universidad en metro durante cuatro horas a las ocho”.</p>
              {speechMessage && <p className={`voice-status ${speechStatus}`} role="status">{speechMessage}</p>}
            </div>
            <button
              className="voice-button"
              disabled={speechStatus === 'loading' || !speechSupported}
              onClick={handleVoicePlanning}
              type="button"
            >
              {speechStatus === 'loading' ? <><span className="loading-spinner" /> Escuchando</> : 'Dictar salida'}
            </button>
            {!speechSupported && <span className="voice-fallback">No compatible; usa el formulario.</span>}
          </section>

          <section className="smart-planner" aria-labelledby="smart-planner-title">
            <div className="smart-planner-heading">
              <span><Icon name="sparkles" size={19} /></span>
              <div>
                <strong id="smart-planner-title">Interpretación avanzada opcional</strong>
                <p>Prueba una descripción con varias actividades. Si no hay IA integrada, usaremos reglas locales.</p>
              </div>
            </div>
            <label className="sr-only" htmlFor="smart-outing">Descripción de la salida</label>
            <textarea
              id="smart-outing"
              maxLength={500}
              onChange={(event) => setSmartText(event.target.value)}
              placeholder="Ej. Mañana tengo clases, después gimnasio y volveré en bicicleta a las nueve de la noche"
              value={smartText}
            />
            <div className="smart-planner-footer">
              <p>El texto se procesa con IA del navegador o reglas locales; OPECONCA Campo no lo envía a un servidor.</p>
              <button disabled={isInterpreting} onClick={handleSmartInterpretation} type="button">
                {isInterpreting ? <><span className="loading-spinner" /> Interpretando…</> : 'Interpretar descripción'}
              </button>
            </div>
            {smartMessage && <p className={`smart-status ${smartStatus}`} role="status">{smartMessage}</p>}
          </section>

          <fieldset className="form-section">
            <legend>¿Qué vas a hacer?</legend>
            <div className="activity-grid">
              {activityOptions.map((activity) => (
                <label
                  className={draft.activity === activity.id ? 'activity-option selected' : 'activity-option'}
                  key={activity.id}
                >
                  <input
                    checked={draft.activity === activity.id}
                    name="activity"
                    onChange={() => updateDraft('activity', activity.id)}
                    type="radio"
                    value={activity.id}
                  />
                  <span className="activity-icon"><Icon name={activity.icon} size={21} /></span>
                  <span><strong>{activity.label}</strong><small>{activity.description}</small></span>
                  <span className="radio-dot" />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="form-section form-grid three-columns">
            <label className="field">
              <span>Fecha</span>
              <input
                aria-describedby="date-horizon"
                max={maximumDate}
                min={minimumDate}
                onChange={(event) => updateDraft('date', event.target.value)}
                required
                type="date"
                value={draft.date}
              />
              <small className="field-hint" id="date-horizon">Disponible desde hoy y durante los próximos 16 días.</small>
            </label>
            <label className="field">
              <span>Hora de salida</span>
              <input
                onChange={(event) => updateDraft('time', event.target.value)}
                required
                type="time"
                value={draft.time}
              />
            </label>
            <label className="field">
              <span>Tiempo fuera</span>
              <select
                onChange={(event) => updateDraft('duration', event.target.value)}
                value={draft.duration}
              >
                <option value="1">Hasta 1 hora</option>
                <option value="2">Unas 2 horas</option>
                <option value="4">Media jornada</option>
                <option value="8">Jornada completa</option>
                <option value="24">Todo el día</option>
              </select>
            </label>
          </div>

          <div className="form-section form-grid two-columns">
            <label className="field">
              <span>¿Cómo vas?</span>
              <select
                onChange={(event) => updateDraft('transport', event.target.value as OutingDraft['transport'])}
                value={draft.transport}
              >
                {Object.entries(transportLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <fieldset className="location-field">
              <legend>Ubicación para el clima</legend>
              <div className="location-toggle">
                <button
                  aria-pressed={draft.locationMode === 'current'}
                  className={draft.locationMode === 'current' ? 'active' : ''}
                  onClick={() => updateDraft('locationMode', 'current')}
                  type="button"
                >
                  <Icon name="location" size={17} /> Actual
                </button>
                <button
                  aria-pressed={draft.locationMode === 'manual'}
                  className={draft.locationMode === 'manual' ? 'active' : ''}
                  onClick={() => updateDraft('locationMode', 'manual')}
                  type="button"
                >
                  Otra ciudad
                </button>
              </div>

              {draft.locationMode === 'current' ? (
                <div className="location-action">
                  <button
                    className="detect-location-button"
                    disabled={locationState.status === 'loading' || isGenerating}
                    onClick={onDetectLocation}
                    type="button"
                  >
                    {locationState.status === 'loading' && <span className="loading-spinner" />}
                    {locationState.status === 'success' ? 'Actualizar ubicación' : 'Detectar mi ubicación'}
                  </button>
                  {locationState.message && (
                    <p className={`inline-status ${locationState.status}`} role="status">
                      {locationState.message}
                    </p>
                  )}
                </div>
              ) : (
                <div className="location-action">
                  <label className="sr-only" htmlFor="city">Ciudad</label>
                  <input
                    id="city"
                    onChange={(event) => updateDraft('city', event.target.value)}
                    placeholder="Ej. Madrid, Bogotá, Lima"
                    required
                    value={draft.city}
                  />
                  <p className="inline-status">Buscaremos la coincidencia más cercana al crear la lista.</p>
                </div>
              )}
            </fieldset>
          </div>

          <div className="form-footer">
            <p><Icon name="shield" size={16} /> Micrófono y ubicación requieren acciones explícitas. Las coordenadas no se guardan.</p>
            <button className="primary-button" disabled={isGenerating} type="submit">
              {isGenerating ? <><span className="loading-spinner light" /> Consultando clima…</> : <>Crear mi lista <Icon name="arrow" size={18} /></>}
            </button>
          </div>
        </form>

        <aside className="context-column">
          <section className="context-card" aria-live="polite">
            <div className="context-card-top">
              <span className="context-icon"><Icon name="weather" /></span>
              <span className="live-label">{weather ? weather.source === 'cached' ? 'Guardado offline' : 'Datos reales' : weatherState.status === 'loading' ? 'Consultando' : 'Sin consultar'}</span>
            </div>
            <h2>{resolvedLocation ? resolvedLocation.name : 'Tu contexto'}</h2>
            <div className="temperature-row">
              <strong>{weather ? formatTemperature(weather.temperature, temperatureUnit) : '--°'}</strong>
              <span>Máx. {weather ? formatTemperature(weather.temperatureMax, temperatureUnit) : '--'}<br />Mín. {weather ? formatTemperature(weather.temperatureMin, temperatureUnit) : '--'}</span>
            </div>
            <p className="forecast">
              {weather
                ? weather.source === 'cached'
                  ? weatherState.message ?? `${weather.condition}. Pronóstico guardado en este dispositivo.`
                  : `${weather.condition}. Pronóstico para la fecha seleccionada.`
                : weatherState.message ?? 'El pronóstico aparecerá aquí después de crear una lista.'}
            </p>
            <div className="context-divider" />
            <dl className="context-details">
              <div><dt>Prob. de lluvia</dt><dd>{weather ? `${weather.rainProbability}%` : '--'}</dd></div>
              <div><dt>Atardecer</dt><dd>{weather?.sunset ?? '--'}</dd></div>
              <div><dt>Viento máximo</dt><dd>{weather ? `${weather.windSpeed} km/h` : '--'}</dd></div>
            </dl>
            {weather && (
              <a className="weather-attribution" href="https://open-meteo.com/" rel="noreferrer" target="_blank">
                Datos meteorológicos: Open-Meteo
              </a>
            )}
          </section>

          <section aria-labelledby="earthquake-launch-title" className="earthquake-launch-card">
            <span className="earthquake-launch-icon"><Icon name="earthquake" size={21} /></span>
            <div>
              <span className="eyebrow">Eventos detectados</span>
              <h2 id="earthquake-launch-title">Sismos cerca de ti</h2>
              <p>Al abrir, usaremos la ubicación o ciudad elegida arriba para calcular distancias. El mapa solicitará a OpenStreetMap las teselas de la zona visible.</p>
            </div>
            <button className="secondary-button" onClick={onOpenEarthquakeMonitor} type="button">
              Abrir monitor sísmico <Icon name="arrow" size={16} />
            </button>
          </section>

          <section aria-labelledby="rain-map-launch-title" className="rain-map-launch-card">
            <span className="rain-map-launch-icon"><Icon name="weather" size={21} /></span>
            <div>
              <span className="eyebrow">Radar y pronóstico</span>
              <h2 id="rain-map-launch-title">¿Llueve cerca?</h2>
              <p>Abre el mapa a pantalla completa para animar el radar reciente y consultar probabilidades y acumulados de las próximas horas.</p>
            </div>
            <button className="secondary-button" onClick={onOpenRainMap} type="button">
              Ver lluvia en tiempo real <Icon name="arrow" size={16} />
            </button>
          </section>

          <section className="tip-card">
            <span className="tip-number">03</span>
            <div><strong>Entrada por voz opcional</strong><p>El dictado solo completa campos reconocibles. Siempre puedes revisar y corregir cada selección.</p></div>
          </section>
        </aside>
      </div>
    </div>
  )
}
