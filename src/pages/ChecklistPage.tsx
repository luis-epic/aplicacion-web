import { useState, type FormEvent } from 'react'
import { activityLabels, transportLabels } from '../data/mockData'
import { buildChecklistText, shareOrCopyChecklist, signalChecklist } from '../services/browserFeatures'
import type {
  AppPreferences,
  ChecklistItem,
  OutingDraft,
  RequestStatus,
  ResolvedLocation,
  WeatherContext,
} from '../types/app'
import { formatTemperatureRange, formatTemperatureText } from '../utils/temperature'
import { Icon } from '../components/Icon'

interface ChecklistPageProps {
  appliedRules: string[]
  draft: OutingDraft
  forecastStatus: RequestStatus
  items: ChecklistItem[]
  location?: ResolvedLocation
  temperatureUnit: AppPreferences['temperatureUnit']
  visibilityMessage: string
  weather?: WeatherContext
  weatherMessage?: string
  onAddItem: (label: string) => void
  onNavigateHome: () => void
  onRemoveItem: (id: string) => void
  onReviewPending: (items: ChecklistItem[]) => void
  onSaveRoutine: (name: string, description: string) => void
  onToggleItem: (id: string) => void
}

const categoryOrder: ChecklistItem['category'][] = [
  'Esenciales',
  'Clima',
  'Actividad',
  'Transporte',
  'Personales',
]

export function ChecklistPage({
  appliedRules,
  draft,
  forecastStatus,
  items,
  location,
  temperatureUnit,
  visibilityMessage,
  weather,
  weatherMessage,
  onAddItem,
  onNavigateHome,
  onRemoveItem,
  onReviewPending,
  onSaveRoutine,
  onToggleItem,
}: ChecklistPageProps) {
  const [newItem, setNewItem] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [showRoutineForm, setShowRoutineForm] = useState(false)
  const [routineName, setRoutineName] = useState('')
  const [routineDescription, setRoutineDescription] = useState('')
  const completedCount = items.filter((item) => item.completed).length
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0
  const locationLabel = location
    ? [location.name, location.detail].filter(Boolean).join(' · ')
    : draft.locationMode === 'manual'
      ? draft.city
      : 'Ubicación no disponible'

  const handleAdd = () => {
    const cleanLabel = newItem.trim()
    if (!cleanLabel) return
    onAddItem(cleanLabel)
    setNewItem('')
  }

  const handleSaveRoutine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanName = routineName.trim()
    if (!cleanName) return
    onSaveRoutine(cleanName, routineDescription)
    setFeedback(`Rutina “${cleanName}” guardada en este dispositivo.`)
    setRoutineName('')
    setRoutineDescription('')
    setShowRoutineForm(false)
  }

  const handleShare = async () => {
    setIsSharing(true)
    setFeedback('Preparando una versión de texto de tu checklist…')

    try {
      const text = buildChecklistText({ draft, items, location, temperatureUnit, weather })
      const outcome = await shareOrCopyChecklist(text)
      const messages = {
        shared: 'Lista compartida correctamente.',
        copied: 'Tu navegador no abrió el panel de compartir; copiamos la lista al portapapeles.',
        cancelled: 'No se compartió la lista.',
      }
      setFeedback(messages[outcome])
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No pudimos compartir la lista.')
    } finally {
      setIsSharing(false)
    }
  }

  const handleChecklistSignal = () => {
    const incompleteItems = items.filter((item) => !item.completed)
    const importantItems = incompleteItems.filter((item) => item.priority === 'high')
    onReviewPending(incompleteItems)
    const vibrated = signalChecklist(incompleteItems.length, importantItems.length)
    const hapticNote = vibrated ? ' También enviamos una señal háptica.' : ' Tu navegador no ofrece vibración; usamos este aviso visual.'

    if (!incompleteItems.length) {
      setFeedback(`La lista está completa: ya puedes salir con tranquilidad.${hapticNote}`)
    } else if (importantItems.length) {
      setFeedback(`Atención: faltan ${importantItems.length} ${importantItems.length === 1 ? 'objeto importante' : 'objetos importantes'}.${hapticNote}`)
    } else {
      setFeedback(`Aún faltan ${incompleteItems.length} ${incompleteItems.length === 1 ? 'objeto' : 'objetos'}, ninguno marcado como importante.${hapticNote}`)
    }
  }

  return (
    <div className="page checklist-page">
      <header className="page-header split-header">
        <div>
          <span className="eyebrow">Lista generada localmente</span>
          <h1>Todo listo para salir</h1>
          <p>{activityLabels[draft.activity]} · {draft.time} · {transportLabels[draft.transport]}</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" disabled={isSharing} onClick={handleShare} type="button">
            <Icon name="share" size={17} /> {isSharing ? 'Compartiendo…' : 'Compartir'}
          </button>
          <button className="secondary-button" onClick={handleChecklistSignal} type="button">
            <Icon name="check" size={17} /> Comprobar
          </button>
          <button className="secondary-button" onClick={() => setShowRoutineForm((current) => !current)} type="button">
            <Icon name="routines" size={17} /> Guardar rutina
          </button>
          <button className="primary-button compact" onClick={onNavigateHome} type="button">
            Nueva salida
          </button>
        </div>
      </header>

      {visibilityMessage && <div className="visibility-banner" role="status"><Icon name="bell" size={18} /> {visibilityMessage}</div>}
      {feedback && <div className="notice-banner" role="status">{feedback}</div>}
      {showRoutineForm && (
        <form className="routine-save-panel" onSubmit={handleSaveRoutine}>
          <div>
            <span className="eyebrow">Nueva rutina</span>
            <h2>Guarda esta preparación</h2>
            <p>Conservaremos actividad, duración, transporte y tus objetos personales.</p>
          </div>
          <div className="routine-save-fields">
            <label className="field"><span>Nombre</span><input autoFocus maxLength={60} onChange={(event) => setRoutineName(event.target.value)} placeholder="Ej. Viernes de oficina" required value={routineName} /></label>
            <label className="field"><span>Descripción</span><input maxLength={140} onChange={(event) => setRoutineDescription(event.target.value)} placeholder="Una nota breve, opcional" value={routineDescription} /></label>
          </div>
          <div className="routine-save-actions">
            <button className="secondary-button" onClick={() => setShowRoutineForm(false)} type="button">Cancelar</button>
            <button className="primary-button" type="submit">Guardar rutina</button>
          </div>
        </form>
      )}
      {weather?.source === 'cached' && (
        <div className="cached-weather-banner" role="status">
          <span><Icon name="weather" size={19} /></span>
          <div><strong>Pronóstico guardado</strong><p>{weatherMessage} Comprueba las condiciones cuando recuperes la conexión.</p></div>
        </div>
      )}
      {forecastStatus === 'error' && (
        <div className="weather-fallback-banner" role="status">
          <span><Icon name="weather" size={19} /></span>
          <div><strong>Lista creada sin información meteorológica</strong><p>{weatherMessage} Las demás reglas se aplicaron con normalidad.</p></div>
        </div>
      )}

      <div className="checklist-layout">
        <section className="list-card">
          <div className="progress-header">
            <div>
              <span>Tu progreso</span>
              <strong>{completedCount} de {items.length} preparados</strong>
            </div>
            <span className="progress-percent">{progress}%</span>
          </div>
          <progress aria-label={`${progress}% completado`} className="progress-track" max={100} value={progress}>{progress}%</progress>

          <div className="checklist-groups">
            {categoryOrder.map((category) => {
              const categoryItems = items.filter((item) => item.category === category)
              if (!categoryItems.length) return null
              return (
                <section className="check-group" key={category}>
                  <h2>{category}<span>{categoryItems.length}</span></h2>
                  <div className="check-items">
                    {categoryItems.map((item) => (
                      <div className={item.completed ? 'check-item completed' : 'check-item'} key={item.id}>
                        <label className="check-item-main">
                          <input
                            checked={item.completed}
                            onChange={() => onToggleItem(item.id)}
                            type="checkbox"
                          />
                          <span className="custom-checkbox"><Icon name="check" size={15} /></span>
                          <span className="check-copy">
                            <strong>{item.label}</strong>
                            <small>{formatTemperatureText(item.reason, temperatureUnit)}</small>
                          </span>
                        </label>
                        {item.priority === 'high' && <span className="priority-label">Importante</span>}
                        <button
                          aria-label={`Eliminar ${item.label}`}
                          className="remove-item-button"
                          onClick={() => onRemoveItem(item.id)}
                          title="Eliminar de la lista"
                          type="button"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>

          <div className="add-item-row">
            <label className="sr-only" htmlFor="new-item">Nuevo objeto</label>
            <input
              id="new-item"
              onChange={(event) => setNewItem(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleAdd()
              }}
              placeholder="Añadir algo más..."
              value={newItem}
            />
            <button aria-label="Añadir objeto" onClick={handleAdd} type="button"><Icon name="plus" size={19} /></button>
          </div>
        </section>

        <aside className="summary-column">
          <section className="summary-card">
            <span className="summary-label">Resumen de la salida</span>
            <h2>{activityLabels[draft.activity]}</h2>
            <dl>
              <div><dt><Icon name="clock" size={17} /> Cuándo</dt><dd>{draft.date}<br />a las {draft.time}</dd></div>
              <div><dt><Icon name="location" size={17} /> Dónde</dt><dd>{locationLabel}</dd></div>
              <div>
                <dt><Icon name="weather" size={17} /> {weather ? weather.source === 'cached' ? 'Pronóstico guardado' : 'Pronóstico real' : 'Clima'}</dt>
                <dd>{weather ? `${formatTemperatureRange(weather.temperatureMin, weather.temperatureMax, temperatureUnit)} · ${weather.condition.toLowerCase()}` : 'No disponible'}</dd>
              </div>
            </dl>
            {weather && (
              <a className="weather-attribution light-surface" href="https://open-meteo.com/" rel="noreferrer" target="_blank">
                Datos meteorológicos: Open-Meteo
              </a>
            )}
          </section>

          <section className="rules-card">
            <div className="rules-card-heading">
              <span><Icon name="sparkles" size={18} /></span>
              <div><small>Motor local</small><strong>{appliedRules.length} reglas aplicadas</strong></div>
            </div>
            <ul>
              {appliedRules.slice(0, 5).map((rule) => <li key={rule}>{rule}</li>)}
            </ul>
            {appliedRules.length > 5 && <p>Y {appliedRules.length - 5} señales más.</p>}
          </section>

          <section className="success-card">
            <span>{progress === 100 ? 'Lista completada' : 'Sigue preparando'}</span>
            <strong>{progress === 100 ? 'Ya puedes salir con tranquilidad.' : `Solo faltan ${items.length - completedCount} objetos.`}</strong>
          </section>
        </aside>
      </div>
    </div>
  )
}
