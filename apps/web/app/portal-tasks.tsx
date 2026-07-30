'use client'

import type { AuthSession } from '@opeconca/contracts'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PortalApi } from './portal-api'
import styles from './portal-workspace.module.css'

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'IN_REVIEW' | 'COMPLETED' | 'CANCELLED'
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
export type TaskRecurrence = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

type Permission = AuthSession['user']['permissions'][number]

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface ProjectItem {
  id: string
  code: string
  clientId: string
  clientName: string
  name: string
  status: string
  description: string | null
}

export interface UserOption {
  id: string
  email: string
  displayName: string
}

export interface ChecklistItemView {
  id: string
  taskId: string
  label: string
  completed: boolean
  position: number
  createdAt: string
  updatedAt: string
}

export interface TaskCommentView {
  id: string
  taskId: string
  authorId: string
  authorName: string
  content: string
  createdAt: string
}

export interface WorkTaskView {
  id: string
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  recurrence: TaskRecurrence
  creatorId: string
  creatorName: string
  assigneeId: string | null
  assigneeName: string | null
  supervisorId: string | null
  supervisorName: string | null
  sourcePublicationId: string | null
  idempotencyKey: string | null
  dueAt: string | null
  startedAt: string | null
  completedAt: string | null
  estimatedMinutes: number | null
  createdAt: string
  updatedAt: string
  checklist: ChecklistItemView[]
  comments: TaskCommentView[]
}

interface CreateTaskPayload {
  title: string
  description?: string
  projectId?: string
  assigneeId?: string
  supervisorId?: string
  priority: TaskPriority
  recurrence: TaskRecurrence
  dueAt?: string
  estimatedMinutes?: number
  idempotencyKey: string
}

interface UpdateTaskPayload {
  title: string
  description: string | null
  projectId: string | null
  priority: TaskPriority
  recurrence: TaskRecurrence
  dueAt: string | null
  estimatedMinutes: number | null
}

interface TaskFilters {
  search: string
  projectId: string
  mine: boolean
}

const STATUSES: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'COMPLETED', 'CANCELLED']
const MUTABLE_STATUSES: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'BLOCKED']
const OPEN_STATUSES: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW']
const PRIORITIES: TaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']
const RECURRENCES: TaskRecurrence[] = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']
const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}'

const statusLabels: Record<TaskStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  BLOCKED: 'Bloqueada',
  IN_REVIEW: 'En revisión',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
}

const priorityLabels: Record<TaskPriority, string> = {
  LOW: 'Baja',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
}

const recurrenceLabels: Record<TaskRecurrence, string> = {
  NONE: 'Sin recurrencia',
  DAILY: 'Diaria',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensual',
}

function can(session: AuthSession, permission: Permission): boolean {
  return session.user.permissions.includes(permission)
}

function value(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim()
}

function optionalNumber(raw: string): number | undefined {
  return raw === '' ? undefined : Number(raw)
}

function nullableNumber(raw: string): number | null {
  return raw === '' ? null : Number(raw)
}

function optionalIso(raw: string): string | undefined {
  return raw ? new Date(raw).toISOString() : undefined
}

function nullableIso(raw: string): string | null {
  return raw ? new Date(raw).toISOString() : null
}

function toDateTimeLocal(raw: string | null): string {
  if (!raw) return ''
  const date = new Date(raw)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function formatDate(raw: string | null): string {
  return raw ? new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(raw)) : 'Sin vencimiento'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.'
}

function ProjectField({ name, projects, defaultValue = '', optional = true, controlledValue, onChange }: {
  name: string
  projects: ProjectItem[]
  defaultValue?: string
  optional?: boolean
  controlledValue?: string
  onChange?: (value: string) => void
}) {
  const options = <><option value="">{optional ? 'Sin proyecto' : 'Seleccionar proyecto'}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</>
  if (projects.length) {
    return onChange
      ? <select name={name} onChange={(event) => onChange(event.target.value)} required={!optional} value={controlledValue ?? ''}>{options}</select>
      : <select defaultValue={defaultValue} name={name} required={!optional}>{options}</select>
  }
  return onChange
    ? <input name={name} onChange={(event) => onChange(event.target.value)} pattern={UUID_PATTERN} placeholder="UUID del proyecto" required={!optional} value={controlledValue ?? ''} />
    : <input defaultValue={defaultValue} name={name} pattern={UUID_PATTERN} placeholder="UUID del proyecto" required={!optional} />
}

function UserField({ label, name, users, defaultValue = '', required = false }: {
  label: string
  name: string
  users: UserOption[]
  defaultValue?: string
  required?: boolean
}) {
  return <label>{label}<select defaultValue={defaultValue} name={name} required={required}><option value="">{users.length ? required ? 'Seleccionar persona' : 'Sin asignar' : 'No hay usuarios asignables'}</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}</select></label>
}

export function TasksWorkspace({ api, session }: { api: PortalApi; session: AuthSession }) {
  const managesTasks = can(session, 'tasks.manage')
  const [tasks, setTasks] = useState<WorkTaskView[]>([])
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [membersByProject, setMembersByProject] = useState<Record<string, UserOption[]>>({})
  const [createProjectId, setCreateProjectId] = useState('')
  const [selected, setSelected] = useState<WorkTaskView | null>(null)
  const [filters, setFilters] = useState<TaskFilters>({ search: '', projectId: '', mine: !managesTasks })
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() => crypto.randomUUID())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const selectionRequest = useRef(0)
  const detailRef = useRef<HTMLElement | null>(null)
  const lastActivatorId = useRef<string | null>(null)
  const taskButtons = useRef(new Map<string, HTMLButtonElement>())

  const canRead = can(session, 'tasks.read')
  const canCreate = can(session, 'tasks.create')
  const canManage = managesTasks
  const canAssign = can(session, 'tasks.assign')
  const canComplete = can(session, 'tasks.complete')
  const canApprove = can(session, 'tasks.approve')
  const canReadProjects = can(session, 'projects.read')

  const taskQuery = useMemo(() => {
    const query = new URLSearchParams()
    if (filters.search) query.set('search', filters.search)
    if (filters.projectId) query.set('projectId', filters.projectId)
    if (filters.mine) query.set('mine', 'true')
    return query
  }, [filters])

  const loadTasks = useCallback(async (selectedId?: string | null): Promise<boolean> => {
    if (!canRead) {
      setTasks([])
      setSelected(null)
      setLoading(false)
      return true
    }
    setLoading(true)
    setError('')
    const detailRequestId = selectedId ? ++selectionRequest.current : null
    try {
      const firstQuery = new URLSearchParams(taskQuery)
      firstQuery.set('page', '1')
      firstQuery.set('pageSize', '100')
      const firstPage = await api.request<PageResult<WorkTaskView>>(`/tasks?${firstQuery}`)
      const pageCount = Math.ceil(firstPage.total / firstPage.pageSize)
      const remainingPages = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => {
        const nextQuery = new URLSearchParams(taskQuery)
        nextQuery.set('page', String(index + 2))
        nextQuery.set('pageSize', String(firstPage.pageSize))
        return api.request<PageResult<WorkTaskView>>(`/tasks?${nextQuery}`)
      }))
      setTasks([firstPage, ...remainingPages].flatMap((page) => page.items))
      if (selectedId) {
        const detail = await api.request<WorkTaskView>(`/tasks/${selectedId}`)
        if (detailRequestId === selectionRequest.current) setSelected(detail)
      }
      return true
    } catch (nextError) {
      setError(errorMessage(nextError))
      return false
    } finally {
      setLoading(false)
    }
  }, [api, canRead, taskQuery])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const loadProjectMembers = useCallback(async (projectId: string): Promise<void> => {
    if (!projectId || !canAssign) return
    try {
      const page = await api.request<PageResult<UserOption>>(`/tasks/assignment-candidates?projectId=${encodeURIComponent(projectId)}&page=1&pageSize=100`)
      setMembersByProject((current) => ({ ...current, [projectId]: page.items }))
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [api, canAssign])

  const focusedTaskId = selected?.id
  useEffect(() => {
    if (!focusedTaskId) return
    const frame = window.requestAnimationFrame(() => detailRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [focusedTaskId])

  useEffect(() => {
    if (selected?.projectId) void loadProjectMembers(selected.projectId)
  }, [loadProjectMembers, selected?.projectId])

  useEffect(() => {
    let active = true
    const loadReferences = async () => {
      try {
        const [projectPage, userPage] = await Promise.all([
          canReadProjects
            ? api.request<PageResult<ProjectItem>>('/projects?page=1&pageSize=100')
            : Promise.resolve<PageResult<ProjectItem>>({ items: [], page: 1, pageSize: 100, total: 0 }),
          canAssign
            ? api.request<PageResult<UserOption>>('/tasks/assignment-candidates?page=1&pageSize=100')
            : Promise.resolve<PageResult<UserOption>>({ items: [], page: 1, pageSize: 100, total: 0 }),
        ])
        if (active) {
          setProjects(projectPage.items)
          setUsers(userPage.items)
        }
      } catch (nextError) {
        if (active) setError(errorMessage(nextError))
      }
    }
    void loadReferences()
    return () => { active = false }
  }, [api, canAssign, canReadProjects])

  const run = async (
    operation: () => Promise<unknown>,
    message: string,
    selectedId: string | null = selected?.id ?? null,
  ): Promise<boolean> => {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await operation()
      const refreshed = selectedId ? await loadTasks(selectedId) : await loadTasks()
      if (!refreshed) return false
      setSuccess(message)
      return true
    } catch (nextError) {
      setError(errorMessage(nextError))
      return false
    } finally {
      setBusy(false)
    }
  }

  const selectTask = async (taskId: string, activator: HTMLButtonElement) => {
    const requestId = ++selectionRequest.current
    lastActivatorId.current = taskId
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const detail = await api.request<WorkTaskView>(`/tasks/${taskId}`)
      if (requestId === selectionRequest.current) setSelected(detail)
    } catch (nextError) {
      if (requestId === selectionRequest.current) setError(errorMessage(nextError))
    } finally {
      if (requestId === selectionRequest.current) setLoading(false)
      taskButtons.current.set(taskId, activator)
    }
  }

  const closeDetail = () => {
    const activatorId = lastActivatorId.current
    setSelected(null)
    window.requestAnimationFrame(() => {
      if (activatorId) taskButtons.current.get(activatorId)?.focus()
    })
  }

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSelected(null)
    setFilters({ search: value(form, 'search'), projectId: value(form, 'projectId'), mine: !canManage || form.get('mine') === 'on' })
  }

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)
    const projectId = value(form, 'projectId')
    const assigneeId = value(form, 'assigneeId')
    const supervisorId = value(form, 'supervisorId')
    const payload: CreateTaskPayload = {
      title: value(form, 'title'),
      description: value(form, 'description') || undefined,
      projectId: projectId || undefined,
      priority: value(form, 'priority') as TaskPriority,
      recurrence: value(form, 'recurrence') as TaskRecurrence,
      dueAt: optionalIso(value(form, 'dueAt')),
      estimatedMinutes: optionalNumber(value(form, 'estimatedMinutes')),
      idempotencyKey: createIdempotencyKey,
      ...(canAssign && assigneeId ? { assigneeId } : {}),
      ...(canAssign && supervisorId ? { supervisorId } : {}),
    }
    if (await run(() => api.request<WorkTaskView>('/tasks', { method: 'POST', body: JSON.stringify(payload) }), 'Tarea creada.', null)) {
      target.reset()
      setCreateProjectId('')
      setCreateIdempotencyKey(crypto.randomUUID())
    }
  }

  const updateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    const payload: UpdateTaskPayload = {
      title: value(form, 'title'),
      description: value(form, 'description') || null,
      projectId: value(form, 'projectId') || null,
      priority: value(form, 'priority') as TaskPriority,
      recurrence: value(form, 'recurrence') as TaskRecurrence,
      dueAt: nullableIso(value(form, 'dueAt')),
      estimatedMinutes: nullableNumber(value(form, 'estimatedMinutes')),
    }
    await run(() => api.request<WorkTaskView>(`/tasks/${selected.id}`, { method: 'PATCH', body: JSON.stringify(payload) }), 'Tarea actualizada.')
  }

  const assignTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    await run(() => api.request<WorkTaskView>(`/tasks/${selected.id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId: value(form, 'assigneeId'), supervisorId: value(form, 'supervisorId') || null }),
    }), 'Asignación actualizada.')
  }

  const transition = (action: 'start' | 'block' | 'complete' | 'submit-review' | 'approve' | 'reopen', message: string) => {
    if (!selected) return
    void run(() => api.request<WorkTaskView>(`/tasks/${selected.id}/${action}`, { method: 'POST' }), message)
  }

  const cancelTask = () => {
    if (!selected || !window.confirm('¿Cancelar esta tarea? Esta acción cambia su estado a cancelada.')) return
    void run(() => api.request<WorkTaskView>(`/tasks/${selected.id}/cancel`, { method: 'POST' }), 'Tarea cancelada.')
  }

  const deleteTask = () => {
    if (!selected || !window.confirm('¿Eliminar definitivamente esta tarea pendiente?')) return
    const id = selected.id
    void run(async () => {
      await api.request<void>(`/tasks/${id}`, { method: 'DELETE' })
      setSelected(null)
    }, 'Tarea eliminada.', null)
  }

  const createChecklistItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const target = event.currentTarget
    const form = new FormData(target)
    if (await run(() => api.request<ChecklistItemView>(`/tasks/${selected.id}/checklist`, {
      method: 'POST',
      body: JSON.stringify({ label: value(form, 'label'), position: selected.checklist.length }),
    }), 'Elemento agregado.')) target.reset()
  }

  const updateChecklistItem = async (event: FormEvent<HTMLFormElement>, item: ChecklistItemView) => {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    await run(() => api.request<ChecklistItemView>(`/tasks/${selected.id}/checklist/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ label: value(form, 'label'), position: item.position }),
    }), 'Elemento actualizado.')
  }

  const toggleChecklistItem = (item: ChecklistItemView) => {
    if (!selected) return
    void run(() => api.request<ChecklistItemView>(`/tasks/${selected.id}/checklist/${item.id}/toggle`, { method: 'POST' }), 'Checklist actualizado.')
  }

  const deleteChecklistItem = (item: ChecklistItemView) => {
    if (!selected || !window.confirm(`¿Eliminar “${item.label}” del checklist?`)) return
    void run(() => api.request<void>(`/tasks/${selected.id}/checklist/${item.id}`, { method: 'DELETE' }), 'Elemento eliminado.')
  }

  const createComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const target = event.currentTarget
    const form = new FormData(target)
    if (await run(() => api.request<TaskCommentView>(`/tasks/${selected.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: value(form, 'content') }),
    }), 'Comentario publicado.')) target.reset()
  }

  const createAssignableUsers: UserOption[] = createProjectId ? membersByProject[createProjectId] ?? [] : users
  const selectedAssignableUsers: UserOption[] = selected?.projectId ? membersByProject[selected.projectId] ?? [] : users
  const canMutateSelected = Boolean(selected && MUTABLE_STATUSES.includes(selected.status) && (selected.creatorId === session.user.id || canManage))
  const canToggleSelected = Boolean(selected && MUTABLE_STATUSES.includes(selected.status) && (selected.assigneeId === session.user.id || selected.creatorId === session.user.id || canManage))
  const canWorkSelected = Boolean(selected && (selected.assigneeId === session.user.id || canComplete))

  if (!canRead) return <section className={styles.tasksWorkspace}><p className={styles.error} role="alert">No tienes permiso para consultar tareas.</p></section>

  return <section className={styles.tasksWorkspace} aria-labelledby="tasks-title">
    <header className={styles.tasksHeader}>
      <div><p className={styles.eyebrow}>Espacio de trabajo</p><h1 id="tasks-title">Tareas</h1></div>
      <button disabled={loading || busy} onClick={() => void loadTasks(selected?.id)} type="button">Actualizar</button>
    </header>

    {success && <p className={styles.success} role="status">{success}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {(loading || busy) && <p className={styles.loading} role="status" aria-live="polite">{busy ? 'Guardando cambios…' : 'Cargando tareas…'}</p>}

    <form className={styles.taskFilters} onSubmit={submitFilters}>
      <label>Buscar<input defaultValue={filters.search} name="search" placeholder="Título, descripción o proyecto" type="search" /></label>
      <label>Proyecto<ProjectField defaultValue={filters.projectId} name="projectId" projects={projects} /></label>
      <label className={styles.checkboxField}><input defaultChecked={filters.mine} disabled={!canManage} name="mine" type="checkbox" /> Sólo mis tareas{!canManage && <small>Tu acceso está limitado a tus tareas.</small>}</label>
      <button disabled={loading || busy} type="submit">Aplicar filtros</button>
    </form>

    {canCreate && <details className={styles.taskCreate}>
      <summary>Nueva tarea</summary>
      <form className={styles.form} onSubmit={(event) => void createTask(event)}>
        <label>Título<input maxLength={180} name="title" required /></label>
        <label>Descripción<textarea maxLength={10_000} name="description" /></label>
        <label>Proyecto<ProjectField controlledValue={createProjectId} name="projectId" onChange={(projectId) => { setCreateProjectId(projectId); if (projectId) void loadProjectMembers(projectId) }} projects={projects} /></label>
        <label>Prioridad<select defaultValue="NORMAL" name="priority">{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select></label>
        <label>Vencimiento<input name="dueAt" type="datetime-local" /></label>
        <label>Estimación (minutos)<input max={100_000} min={0} name="estimatedMinutes" step={1} type="number" /></label>
        <label>Recurrencia<select defaultValue="NONE" name="recurrence">{RECURRENCES.map((recurrence) => <option key={recurrence} value={recurrence}>{recurrenceLabels[recurrence]}</option>)}</select></label>
        {canAssign && <fieldset className={styles.assignmentFields} key={createProjectId || 'no-project'}><legend>Asignación inicial</legend><UserField label="Responsable" name="assigneeId" users={createAssignableUsers} /><UserField label="Supervisor" name="supervisorId" users={createAssignableUsers} /></fieldset>}
        <button disabled={busy} type="submit">Crear tarea</button>
      </form>
    </details>}

    <div className={styles.kanban} aria-label="Tablero Kanban de tareas">
      {STATUSES.map((status) => {
        const columnTasks = tasks.filter((task) => task.status === status)
        return <section className={styles.kanbanColumn} key={status} aria-labelledby={`column-${status}`}>
          <header className={styles.kanbanColumnHeader}><h2 id={`column-${status}`}>{statusLabels[status]}</h2><span>{columnTasks.length}</span></header>
          <div className={styles.taskCards}>{columnTasks.length ? columnTasks.map((task) => <article
            className={`${styles.taskCard} ${selected?.id === task.id ? styles.taskCardSelected : ''}`}
            key={task.id}
          >
            <span className={`${styles.priorityBadge} ${styles[`priority${task.priority}`]}`}>{priorityLabels[task.priority]}</span>
            <h3>{task.title}</h3>
            <p>{task.projectCode ? `${task.projectCode} · ${task.projectName}` : 'Sin proyecto'}</p>
            <dl className={styles.taskMeta}>
              <div><dt>Responsable</dt><dd>{task.assigneeName ?? 'Sin asignar'}</dd></div>
              <div><dt>Supervisor</dt><dd>{task.supervisorName ?? 'Sin supervisor'}</dd></div>
              <div><dt>Vencimiento</dt><dd>{formatDate(task.dueAt)}</dd></div>
              <div><dt>Recurrencia</dt><dd>{recurrenceLabels[task.recurrence]}</dd></div>
            </dl>
            <button
              aria-label={`Ver detalle de ${task.title}`}
              className={styles.taskCardSelect}
              disabled={loading || busy}
              onClick={(event) => void selectTask(task.id, event.currentTarget)}
              ref={(element) => { if (element) taskButtons.current.set(task.id, element); else taskButtons.current.delete(task.id) }}
              type="button"
            >Ver detalle</button>
          </article>) : <p className={styles.kanbanEmpty}>Sin tareas</p>}</div>
        </section>
      })}
    </div>

    {selected && <aside className={styles.taskDetail} aria-labelledby="task-detail-title" ref={detailRef} tabIndex={-1}>
      <header className={styles.taskDetailHeader}>
        <div><span className={styles.badge}>{statusLabels[selected.status]}</span><h2 id="task-detail-title">{selected.title}</h2></div>
        <button onClick={closeDetail} type="button">Cerrar detalle</button>
      </header>

      <p className={styles.taskDescription}>{selected.description || 'Sin descripción.'}</p>
      <dl className={styles.detailMeta}>
        <div><dt>Proyecto</dt><dd>{selected.projectCode ? `${selected.projectCode} · ${selected.projectName}` : 'Sin proyecto'}</dd></div>
        <div><dt>Prioridad</dt><dd>{priorityLabels[selected.priority]}</dd></div>
        <div><dt>Creador</dt><dd>{selected.creatorName}</dd></div>
        <div><dt>Responsable</dt><dd>{selected.assigneeName ?? 'Sin asignar'}</dd></div>
        <div><dt>Supervisor</dt><dd>{selected.supervisorName ?? 'Sin supervisor'}</dd></div>
        <div><dt>Vencimiento</dt><dd>{formatDate(selected.dueAt)}</dd></div>
        <div><dt>Estimación</dt><dd>{selected.estimatedMinutes === null ? 'Sin estimación' : `${selected.estimatedMinutes} minutos`}</dd></div>
        <div><dt>Recurrencia</dt><dd>{recurrenceLabels[selected.recurrence]}</dd></div>
      </dl>

      <section className={styles.taskActions} aria-labelledby="task-actions-title">
        <h3 id="task-actions-title">Acciones</h3>
        <div className={styles.actions}>
          {canWorkSelected && (selected.status === 'PENDING' || selected.status === 'BLOCKED') && <button disabled={busy} onClick={() => transition('start', 'Tarea iniciada.')} type="button">Iniciar</button>}
          {canWorkSelected && (selected.status === 'PENDING' || selected.status === 'IN_PROGRESS') && <button disabled={busy} onClick={() => transition('block', 'Tarea bloqueada.')} type="button">Bloquear</button>}
          {canWorkSelected && (selected.status === 'IN_PROGRESS' || selected.status === 'BLOCKED') && <button disabled={busy} onClick={() => transition('complete', 'Tarea completada.')} type="button">Completar</button>}
          {selected.assigneeId === session.user.id && selected.status === 'IN_PROGRESS' && <button disabled={busy} onClick={() => transition('submit-review', 'Tarea enviada a revisión.')} type="button">Enviar a revisión</button>}
          {canApprove && selected.status === 'IN_REVIEW' && selected.assigneeId !== session.user.id && <button disabled={busy} onClick={() => transition('approve', 'Tarea aprobada.')} type="button">Aprobar</button>}
          {canApprove && (selected.status === 'IN_REVIEW' || selected.status === 'COMPLETED') && <button disabled={busy} onClick={() => transition('reopen', 'Tarea reabierta.')} type="button">Reabrir</button>}
          {canManage && OPEN_STATUSES.includes(selected.status) && <button className={styles.danger} disabled={busy} onClick={cancelTask} type="button">Cancelar</button>}
          {canManage && selected.status === 'PENDING' && <button className={styles.danger} disabled={busy} onClick={deleteTask} type="button">Eliminar</button>}
        </div>
      </section>

      {canMutateSelected && <details className={styles.taskEdit}>
        <summary>Editar metadatos</summary>
        <form className={styles.form} key={selected.updatedAt} onSubmit={(event) => void updateTask(event)}>
          <label>Título<input defaultValue={selected.title} maxLength={180} name="title" required /></label>
          <label>Descripción<textarea defaultValue={selected.description ?? ''} maxLength={10_000} name="description" /></label>
          <label>Proyecto<ProjectField defaultValue={selected.projectId ?? ''} name="projectId" projects={projects} /></label>
          <label>Prioridad<select defaultValue={selected.priority} name="priority">{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select></label>
          <label>Vencimiento<input defaultValue={toDateTimeLocal(selected.dueAt)} name="dueAt" type="datetime-local" /></label>
          <label>Estimación (minutos)<input defaultValue={selected.estimatedMinutes ?? ''} max={100_000} min={0} name="estimatedMinutes" step={1} type="number" /></label>
          <label>Recurrencia<select defaultValue={selected.recurrence} name="recurrence">{RECURRENCES.map((recurrence) => <option key={recurrence} value={recurrence}>{recurrenceLabels[recurrence]}</option>)}</select></label>
          <button disabled={busy} type="submit">Guardar metadatos</button>
        </form>
      </details>}

      {canAssign && MUTABLE_STATUSES.includes(selected.status) && <details className={styles.taskAssignment}>
        <summary>Asignación</summary>
        <form className={styles.form} key={`assignment-${selected.updatedAt}`} onSubmit={(event) => void assignTask(event)}>
          <UserField defaultValue={selected.assigneeId ?? ''} label="Responsable" name="assigneeId" required users={selectedAssignableUsers} />
          <UserField defaultValue={selected.supervisorId ?? ''} label="Supervisor" name="supervisorId" users={selectedAssignableUsers} />
          <button disabled={busy} type="submit">Guardar asignación</button>
        </form>
      </details>}

      <section className={styles.checklist} aria-labelledby="checklist-title">
        <h3 id="checklist-title">Checklist</h3>
        {selected.checklist.length ? <ul className={styles.checklistItems}>{selected.checklist.map((item) => <li key={item.id}>
          <label className={styles.checklistToggle}><input checked={item.completed} disabled={busy || !canToggleSelected} onChange={() => toggleChecklistItem(item)} type="checkbox" /><span>{item.completed ? 'Completado' : 'Pendiente'}</span></label>
          {canMutateSelected ? <form className={styles.checklistEdit} onSubmit={(event) => void updateChecklistItem(event, item)}>
            <label><span className={styles.visuallyHidden}>Texto del elemento</span><input defaultValue={item.label} maxLength={300} name="label" required /></label>
            <button disabled={busy} type="submit">Guardar</button>
            <button className={styles.danger} disabled={busy} onClick={() => deleteChecklistItem(item)} type="button">Eliminar</button>
          </form> : <span>{item.label}</span>}
        </li>)}</ul> : <p className={styles.empty}>No hay elementos en el checklist.</p>}
        {canMutateSelected && <form className={styles.inlineForm} onSubmit={(event) => void createChecklistItem(event)}>
          <label><span>Nuevo elemento</span><input maxLength={300} name="label" required /></label><button disabled={busy} type="submit">Agregar</button>
        </form>}
      </section>

      <section className={styles.comments} aria-labelledby="comments-title">
        <h3 id="comments-title">Comentarios</h3>
        {selected.comments.length ? <ol className={styles.commentList}>{selected.comments.map((comment) => <li key={comment.id}><header><strong>{comment.authorName}</strong><time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time></header><p>{comment.content}</p></li>)}</ol> : <p className={styles.empty}>No hay comentarios.</p>}
        {OPEN_STATUSES.includes(selected.status) && <form className={styles.form} onSubmit={(event) => void createComment(event)}>
          <label>Nuevo comentario<textarea maxLength={4_000} name="content" required /></label><button disabled={busy} type="submit">Publicar comentario</button>
        </form>}
      </section>
    </aside>}
  </section>
}
