import { useState, type FormEvent } from 'react'
import { activityLabels, transportLabels } from '../data/mockData'
import type { Routine } from '../types/app'
import { Icon } from '../components/Icon'

interface RoutinesPageProps {
  routines: Routine[]
  onCreateRoutine: () => void
  onUpdateRoutine: (id: string, name: string, description: string) => void
  onUseRoutine: (routine: Routine) => void
}

export function RoutinesPage({
  routines,
  onCreateRoutine,
  onUpdateRoutine,
  onUseRoutine,
}: RoutinesPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [feedback, setFeedback] = useState('')

  const startEditing = (routine: Routine) => {
    setEditingId(routine.id)
    setName(routine.name)
    setDescription(routine.description)
    setFeedback('')
  }

  const saveEdit = (event: FormEvent<HTMLFormElement>, routine: Routine) => {
    event.preventDefault()
    if (!name.trim()) return
    onUpdateRoutine(routine.id, name, description)
    setEditingId(null)
    setFeedback(`Rutina “${name.trim()}” actualizada.`)
  }

  return (
    <div className="page routines-page">
      <header className="page-header split-header">
        <div>
          <span className="eyebrow">Tus planes frecuentes</span>
          <h1>Rutinas guardadas</h1>
          <p>Reutiliza una salida habitual y modifica solo lo que cambió.</p>
        </div>
        <button className="secondary-button" onClick={onCreateRoutine} type="button"><Icon name="plus" size={17} /> Guardar la lista actual</button>
      </header>

      {feedback && <div className="notice-banner" role="status">{feedback}</div>}

      <section aria-label="Rutinas disponibles" className="routine-grid">
        {routines.map((routine, index) => (
          <article className="routine-card" key={routine.id}>
            <div className="routine-top">
              <span className="routine-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="routine-top-actions">
                <span className="routine-type">{activityLabels[routine.activity]}</span>
                {editingId !== routine.id && (
                  <button aria-label={`Editar ${routine.name}`} className="routine-edit-button" onClick={() => startEditing(routine)} type="button"><Icon name="edit" size={15} /></button>
                )}
              </div>
            </div>

            {editingId === routine.id ? (
              <form className="routine-edit-form" onSubmit={(event) => saveEdit(event, routine)}>
                <label className="field"><span>Nombre</span><input autoFocus maxLength={60} onChange={(event) => setName(event.target.value)} required value={name} /></label>
                <label className="field"><span>Descripción</span><textarea maxLength={140} onChange={(event) => setDescription(event.target.value)} value={description} /></label>
                <div className="routine-edit-actions">
                  <button className="secondary-button" onClick={() => setEditingId(null)} type="button">Cancelar</button>
                  <button className="primary-button" type="submit">Guardar</button>
                </div>
              </form>
            ) : (
              <>
                <h2>{routine.name}</h2>
                <p>{routine.description}</p>
                <div className="routine-meta">
                  <span><Icon name="checklist" size={16} /> {routine.itemCount} objetos</span>
                  <span><Icon name="clock" size={16} /> {routine.duration} h</span>
                </div>
                <div className="routine-transport">{transportLabels[routine.transport]}</div>
                {routine.customItems.length > 0 && <div className="routine-custom-items">+ {routine.customItems.join(', ')}</div>}
                <footer>
                  <small>Último uso: {routine.lastUsed}</small>
                  <button onClick={() => onUseRoutine(routine)} type="button">Usar rutina <Icon name="arrow" size={16} /></button>
                </footer>
              </>
            )}
          </article>
        ))}

        <button className="empty-routine-card" onClick={onCreateRoutine} type="button">
          <span><Icon name="plus" size={22} /></span>
          <strong>Guarda otra rutina</strong>
          <small>Abre tu checklist actual y asígnale un nombre.</small>
        </button>
      </section>

      <section className="routine-info">
        <Icon name="shield" size={24} />
        <div><strong>Guardadas solo en este dispositivo</strong><p>IndexedDB conserva tus rutinas y objetos personales sin crear una cuenta ni enviarlos a un servidor.</p></div>
      </section>
    </div>
  )
}
