import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { FieldSessionBanner, useFieldSession } from '../components/FieldSessionProvider'
import { Icon } from '../components/Icon'
import { createTaskComment, toggleTaskChecklistItem } from '../services/fieldApi'
import { enqueueTaskTransition, loadCachedTasks, saveCachedTask } from '../services/enterpriseStorage'
import type { TaskStatus, TaskTransition, WorkTaskView } from '../types/enterprise'

const statusLabels: Record<TaskStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  BLOCKED: 'Bloqueada',
  IN_REVIEW: 'En revisión',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
}

function optimisticStatus(transition: TaskTransition): TaskStatus {
  if (transition === 'start') return 'IN_PROGRESS'
  if (transition === 'block') return 'BLOCKED'
  if (transition === 'submit-review') return 'IN_REVIEW'
  return 'COMPLETED'
}

export function WorkTasksPage() {
  const session = useFieldSession()
  const [tasks, setTasks] = useState<WorkTaskView[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'OPEN' | TaskStatus>('OPEN')
  const [comment, setComment] = useState('')
  const [localBusy, setLocalBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!session.identity) return
    const items = await loadCachedTasks(session.identity.id)
    setTasks(items)
    setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null)
  }, [session.identity])

  useEffect(() => {
    void reload()
  }, [reload, session.dataRevision])

  const filteredTasks = useMemo(() => tasks.filter((task) => (
    statusFilter === 'OPEN'
      ? task.status !== 'COMPLETED' && task.status !== 'CANCELLED'
      : task.status === statusFilter
  )), [statusFilter, tasks])
  const selected = tasks.find((task) => task.id === selectedId) ?? null

  const queueTransition = async (task: WorkTaskView, transition: TaskTransition) => {
    if (!session.identity || task.pendingTransition) return
    const optimistic: WorkTaskView = {
      ...task,
      status: optimisticStatus(transition),
      pendingTransition: transition,
      syncError: undefined,
      updatedAt: new Date().toISOString(),
    }
    await enqueueTaskTransition(session.identity.id, optimistic, {
      kind: 'task.transition',
      taskId: task.id,
      transition,
    })
    await session.outboxChanged()
    await reload()
    session.setMessage(session.isOnline
      ? 'Cambio guardado; validando con el servidor.'
      : 'Cambio guardado sin conexión. Se validará al recuperar la red.')
    if (session.isOnline) await session.synchronize(true)
  }

  const toggleChecklist = async (task: WorkTaskView, itemId: string) => {
    if (!session.identity || !session.isOnline) {
      session.setMessage('El checklist requiere conexión para evitar un doble cambio durante un reintento.')
      return
    }
    setLocalBusy(true)
    try {
      const updated = await toggleTaskChecklistItem(task.id, itemId)
      await saveCachedTask(session.identity.id, {
        ...task,
        checklist: task.checklist.map((item) => item.id === updated.id ? updated : item),
      })
      await reload()
      session.setMessage('Checklist actualizado.')
    } catch (error) {
      session.setMessage(error instanceof Error ? error.message : 'No pudimos actualizar el checklist.')
    } finally {
      setLocalBusy(false)
    }
  }

  const addComment = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected || !session.identity || !comment.trim()) return
    if (!session.isOnline) {
      session.setMessage('Los comentarios requieren conexión para garantizar que no se dupliquen.')
      return
    }
    setLocalBusy(true)
    try {
      const created = await createTaskComment(selected.id, comment.trim())
      await saveCachedTask(session.identity.id, { ...selected, comments: [...selected.comments, created] })
      setComment('')
      await reload()
      session.setMessage('Comentario publicado.')
    } catch (error) {
      session.setMessage(error instanceof Error ? error.message : 'No pudimos publicar el comentario.')
    } finally {
      setLocalBusy(false)
    }
  }

  const canOperate = Boolean(selected && session.identity && (
    selected.assigneeId === session.identity.id || session.identity.permissions.includes('tasks.complete')
  ))
  const canSubmitReview = Boolean(selected && selected.assigneeId === session.identity?.id)

  return (
    <section className="page tasks-page">
      <header className="page-header split-header">
        <div><span className="eyebrow">Centro de trabajo</span><h1>Mis tareas</h1><p>Prioridades, avances y evidencia operativa en una vista diseñada para terreno.</p></div>
        <div className="header-actions"><button className="secondary-button" disabled={session.isBusy} onClick={() => void session.synchronize(true)} type="button"><Icon name="routines" /> Sincronizar</button><button className="secondary-button" disabled={session.isBusy} onClick={() => void session.logoutSession()} type="button">Cerrar sesión</button></div>
      </header>
      <FieldSessionBanner />
      {session.message && <p className="notice-banner field-message">{session.message}</p>}

      <div className="task-filter-row" role="group" aria-label="Filtrar tareas">
        {(['OPEN', 'PENDING', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'COMPLETED'] as const).map((status) => <button className={statusFilter === status ? 'active' : ''} key={status} onClick={() => setStatusFilter(status)} type="button">{status === 'OPEN' ? 'Abiertas' : statusLabels[status]}</button>)}
      </div>

      {!tasks.length ? (
        <div className="field-empty enterprise-empty"><Icon name="briefcase" size={32} /><strong>No tienes tareas descargadas</strong><p>Conéctate para actualizar tu centro de trabajo.</p></div>
      ) : (
        <div className="task-workspace">
          <div className="task-list">
            {filteredTasks.map((task) => (
              <button className={task.id === selectedId ? 'task-list-card active' : 'task-list-card'} key={task.id} onClick={() => setSelectedId(task.id)} type="button">
                <span className={`task-priority ${task.priority.toLowerCase()}`}>{task.priority}</span>
                <strong>{task.title}</strong>
                <p>{task.projectName ?? 'Tarea corporativa'} · {task.assigneeName ?? 'Sin asignar'}</p>
                <small>{statusLabels[task.status]}{task.pendingTransition ? ' · pendiente de sincronizar' : ''}</small>
              </button>
            ))}
            {!filteredTasks.length && <p className="task-filter-empty">No hay tareas en este estado.</p>}
          </div>
          {selected && (
            <article className="task-detail">
              <header><div><span className={`task-status ${selected.status.toLowerCase()}`}>{statusLabels[selected.status]}</span><h2>{selected.title}</h2></div><span className={`task-priority ${selected.priority.toLowerCase()}`}>{selected.priority}</span></header>
              <p>{selected.description || 'Sin descripción adicional.'}</p>
              <dl className="task-metadata"><div><dt>Proyecto</dt><dd>{selected.projectName ?? 'Corporativo'}</dd></div><div><dt>Responsable</dt><dd>{selected.assigneeName ?? 'Sin asignar'}</dd></div><div><dt>Vence</dt><dd>{selected.dueAt ? new Date(selected.dueAt).toLocaleString('es') : 'Sin fecha'}</dd></div></dl>
              {selected.syncError && <p className="inline-status error">{selected.syncError}</p>}
              <div className="task-actions">
                {(selected.status === 'PENDING' || selected.status === 'BLOCKED') && <button disabled={!canOperate || Boolean(selected.pendingTransition)} onClick={() => void queueTransition(selected, 'start')} type="button">Iniciar</button>}
                {(selected.status === 'PENDING' || selected.status === 'IN_PROGRESS') && <button disabled={!canOperate || Boolean(selected.pendingTransition)} onClick={() => void queueTransition(selected, 'block')} type="button">Bloquear</button>}
                {selected.status === 'IN_PROGRESS' && <button disabled={!canOperate || Boolean(selected.pendingTransition)} onClick={() => void queueTransition(selected, 'complete')} type="button">Completar</button>}
                {selected.status === 'IN_PROGRESS' && canSubmitReview && <button disabled={Boolean(selected.pendingTransition)} onClick={() => void queueTransition(selected, 'submit-review')} type="button">Enviar a revisión</button>}
              </div>

              <section className="task-checklist"><h3>Checklist <span>{selected.checklist.filter((item) => item.completed).length}/{selected.checklist.length}</span></h3>{selected.checklist.length ? selected.checklist.map((item) => <label className={item.completed ? 'completed' : ''} key={item.id}><input checked={item.completed} disabled={localBusy || selected.status === 'COMPLETED' || selected.status === 'CANCELLED'} onChange={() => void toggleChecklist(selected, item.id)} type="checkbox" /><span>{item.label}</span></label>) : <p>Sin elementos de checklist.</p>}</section>

              <section className="task-comments"><h3>Conversación</h3><div>{selected.comments.map((item) => <article key={item.id}><strong>{item.authorName}</strong><p>{item.content}</p><small>{new Date(item.createdAt).toLocaleString('es')}</small></article>)}{!selected.comments.length && <p>Sin comentarios todavía.</p>}</div><form onSubmit={addComment}><textarea maxLength={4000} onChange={(event) => setComment(event.target.value)} placeholder="Añadir comentario…" rows={3} value={comment} /><button className="primary-button" disabled={localBusy || !comment.trim()} type="submit">Comentar</button></form></section>
            </article>
          )}
        </div>
      )}
    </section>
  )
}
