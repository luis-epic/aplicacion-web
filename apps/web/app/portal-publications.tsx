'use client'

import type { AuthSession } from '@opeconca/contracts'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { PortalApi } from './portal-api'
import styles from './portal-workspace.module.css'

type Permission = AuthSession['user']['permissions'][number]
type PublicationType = 'DAILY' | 'WEEKLY' | 'PROJECT_NEWS' | 'SAFETY' | 'HR' | 'RECOGNITION' | 'URGENT'
type PublicationStatus = 'DRAFT' | 'IN_REVIEW' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'
type PublicationAudience = 'ALL' | 'PROJECT' | 'ROLE'
type PublicationPriority = 'NORMAL' | 'IMPORTANT' | 'URGENT'
type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'IN_REVIEW' | 'COMPLETED' | 'CANCELLED'
type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
type TaskRecurrence = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
type UserStatus = 'ACTIVE' | 'INACTIVE'

interface PageResponse<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

interface PublicationResponse {
  id: string
  title: string
  slug: string
  summary: string
  content: string
  coverImageUrl: string | null
  type: PublicationType
  category: string
  status: PublicationStatus
  priority: PublicationPriority
  audience: PublicationAudience
  audienceRoleCode: string | null
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  authorId: string
  authorName: string
  reviewerId: string | null
  reviewerName: string | null
  scheduledAt: string | null
  publishedAt: string | null
  expiresAt: string | null
  acknowledgementCount: number
  generatedTaskCount: number
  createdAt: string
  updatedAt: string
}

interface AcknowledgementResponse {
  publicationId: string
  userId: string
  userName: string
  userEmail: string
  readAt: string
}

interface GeneratedTaskResponse {
  id: string
  projectId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  recurrence: TaskRecurrence
  creatorId: string
  assigneeId: string | null
  supervisorId: string | null
  sourcePublicationId: string | null
  idempotencyKey: string | null
  dueAt: string | null
  estimatedMinutes: number | null
  createdAt: string
  updatedAt: string
}

interface ProjectMemberResponse {
  userId: string
  displayName: string
  email: string
  role: 'SUPERVISOR' | 'WORKER' | 'VIEWER'
  joinedAt: string
}

interface ProjectResponse {
  id: string
  code: string
  clientId: string
  clientName: string
  name: string
  description: string | null
  status: ProjectStatus
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
  members?: ProjectMemberResponse[]
}

interface UserResponse {
  id: string
  email: string
  displayName: string
  status: UserStatus
  roles: Array<{ id: string; code: string; name: string }>
  createdAt: string
  updatedAt: string
}

interface UserOption {
  id: string
  email: string
  displayName: string
}

interface PublicationEditor {
  title: string
  slug: string
  summary: string
  content: string
  coverImageUrl: string
  type: PublicationType
  category: string
  priority: PublicationPriority
  audience: PublicationAudience
  projectId: string
  audienceRoleCode: string
  scheduledAt: string
  expiresAt: string
}

interface FeedFilters {
  search: string
  type: '' | PublicationType
  category: string
  projectId: string
}

interface WorkspaceFilters {
  search: string
  status: '' | PublicationStatus
  type: '' | PublicationType
  audience: '' | PublicationAudience
  priority: '' | PublicationPriority
}

interface TaskEditor {
  title: string
  description: string
  projectId: string
  assigneeId: string
  supervisorId: string
  priority: TaskPriority
  dueAt: string
  estimatedMinutes: string
  recurrence: TaskRecurrence
  idempotencyKey: string
}

const publicationTypes: PublicationType[] = ['DAILY', 'WEEKLY', 'PROJECT_NEWS', 'SAFETY', 'HR', 'RECOGNITION', 'URGENT']
const publicationStatuses: PublicationStatus[] = ['DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']
const publicationPriorities: PublicationPriority[] = ['NORMAL', 'IMPORTANT', 'URGENT']
const taskPriorities: TaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']
const taskRecurrences: TaskRecurrence[] = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']

const emptyEditor = (): PublicationEditor => ({
  title: '', slug: '', summary: '', content: '', coverImageUrl: '', type: 'DAILY', category: '',
  priority: 'NORMAL', audience: 'ALL', projectId: '', audienceRoleCode: '', scheduledAt: '', expiresAt: '',
})

const emptyTask = (): TaskEditor => ({
  title: '', description: '', projectId: '', assigneeId: '', supervisorId: '', priority: 'NORMAL',
  dueAt: '', estimatedMinutes: '', recurrence: 'NONE', idempotencyKey: crypto.randomUUID(),
})

function hasPermission(session: AuthSession, permission: Permission): boolean {
  return session.user.permissions.includes(permission)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.'
}

function toIso(localDateTime: string): string | undefined {
  return localDateTime ? new Date(localDateTime).toISOString() : undefined
}

function toLocalDateTime(isoDateTime: string | null): string {
  if (!isoDateTime) return ''
  const date = new Date(isoDateTime)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha'
}

function label(value: string): string {
  return value.replaceAll('_', ' ')
}

function queryString(values: FeedFilters | WorkspaceFilters): string {
  const query = new URLSearchParams({ page: '1', pageSize: '50' })
  const entries = Object.entries(values) as Array<[string, string]>
  entries.forEach(([key, value]) => { if (value.trim()) query.set(key, value.trim()) })
  return query.toString()
}

export function PublicationsWorkspace({ api, session }: { api: PortalApi; session: AuthSession }) {
  const canRead = hasPermission(session, 'publications.read')
  const canCreate = hasPermission(session, 'publications.create')
  const canManage = hasPermission(session, 'publications.manage')
  const canPublish = hasPermission(session, 'publications.publish')
  const canCreateTasks = hasPermission(session, 'tasks.create')
  const canAssignTasks = hasPermission(session, 'tasks.assign')
  const canReadProjects = hasPermission(session, 'projects.read')
  const canReadUsers = hasPermission(session, 'users.read')

  const [feed, setFeed] = useState<PublicationResponse[]>([])
  const [workspaceItems, setWorkspaceItems] = useState<PublicationResponse[]>([])
  const [selected, setSelected] = useState<PublicationResponse | null>(null)
  const [acknowledgements, setAcknowledgements] = useState<AcknowledgementResponse[]>([])
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedTaskResponse[]>([])
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [users, setUsers] = useState<UserResponse[]>([])
  const [taskProjectUsers, setTaskProjectUsers] = useState<UserOption[]>([])
  const [feedFilters, setFeedFilters] = useState<FeedFilters>({ search: '', type: '', category: '', projectId: '' })
  const [workspaceFilters, setWorkspaceFilters] = useState<WorkspaceFilters>({ search: '', status: '', type: '', audience: '', priority: '' })
  const [editor, setEditor] = useState<PublicationEditor>(emptyEditor)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [publishAt, setPublishAt] = useState('')
  const [publishExpiresAt, setPublishExpiresAt] = useState('')
  const [task, setTask] = useState<TaskEditor>(emptyTask)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const detailRef = useRef<HTMLElement | null>(null)
  const lastPublicationActivator = useRef<HTMLButtonElement | null>(null)

  const requestWorkspaceItems = useCallback(async (query: string): Promise<PublicationResponse[]> => {
    const paths = canManage
      ? ['/publications']
      : [
          ...(canPublish ? ['/publications/review-queue'] : []),
          ...(canCreate ? ['/publications/mine'] : []),
        ]
    const pages = await Promise.all(paths.map((path) => (
      api.request<PageResponse<PublicationResponse>>(`${path}?${query}`)
    )))
    const unique = new Map<string, PublicationResponse>()
    pages.flatMap((page) => page.items).forEach((publication) => unique.set(publication.id, publication))
    return [...unique.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }, [api, canCreate, canManage, canPublish])

  useEffect(() => {
    let active = true
    const loadInitial = async () => {
      setLoading(true)
      setError('')
      try {
        const [feedPage, workspacePage, projectPage, userPage] = await Promise.all([
          canRead ? api.request<PageResponse<PublicationResponse>>('/publications/feed?page=1&pageSize=50') : Promise.resolve(null),
          canManage || canCreate || canPublish
            ? requestWorkspaceItems('page=1&pageSize=50')
            : Promise.resolve([]),
          canReadProjects ? api.request<PageResponse<ProjectResponse>>('/projects?page=1&pageSize=100') : Promise.resolve(null),
          canReadUsers ? api.request<PageResponse<UserResponse>>('/users?page=1&pageSize=100') : Promise.resolve(null),
        ])
        if (!active) return
        setFeed(feedPage?.items ?? [])
        setWorkspaceItems(workspacePage)
        setProjects(projectPage?.items ?? [])
        setUsers(userPage?.items.filter((user) => user.status === 'ACTIVE') ?? [])
      } catch (nextError) {
        if (active) setError(errorMessage(nextError))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadInitial()
    return () => { active = false }
  }, [api, canCreate, canManage, canPublish, canRead, canReadProjects, canReadUsers, requestWorkspaceItems])

  useEffect(() => {
    let active = true
    if (!task.projectId || !canAssignTasks || !canReadProjects) {
      setTaskProjectUsers([])
      return () => { active = false }
    }
    api.request<PageResponse<ProjectMemberResponse>>(`/projects/${task.projectId}/members?page=1&pageSize=100`)
      .then((page) => {
        if (active) setTaskProjectUsers(page.items.map((member) => ({
          id: member.userId,
          displayName: member.displayName,
          email: member.email,
        })))
      })
      .catch((nextError: unknown) => { if (active) setError(errorMessage(nextError)) })
    return () => { active = false }
  }, [api, canAssignTasks, canReadProjects, task.projectId])

  const clearNotices = () => { setError(''); setSuccess('') }

  const loadFeed = async () => {
    if (!canRead) return
    setLoading(true)
    setError('')
    try {
      const page = await api.request<PageResponse<PublicationResponse>>(`/publications/feed?${queryString(feedFilters)}`)
      setFeed(page.items)
    } catch (nextError) { setError(errorMessage(nextError)) }
    finally { setLoading(false) }
  }

  const loadWorkspace = async () => {
    if (!canManage && !canCreate && !canPublish) return
    setLoading(true)
    setError('')
    try {
      setWorkspaceItems(await requestWorkspaceItems(queryString(workspaceFilters)))
    } catch (nextError) { setError(errorMessage(nextError)) }
    finally { setLoading(false) }
  }

  const reloadPublications = async () => {
    const requests: Array<Promise<void>> = []
    if (canRead) {
      requests.push(api.request<PageResponse<PublicationResponse>>(`/publications/feed?${queryString(feedFilters)}`).then((page) => { setFeed(page.items) }))
    }
    if (canManage || canCreate || canPublish) {
      requests.push(requestWorkspaceItems(queryString(workspaceFilters)).then(setWorkspaceItems))
    }
    await Promise.all(requests)
  }

  const run = async (operation: () => Promise<void>, message: string, reload = true) => {
    setBusy(true)
    clearNotices()
    try {
      await operation()
      if (reload) await reloadPublications()
      setSuccess(message)
    } catch (nextError) { setError(errorMessage(nextError)) }
    finally { setBusy(false) }
  }

  const inspectPublication = async (
    publication: PublicationResponse,
    activator?: HTMLButtonElement,
  ) => {
    if (activator) lastPublicationActivator.current = activator
    setBusy(true)
    clearNotices()
    setAcknowledgements([])
    setGeneratedTasks([])
    try {
      const detail = await api.request<PublicationResponse>(`/publications/${publication.id}`)
      setSelected(detail)
      setPublishAt(toLocalDateTime(detail.scheduledAt))
      setPublishExpiresAt(toLocalDateTime(detail.expiresAt))
      setTask({ ...emptyTask(), title: `Seguimiento: ${detail.title}`, projectId: detail.projectId ?? '' })
    } catch (nextError) { setError(errorMessage(nextError)) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!selected) return
    const frame = window.requestAnimationFrame(() => detailRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [selected])

  const closePublication = () => {
    setSelected(null)
    window.requestAnimationFrame(() => lastPublicationActivator.current?.focus())
  }

  const beginCreate = () => {
    clearNotices()
    setEditingId(null)
    setEditor(emptyEditor())
  }

  const beginEdit = (publication: PublicationResponse) => {
    clearNotices()
    setEditingId(publication.id)
    setEditor({
      title: publication.title,
      slug: publication.slug,
      summary: publication.summary,
      content: publication.content,
      coverImageUrl: publication.coverImageUrl ?? '',
      type: publication.type,
      category: publication.category,
      priority: publication.priority,
      audience: publication.audience,
      projectId: publication.projectId ?? '',
      audienceRoleCode: publication.audienceRoleCode ?? '',
      scheduledAt: toLocalDateTime(publication.scheduledAt),
      expiresAt: toLocalDateTime(publication.expiresAt),
    })
    document.getElementById('publication-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const savePublication = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = {
      title: editor.title.trim(),
      slug: editor.slug.trim(),
      summary: editor.summary.trim(),
      content: editor.content.trim(),
      coverImageUrl: editor.coverImageUrl.trim() || (editingId ? null : undefined),
      type: editor.type,
      category: editor.category.trim(),
      priority: editor.priority,
      audience: editor.audience,
      projectId: editor.audience === 'PROJECT' ? editor.projectId.trim() : (editingId ? null : undefined),
      audienceRoleCode: editor.audience === 'ROLE' ? editor.audienceRoleCode.trim() : (editingId ? null : undefined),
      scheduledAt: toIso(editor.scheduledAt) ?? (editingId ? null : undefined),
      expiresAt: toIso(editor.expiresAt) ?? (editingId ? null : undefined),
    }
    void run(async () => {
      const saved = editingId
        ? await api.request<PublicationResponse>(`/publications/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api.request<PublicationResponse>('/publications', { method: 'POST', body: JSON.stringify(payload) })
      setSelected(saved)
      setEditingId(saved.id)
    }, editingId ? 'Publicación actualizada.' : 'Borrador creado.')
  }

  const transition = (action: 'submit' | 'publish' | 'archive', body?: object) => {
    if (!selected) return
    if (action === 'archive' && !window.confirm('¿Archivar esta publicación? Esta acción la retirará del feed.')) return
    void run(async () => {
      const updated = await api.request<PublicationResponse>(`/publications/${selected.id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      })
      setSelected(updated)
      setPublishAt(toLocalDateTime(updated.scheduledAt))
      setPublishExpiresAt(toLocalDateTime(updated.expiresAt))
    }, action === 'submit' ? 'Publicación enviada a revisión.' : action === 'archive' ? 'Publicación archivada.' : body && 'scheduledAt' in body ? 'Publicación programada.' : 'Publicación publicada.')
  }

  const schedulePublication = () => {
    const scheduledAt = toIso(publishAt)
    if (!scheduledAt) { setError('Selecciona una fecha y hora para programar.'); return }
    transition('publish', { scheduledAt, expiresAt: toIso(publishExpiresAt) ?? null })
  }

  const acknowledge = () => {
    if (!selected) return
    void run(async () => {
      const acknowledgement = await api.request<AcknowledgementResponse>(`/publications/${selected.id}/acknowledge`, { method: 'POST' })
      setSuccess(`Lectura confirmada el ${formatDate(acknowledgement.readAt)}.`)
      setSelected((current) => current ? { ...current, acknowledgementCount: Math.max(current.acknowledgementCount, 1) } : current)
    }, 'Lectura confirmada.', false)
  }

  const loadAcknowledgements = async () => {
    if (!selected || !canManage) return
    setBusy(true)
    setError('')
    try {
      const page = await api.request<PageResponse<AcknowledgementResponse>>(`/publications/${selected.id}/acknowledgements?page=1&pageSize=100`)
      setAcknowledgements(page.items)
      setSuccess(`${page.total} confirmación${page.total === 1 ? '' : 'es'} cargada${page.total === 1 ? '' : 's'}.`)
    } catch (nextError) { setError(errorMessage(nextError)) }
    finally { setBusy(false) }
  }

  const generateTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const estimatedMinutes = task.estimatedMinutes ? Number(task.estimatedMinutes) : undefined
    const taskPayload = {
      title: task.title.trim(),
      description: task.description.trim() || undefined,
      projectId: task.projectId.trim() || undefined,
      priority: task.priority,
      dueAt: toIso(task.dueAt),
      estimatedMinutes,
      recurrence: task.recurrence,
      idempotencyKey: task.idempotencyKey,
      ...(canAssignTasks ? {
        assigneeId: task.assigneeId.trim() || undefined,
        supervisorId: task.supervisorId.trim() || undefined,
      } : {}),
    }
    void run(async () => {
      const created = await api.request<GeneratedTaskResponse[]>(`/publications/${selected.id}/tasks`, {
        method: 'POST', body: JSON.stringify({ tasks: [taskPayload] }),
      })
      setGeneratedTasks((current) => [...created, ...current])
      setSelected((current) => current ? { ...current, generatedTaskCount: current.generatedTaskCount + created.length } : current)
      setTask({ ...emptyTask(), title: `Seguimiento: ${selected.title}`, projectId: selected.projectId ?? '' })
    }, 'Tarea vinculada generada.', false)
  }

  const assignableTaskUsers: UserOption[] = task.projectId ? taskProjectUsers : users
  const selectedVisibleInFeed = Boolean(selected && feed.some((publication) => publication.id === selected.id))
  const editableSelected = Boolean(selected && ['DRAFT', 'IN_REVIEW', 'SCHEDULED'].includes(selected.status) && (canManage || selected.authorId === session.user.id))
  const lead = feed[0]
  const secondaryFeed = feed.slice(1)

  return (
    <main className={styles.publicationsWorkspace}>
      <header className={styles.publicationsMasthead}>
        <div className={styles.publicationsMastheadRule} />
        <p className={styles.publicationsKicker}>OPECONCA · Comunicación interna</p>
        <h1>La Gaceta de Operaciones</h1>
        <div className={styles.publicationsDateline}>
          <span>{new Intl.DateTimeFormat('es', { dateStyle: 'full' }).format(new Date())}</span>
          <span>Edición digital</span>
        </div>
        <div className={styles.publicationsMastheadRule} />
      </header>

      {success && <p className={styles.success} role="status">{success}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && <p className={styles.loading} role="status">Cargando publicaciones…</p>}

      <section aria-labelledby="feed-title" className={styles.publicationsFeed}>
        <div className={styles.publicationsSectionHeading}>
          <div><p>Portada</p><h2 id="feed-title">Noticias para tu audiencia</h2></div>
          {canRead && <button disabled={loading} onClick={() => void loadFeed()} type="button">Actualizar portada</button>}
        </div>
        {canRead ? <>
          <form className={styles.publicationsFilters} onSubmit={(event) => { event.preventDefault(); void loadFeed() }}>
            <label>Buscar<input maxLength={80} onChange={(event) => setFeedFilters({ ...feedFilters, search: event.target.value })} placeholder="Título, resumen o categoría" value={feedFilters.search} /></label>
            <label>Tipo<select onChange={(event) => setFeedFilters({ ...feedFilters, type: event.target.value as FeedFilters['type'] })} value={feedFilters.type}><option value="">Todos</option>{publicationTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>
            <label>Categoría<input maxLength={80} onChange={(event) => setFeedFilters({ ...feedFilters, category: event.target.value })} value={feedFilters.category} /></label>
            <ProjectField id="feed-project" labelText="Proyecto" onChange={(projectId) => setFeedFilters({ ...feedFilters, projectId })} projects={projects} value={feedFilters.projectId} />
            <button disabled={loading} type="submit">Aplicar filtros</button>
          </form>
          {!loading && lead ? <div className={styles.publicationsFrontPage}>
            <article className={styles.publicationsLeadStory}>
              {lead.coverImageUrl && <img alt="" className={styles.publicationsCoverImage} src={lead.coverImageUrl} />}
              <span className={styles.badge}>{label(lead.priority)} · {lead.category}</span>
              <h2>{lead.title}</h2>
              <p className={styles.publicationsStandfirst}>{lead.summary}</p>
              <small>Por {lead.authorName} · {formatDate(lead.publishedAt)}</small>
              <button disabled={busy} onClick={(event) => void inspectPublication(lead, event.currentTarget)} type="button">Leer publicación</button>
            </article>
            <div className={styles.publicationsStoryGrid}>
              {secondaryFeed.map((publication) => <PublicationCard busy={busy} key={publication.id} onSelect={inspectPublication} publication={publication} />)}
            </div>
          </div> : !loading && <p className={styles.empty}>No hay publicaciones vigentes para estos filtros.</p>}
        </> : <p className={styles.publicationsAccessNote}>Necesitas el permiso <strong>publications.read</strong> para consultar la portada.</p>}
      </section>

      {(canManage || canCreate || canPublish) && <section aria-labelledby="workspace-title" className={styles.publicationsAdministration}>
        <div className={styles.publicationsSectionHeading}>
          <div><p>{canManage ? 'Administración editorial' : canPublish ? 'Cola editorial' : 'Tus borradores'}</p><h2 id="workspace-title">Mesa de publicaciones</h2></div>
          {canCreate && <button onClick={beginCreate} type="button">Nueva publicación</button>}
        </div>
        <form className={styles.publicationsFilters} onSubmit={(event) => { event.preventDefault(); void loadWorkspace() }}>
          <label>Buscar<input maxLength={80} onChange={(event) => setWorkspaceFilters({ ...workspaceFilters, search: event.target.value })} placeholder="Título, slug o categoría" value={workspaceFilters.search} /></label>
          <label>Estado<select onChange={(event) => setWorkspaceFilters({ ...workspaceFilters, status: event.target.value as WorkspaceFilters['status'] })} value={workspaceFilters.status}><option value="">Todos</option>{publicationStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
          <label>Tipo<select onChange={(event) => setWorkspaceFilters({ ...workspaceFilters, type: event.target.value as WorkspaceFilters['type'] })} value={workspaceFilters.type}><option value="">Todos</option>{publicationTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>
          <label>Audiencia<select onChange={(event) => setWorkspaceFilters({ ...workspaceFilters, audience: event.target.value as WorkspaceFilters['audience'] })} value={workspaceFilters.audience}><option value="">Todas</option><option value="ALL">ALL</option><option value="PROJECT">PROJECT</option><option value="ROLE">ROLE</option></select></label>
          <label>Prioridad<select onChange={(event) => setWorkspaceFilters({ ...workspaceFilters, priority: event.target.value as WorkspaceFilters['priority'] })} value={workspaceFilters.priority}><option value="">Todas</option>{publicationPriorities.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
          <button disabled={loading} type="submit">Filtrar listado</button>
        </form>
        <div className={styles.publicationsTableWrap}>
          <table className={styles.publicationsTable}>
            <caption className={styles.publicationsVisuallyHidden}>{canManage ? 'Listado administrativo de publicaciones' : canPublish ? 'Publicaciones pendientes de revisión o programadas' : 'Publicaciones creadas por el usuario'}</caption>
            <thead><tr><th scope="col">Publicación</th><th scope="col">Estado</th><th scope="col">Audiencia</th><th scope="col">Autor</th><th scope="col">Actualización</th><th scope="col">Acción</th></tr></thead>
            <tbody>{workspaceItems.map((publication) => <tr key={publication.id}><td><strong>{publication.title}</strong><small>{publication.slug} · {label(publication.type)}</small></td><td><span className={styles.badge}>{label(publication.status)}</span></td><td>{label(publication.audience)}{publication.projectCode ? ` · ${publication.projectCode}` : publication.audienceRoleCode ? ` · ${publication.audienceRoleCode}` : ''}</td><td>{publication.authorName}</td><td>{formatDate(publication.updatedAt)}</td><td><button aria-pressed={selected?.id === publication.id} disabled={busy} onClick={(event) => void inspectPublication(publication, event.currentTarget)} type="button">Ver</button></td></tr>)}</tbody>
          </table>
          {!loading && workspaceItems.length === 0 && <p className={styles.empty}>No hay publicaciones en el listado.</p>}
        </div>
      </section>}

      {(canCreate || (canManage && editingId)) && <section aria-labelledby="editor-title" className={styles.publicationsEditor} id="publication-editor">
        <div className={styles.publicationsSectionHeading}><div><p>Redacción</p><h2 id="editor-title">{editingId ? 'Editar publicación' : 'Crear borrador'}</h2></div>{editingId && <button onClick={beginCreate} type="button">Limpiar editor</button>}</div>
        <form className={`${styles.form} ${styles.publicationsEditorForm}`} onSubmit={savePublication}>
          <div className={styles.publicationsFormGrid}>
            <label>Título<input maxLength={180} minLength={3} onChange={(event) => setEditor({ ...editor, title: event.target.value })} required value={editor.title} /></label>
            <label>Slug<input maxLength={180} onChange={(event) => setEditor({ ...editor, slug: event.target.value.toLowerCase() })} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required value={editor.slug} /></label>
            <label>Tipo<select onChange={(event) => setEditor({ ...editor, type: event.target.value as PublicationType })} value={editor.type}>{publicationTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>
            <label>Categoría<input maxLength={80} onChange={(event) => setEditor({ ...editor, category: event.target.value })} required value={editor.category} /></label>
            <label>Prioridad<select onChange={(event) => setEditor({ ...editor, priority: event.target.value as PublicationPriority })} value={editor.priority}>{publicationPriorities.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
            <label>Audiencia<select onChange={(event) => setEditor({ ...editor, audience: event.target.value as PublicationAudience, projectId: '', audienceRoleCode: '' })} value={editor.audience}><option value="ALL">Todos</option><option value="PROJECT">Proyecto</option><option value="ROLE">Rol</option></select></label>
            {editor.audience === 'PROJECT' && <ProjectField id="editor-project" labelText="Proyecto de audiencia" onChange={(projectId) => setEditor({ ...editor, projectId })} projects={projects} required value={editor.projectId} />}
            {editor.audience === 'ROLE' && <label>Rol de audiencia<input list="publication-role-codes" maxLength={60} onChange={(event) => setEditor({ ...editor, audienceRoleCode: event.target.value })} placeholder="Código de rol" required value={editor.audienceRoleCode} />{session.user.roles.length > 0 && <datalist id="publication-role-codes">{session.user.roles.map((role) => <option key={role} value={role} />)}</datalist>}</label>}
            <label>Programación inicial<input onChange={(event) => setEditor({ ...editor, scheduledAt: event.target.value })} type="datetime-local" value={editor.scheduledAt} /></label>
            <label>Expiración<input onChange={(event) => setEditor({ ...editor, expiresAt: event.target.value })} type="datetime-local" value={editor.expiresAt} /></label>
            <label className={styles.publicationsWideField}>URL de portada<input maxLength={2000} onChange={(event) => setEditor({ ...editor, coverImageUrl: event.target.value })} placeholder="https://…" type="url" value={editor.coverImageUrl} /></label>
            <label className={styles.publicationsWideField}>Resumen<textarea maxLength={500} onChange={(event) => setEditor({ ...editor, summary: event.target.value })} required value={editor.summary} /></label>
            <label className={styles.publicationsWideField}>Contenido<textarea className={styles.publicationsContentEditor} maxLength={50000} onChange={(event) => setEditor({ ...editor, content: event.target.value })} required value={editor.content} /></label>
          </div>
          <button disabled={busy || Boolean(editingId && selected && !editableSelected)} type="submit">{editingId ? 'Guardar cambios' : 'Crear borrador'}</button>
        </form>
      </section>}

      {selected && <aside aria-labelledby="publication-detail-title" className={styles.publicationsDetail} ref={detailRef} tabIndex={-1}>
        <header className={styles.publicationsDetailHeader}><div><span className={styles.badge}>{label(selected.status)} · {label(selected.priority)}</span><h2 id="publication-detail-title">{selected.title}</h2><p>{selected.summary}</p></div><button onClick={closePublication} type="button">Cerrar</button></header>
        <dl className={styles.publicationsMetadata}><div><dt>Autor</dt><dd>{selected.authorName}</dd></div><div><dt>Categoría</dt><dd>{selected.category}</dd></div><div><dt>Audiencia</dt><dd>{label(selected.audience)}{selected.projectName ? ` · ${selected.projectName}` : selected.audienceRoleCode ? ` · ${selected.audienceRoleCode}` : ''}</dd></div><div><dt>Publicación</dt><dd>{formatDate(selected.publishedAt ?? selected.scheduledAt)}</dd></div><div><dt>Lecturas</dt><dd>{selected.acknowledgementCount}</dd></div><div><dt>Tareas</dt><dd>{selected.generatedTaskCount}</dd></div></dl>
        {selected.coverImageUrl && <img alt="" className={styles.publicationsDetailImage} src={selected.coverImageUrl} />}
        <div className={styles.publicationsArticleContent}>{selected.content}</div>
        <div className={styles.publicationsActions}>
          {editableSelected && <button onClick={() => beginEdit(selected)} type="button">Editar</button>}
          {selected.status === 'DRAFT' && (canManage || selected.authorId === session.user.id) && <button disabled={busy} onClick={() => transition('submit')} type="button">Enviar a revisión</button>}
          {canPublish && ['IN_REVIEW', 'SCHEDULED'].includes(selected.status) && <button disabled={busy} onClick={() => transition('publish', { expiresAt: toIso(publishExpiresAt) ?? null })} type="button">Publicar ahora</button>}
          {canManage && selected.status !== 'ARCHIVED' && <button className={styles.danger} disabled={busy} onClick={() => transition('archive')} type="button">Archivar</button>}
          {canRead && selected.status === 'PUBLISHED' && selectedVisibleInFeed && <button disabled={busy} onClick={acknowledge} type="button">Confirmar lectura</button>}
          {canManage && <button disabled={busy} onClick={() => void loadAcknowledgements()} type="button">Cargar confirmaciones</button>}
        </div>
        {canPublish && ['IN_REVIEW', 'SCHEDULED'].includes(selected.status) && <fieldset className={styles.publicationsSchedule}><legend>Programar publicación</legend><label>Fecha y hora<input onChange={(event) => setPublishAt(event.target.value)} required type="datetime-local" value={publishAt} /></label><label>Expiración opcional<input onChange={(event) => setPublishExpiresAt(event.target.value)} type="datetime-local" value={publishExpiresAt} /></label><button disabled={busy || !publishAt} onClick={schedulePublication} type="button">Programar</button></fieldset>}
        {canManage && acknowledgements.length > 0 && <section aria-labelledby="acknowledgements-title" className={styles.publicationsAcknowledgements}><h3 id="acknowledgements-title">Confirmaciones de lectura</h3><ul>{acknowledgements.map((item) => <li key={item.userId}><strong>{item.userName}</strong><span>{item.userEmail}</span><time dateTime={item.readAt}>{formatDate(item.readAt)}</time></li>)}</ul></section>}
        {canCreateTasks && <section aria-labelledby="task-title" className={styles.publicationsTaskPanel}><h3 id="task-title">Generar tarea vinculada</h3><form className={styles.form} onSubmit={generateTask}>
          <label>Título<input maxLength={180} onChange={(event) => setTask({ ...task, title: event.target.value })} required value={task.title} /></label>
          <label>Descripción<textarea maxLength={10000} onChange={(event) => setTask({ ...task, description: event.target.value })} value={task.description} /></label>
          <ProjectField id="task-project" labelText="Proyecto (opcional)" onChange={(projectId) => setTask({ ...task, projectId, assigneeId: '', supervisorId: '' })} projects={projects} value={task.projectId} />
          <label>Prioridad<select onChange={(event) => setTask({ ...task, priority: event.target.value as TaskPriority })} value={task.priority}>{taskPriorities.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
          <label>Vencimiento<input onChange={(event) => setTask({ ...task, dueAt: event.target.value })} type="datetime-local" value={task.dueAt} /></label>
          <label>Minutos estimados<input max={100000} min={0} onChange={(event) => setTask({ ...task, estimatedMinutes: event.target.value })} type="number" value={task.estimatedMinutes} /></label>
          <label>Recurrencia<select onChange={(event) => setTask({ ...task, recurrence: event.target.value as TaskRecurrence })} value={task.recurrence}>{taskRecurrences.map((recurrence) => <option key={recurrence} value={recurrence}>{label(recurrence)}</option>)}</select></label>
          {canAssignTasks && <><UserField id="task-assignee" labelText="Responsable (opcional)" onChange={(assigneeId) => setTask({ ...task, assigneeId })} users={assignableTaskUsers} value={task.assigneeId} /><UserField id="task-supervisor" labelText="Supervisor (opcional)" onChange={(supervisorId) => setTask({ ...task, supervisorId })} users={assignableTaskUsers} value={task.supervisorId} /></>}
          <label>Clave idempotente<input aria-describedby="idempotency-help" readOnly value={task.idempotencyKey} /><small id="idempotency-help">Se conserva si falla el envío para reintentar sin duplicar la tarea.</small></label>
          <button disabled={busy} type="submit">Generar tarea</button>
        </form>{generatedTasks.length > 0 && <ul className={styles.publicationsGeneratedTasks}>{generatedTasks.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{label(item.status)} · {label(item.priority)}</span></li>)}</ul>}</section>}
      </aside>}
    </main>
  )
}

function PublicationCard({ publication, busy, onSelect }: { publication: PublicationResponse; busy: boolean; onSelect: (publication: PublicationResponse, activator?: HTMLButtonElement) => Promise<void> }) {
  return <article className={styles.publicationsStoryCard}><span className={styles.badge}>{publication.category}</span><h3>{publication.title}</h3><p>{publication.summary}</p><small>{publication.authorName} · {formatDate(publication.publishedAt)}</small><button disabled={busy} onClick={(event) => void onSelect(publication, event.currentTarget)} type="button">Leer</button></article>
}

function ProjectField({ id, labelText, projects, value, onChange, required = false }: { id: string; labelText: string; projects: ProjectResponse[]; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label htmlFor={id}>{labelText}{projects.length > 0 ? <select id={id} onChange={(event) => onChange(event.target.value)} required={required} value={value}><option value="">{required ? 'Seleccionar proyecto' : 'Sin proyecto'}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select> : <input id={id} onChange={(event) => onChange(event.target.value)} pattern="[0-9a-fA-F-]{36}" placeholder="UUID del proyecto" required={required} value={value} />}</label>
}

function UserField({ id, labelText, users, value, onChange }: { id: string; labelText: string; users: UserOption[]; value: string; onChange: (value: string) => void }) {
  return <label htmlFor={id}>{labelText}{users.length > 0 ? <select id={id} onChange={(event) => onChange(event.target.value)} value={value}><option value="">Sin asignar</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}</select> : <input id={id} onChange={(event) => onChange(event.target.value)} pattern="[0-9a-fA-F-]{36}" placeholder="UUID del usuario" value={value} />}</label>
}
