'use client'

import type { AuthSession } from '@opeconca/contracts'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { PageResult, PortalApi } from './portal-api'
import styles from './portal-workspace.module.css'

type Area = 'dashboard' | 'users' | 'clients' | 'projects' | 'reports'
type Permission = AuthSession['user']['permissions'][number]

interface UserItem { id: string; email: string; displayName: string; status: 'ACTIVE' | 'INACTIVE'; roles: Array<{ code: string; name: string }> }
interface ClientItem { id: string; name: string; taxId: string | null; isActive: boolean; contactCount?: number }
interface ContactItem { id: string; name: string; email: string | null; phone: string | null; position: string | null; isPrimary: boolean }
interface ProjectItem { id: string; code: string; clientId: string; clientName: string; name: string; status: string; description: string | null }
interface ProjectMember { userId: string; displayName: string; email: string; role: string }
interface ReportItem { id: string; projectId: string; projectCode: string; projectName: string; authorId: string; authorName: string; approverName: string | null; reportDate: string; summary: string; personnelCount: number; incidentNotes: string | null; status: string }

const areas: Array<{ id: Area; label: string; permissions: Permission[] }> = [
  { id: 'dashboard', label: 'Resumen', permissions: [] },
  { id: 'users', label: 'Usuarios', permissions: ['users.read'] },
  { id: 'clients', label: 'Clientes', permissions: ['clients.read'] },
  { id: 'projects', label: 'Proyectos', permissions: ['projects.read'] },
  { id: 'reports', label: 'Reportes', permissions: ['fieldReports.read'] },
]

function formValue(form: FormData, name: string): string { return String(form.get(name) ?? '').trim() }
function can(user: AuthSession['user'], ...permissions: Permission[]): boolean { return permissions.some((permission) => user.permissions.includes(permission)) }

export function PortalWorkspace({ session, onSession, onLogout }: Readonly<{
  session: AuthSession
  onSession: (session: AuthSession | null) => void
  onLogout: () => Promise<void>
}>) {
  const api = useMemo(() => new PortalApi(session, onSession), [onSession, session])
  const [area, setArea] = useState<Area>('dashboard')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [users, setUsers] = useState<UserItem[]>([])
  const [clients, setClients] = useState<ClientItem[]>([])
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [reports, setReports] = useState<ReportItem[]>([])
  const [contacts, setContacts] = useState<ContactItem[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientItem | null>(null)
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null)

  const load = useCallback(async (target: Area = area) => {
    setLoading(true); setError('')
    try {
      const query = new URLSearchParams({ page: '1', pageSize: '50' })
      if (search) query.set('search', search)
      if (target === 'users') setUsers((await api.request<PageResult<UserItem>>(`/users?${query}`)).items)
      if (target === 'clients') setClients((await api.request<PageResult<ClientItem>>(`/clients?${query}`)).items)
      if (target === 'projects') {
        const [projectPage, clientPage, userPage] = await Promise.all([
          api.request<PageResult<ProjectItem>>(`/projects?${query}`),
          can(session.user, 'clients.read') ? api.request<PageResult<ClientItem>>('/clients?page=1&pageSize=100') : Promise.resolve({ items: [], page: 1, pageSize: 100, total: 0 }),
          can(session.user, 'users.read') ? api.request<PageResult<UserItem>>('/users?page=1&pageSize=100') : Promise.resolve({ items: [], page: 1, pageSize: 100, total: 0 }),
        ])
        setProjects(projectPage.items); setClients(clientPage.items); if (userPage.items.length) setUsers(userPage.items)
      }
      if (target === 'reports') setReports((await api.request<PageResult<ReportItem>>(`/field-reports?${query}`)).items)
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'No se pudo cargar la información.') }
    finally { setLoading(false) }
  }, [api, area, search, session.user])

  useEffect(() => {
    const currentArea = areas.find((item) => item.id === area)
    if (currentArea?.permissions.length && !can(session.user, ...currentArea.permissions)) {
      setArea('dashboard')
      setSelectedClient(null)
      setSelectedProject(null)
    }
  }, [area, session.user])

  useEffect(() => { if (area !== 'dashboard') void load(area) }, [area, load])

  const run = async (operation: () => Promise<unknown>, success: string, reload = true) => {
    setBusy(true); setError(''); setMessage('')
    try { await operation(); setMessage(success); if (reload) await load() }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'No fue posible completar la operación.') }
    finally { setBusy(false) }
  }

  const createUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    void run(() => api.request('/users', { method: 'POST', body: JSON.stringify({ displayName: formValue(form, 'displayName'), email: formValue(form, 'email'), password: formValue(form, 'password') }) }), 'Usuario creado. Asigna su acceso mediante la administración de roles cuando ese catálogo esté disponible.')
    event.currentTarget.reset()
  }
  const createClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    void run(() => api.request('/clients', { method: 'POST', body: JSON.stringify({ name: formValue(form, 'name'), taxId: formValue(form, 'taxId') || undefined }) }), 'Cliente creado.')
    event.currentTarget.reset()
  }
  const createProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    void run(() => api.request('/projects', { method: 'POST', body: JSON.stringify({ code: formValue(form, 'code'), clientId: formValue(form, 'clientId'), name: formValue(form, 'name'), description: formValue(form, 'description') || undefined }) }), 'Proyecto creado.')
    event.currentTarget.reset()
  }
  const createContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedClient) return; const form = new FormData(event.currentTarget)
    void run(async () => { await api.request(`/clients/${selectedClient.id}/contacts`, { method: 'POST', body: JSON.stringify({ name: formValue(form, 'name'), email: formValue(form, 'email') || undefined, phone: formValue(form, 'phone') || undefined, position: formValue(form, 'position') || undefined }) }); setContacts((await api.request<PageResult<ContactItem>>(`/clients/${selectedClient.id}/contacts?page=1&pageSize=100`)).items) }, 'Contacto agregado.', false)
    event.currentTarget.reset()
  }
  const addMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedProject) return; const form = new FormData(event.currentTarget)
    void run(async () => { await api.request(`/projects/${selectedProject.id}/members`, { method: 'POST', body: JSON.stringify({ userId: formValue(form, 'userId'), role: formValue(form, 'role') }) }); setMembers((await api.request<PageResult<ProjectMember>>(`/projects/${selectedProject.id}/members?page=1&pageSize=100`)).items) }, 'Miembro agregado.', false)
    event.currentTarget.reset()
  }
  const inspectClient = async (client: ClientItem) => {
    setSelectedClient(client); setSelectedProject(null); setError('')
    try { setContacts((await api.request<PageResult<ContactItem>>(`/clients/${client.id}/contacts?page=1&pageSize=100`)).items) } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'No se pudieron cargar los contactos.') }
  }
  const inspectProject = async (project: ProjectItem) => {
    setSelectedProject(project); setSelectedClient(null); setError('')
    try { setMembers((await api.request<PageResult<ProjectMember>>(`/projects/${project.id}/members?page=1&pageSize=100`)).items) } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'No se pudieron cargar los miembros.') }
  }

  const visibleAreas = areas.filter((item) => !item.permissions.length || can(session.user, ...item.permissions))

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><span>OC</span><div><strong>OPECONCA</strong><small>Centro de operaciones</small></div></div>
        <nav aria-label="Áreas administrativas">{visibleAreas.map((item) => <button aria-current={area === item.id ? 'page' : undefined} className={area === item.id ? styles.active : ''} key={item.id} onClick={() => { setArea(item.id); setSearch(''); setMessage(''); setError('') }} type="button">{item.label}</button>)}</nav>
        <div className={styles.identity}><strong>{session.user.displayName}</strong><small>{session.user.email}</small><button disabled={busy} onClick={() => void onLogout()} type="button">Cerrar sesión</button></div>
      </aside>
      <section className={styles.content}>
        <header className={styles.header}><div><p>Panel administrativo</p><h1>{areas.find((item) => item.id === area)?.label}</h1></div>{area !== 'dashboard' && <form className={styles.search} onSubmit={(event) => { event.preventDefault(); void load() }}><label><span>Buscar</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, código o correo" value={search} /></label><button disabled={loading} type="submit">Buscar</button><button disabled={loading} onClick={() => void load()} type="button">Actualizar</button></form>}</header>
        {message && <p className={styles.success} role="status">{message}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {loading && <p className={styles.loading} role="status">Cargando información…</p>}

        {area === 'dashboard' && <Dashboard session={session} onOpen={setArea} />}
        {area === 'users' && !loading && <ResourceSection title="Equipo" action={can(session.user, 'users.manage') ? <UserForm disabled={busy} onSubmit={createUser} /> : null}>{users.length ? users.map((user) => <article className={styles.card} key={user.id}><div><span className={styles.badge}>{user.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</span><h2>{user.displayName}</h2><p>{user.email}</p><small>{user.roles.map((role) => role.name).join(', ') || 'Sin rol asignado'}</small></div>{can(session.user, 'users.manage') && user.id !== session.user.id && <button disabled={busy} onClick={() => void run(() => api.request(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ status: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) }), `Usuario ${user.status === 'ACTIVE' ? 'inactivado' : 'activado'}.`)} type="button">{user.status === 'ACTIVE' ? 'Inactivar' : 'Activar'}</button>}</article>) : <Empty />}</ResourceSection>}
        {area === 'clients' && !loading && <><ResourceSection title="Clientes" action={can(session.user, 'clients.manage') ? <ClientForm disabled={busy} onSubmit={createClient} /> : null}>{clients.length ? clients.map((client) => <article className={styles.card} key={client.id}><div><span className={styles.badge}>{client.isActive ? 'Activo' : 'Inactivo'}</span><h2>{client.name}</h2><p>{client.taxId || 'Sin identificación fiscal'} · {client.contactCount ?? 0} contactos</p></div><button onClick={() => void inspectClient(client)} type="button">Ver contactos</button></article>) : <Empty />}</ResourceSection>{selectedClient && <Detail title={`Contactos · ${selectedClient.name}`} onClose={() => setSelectedClient(null)}>{contacts.map((contact) => <p key={contact.id}><strong>{contact.name}</strong> · {contact.position || 'Sin cargo'} · {contact.email || contact.phone || 'Sin contacto'}</p>)}{can(session.user, 'clients.manage') && <ContactForm disabled={busy} onSubmit={createContact} />}</Detail>}</>}
        {area === 'projects' && !loading && <><ResourceSection title="Proyectos" action={can(session.user, 'projects.manage') ? <ProjectForm clients={clients} disabled={busy} onSubmit={createProject} /> : null}>{projects.length ? projects.map((project) => <article className={styles.card} key={project.id}><div><span className={styles.badge}>{project.status}</span><h2>{project.code} · {project.name}</h2><p>{project.clientName}</p></div><button onClick={() => void inspectProject(project)} type="button">Ver equipo</button></article>) : <Empty />}</ResourceSection>{selectedProject && <Detail title={`Equipo · ${selectedProject.name}`} onClose={() => setSelectedProject(null)}>{members.map((member) => <p key={member.userId}><strong>{member.displayName}</strong> · {member.role} · {member.email}</p>)}{can(session.user, 'projects.manage') && <MemberForm disabled={busy} onSubmit={addMember} users={users} />}</Detail>}</>}
        {area === 'reports' && !loading && <ResourceSection title="Reportes de campo">{reports.length ? reports.map((report) => <article className={styles.report} key={report.id}><header><span className={styles.badge}>{report.status}</span><strong>{report.projectCode} · {report.reportDate}</strong></header><h2>{report.authorName}</h2><p>{report.summary}</p><small>{report.personnelCount} personas{report.incidentNotes ? ` · Incidente: ${report.incidentNotes}` : ''}</small>{report.status === 'SUBMITTED' && can(session.user, 'fieldReports.approve') && report.authorId !== session.user.id && <div className={styles.actions}><button disabled={busy} onClick={() => void run(() => api.request(`/field-reports/${report.id}/approve`, { method: 'POST' }), 'Reporte aprobado.')} type="button">Aprobar</button><button className={styles.danger} disabled={busy} onClick={() => window.confirm('¿Rechazar este reporte?') && void run(() => api.request(`/field-reports/${report.id}/reject`, { method: 'POST' }), 'Reporte rechazado.')} type="button">Rechazar</button></div>}</article>) : <Empty />}</ResourceSection>}
      </section>
    </main>
  )
}

function Dashboard({ session, onOpen }: Readonly<{ session: AuthSession; onOpen: (area: Area) => void }>) { return <div className={styles.dashboard}><article><p>Permisos activos</p><strong>{session.user.permissions.length}</strong><span>{session.user.roles.join(', ') || 'Sin rol'}</span></article>{areas.slice(1).filter((item) => can(session.user, ...item.permissions)).map((item) => <button key={item.id} onClick={() => onOpen(item.id)} type="button"><span>Área autorizada</span><strong>{item.label}</strong><small>Abrir gestión →</small></button>)}</div> }
function ResourceSection({ title, action, children }: Readonly<{ title: string; action?: React.ReactNode; children: React.ReactNode }>) { return <section className={styles.resource}><div className={styles.resourceHeading}><h2>{title}</h2>{action}</div><div className={styles.grid}>{children}</div></section> }
function Detail({ title, onClose, children }: Readonly<{ title: string; onClose: () => void; children: React.ReactNode }>) { return <aside className={styles.detail} aria-label={title}><header><h2>{title}</h2><button onClick={onClose} type="button">Cerrar</button></header>{children}</aside> }
function Empty() { return <p className={styles.empty}>No hay registros para mostrar.</p> }
function UserForm({ disabled, onSubmit }: Readonly<{ disabled: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }>) { return <details><summary>Nuevo usuario</summary><form className={styles.form} onSubmit={onSubmit}><label>Nombre<input name="displayName" required /></label><label>Correo<input name="email" required type="email" /></label><label>Contraseña inicial<input minLength={12} name="password" required type="password" /></label><button disabled={disabled} type="submit">Crear</button></form></details> }
function ClientForm({ disabled, onSubmit }: Readonly<{ disabled: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }>) { return <details><summary>Nuevo cliente</summary><form className={styles.form} onSubmit={onSubmit}><label>Nombre<input name="name" required /></label><label>Identificación fiscal<input name="taxId" /></label><button disabled={disabled} type="submit">Crear</button></form></details> }
function ProjectForm({ clients, disabled, onSubmit }: Readonly<{ clients: ClientItem[]; disabled: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }>) { return <details><summary>Nuevo proyecto</summary><form className={styles.form} onSubmit={onSubmit}><label>Código<input name="code" required /></label><label>Nombre<input name="name" required /></label>{clients.length ? <label>Cliente<select name="clientId" required><option value="">Seleccionar</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label> : <label>ID del cliente<input name="clientId" pattern="[0-9a-fA-F-]{36}" placeholder="UUID del cliente" required /></label>}<label>Descripción<textarea name="description" /></label><button disabled={disabled} type="submit">Crear</button></form></details> }
function ContactForm({ disabled, onSubmit }: Readonly<{ disabled: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }>) { return <form className={styles.form} onSubmit={onSubmit}><h3>Agregar contacto</h3><label>Nombre<input name="name" required /></label><label>Correo<input name="email" type="email" /></label><label>Teléfono<input name="phone" /></label><label>Cargo<input name="position" /></label><button disabled={disabled} type="submit">Agregar</button></form> }
function MemberForm({ users, disabled, onSubmit }: Readonly<{ users: UserItem[]; disabled: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }>) { return <form className={styles.form} onSubmit={onSubmit}><h3>Agregar miembro</h3>{users.length ? <label>Usuario<select name="userId" required><option value="">Seleccionar</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label> : <label>ID del usuario<input name="userId" pattern="[0-9a-fA-F-]{36}" placeholder="UUID del usuario" required /></label>}<label>Rol<select name="role"><option value="WORKER">Trabajador</option><option value="SUPERVISOR">Supervisor</option><option value="VIEWER">Consulta</option></select></label><button disabled={disabled} type="submit">Agregar</button></form> }
