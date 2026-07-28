import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import {
  clearAccessToken,
  fetchFieldReports,
  fetchProjects,
  login,
  logout,
  refreshSession,
  toIdentity,
} from '../services/fieldApi'
import {
  cacheIdentity,
  cacheProjects,
  cacheServerReports,
  clearFieldSessionData,
  enqueueReport,
  loadCachedIdentity,
  loadCachedProjects,
  loadFieldReports,
  saveFieldReport,
} from '../services/fieldReportStorage'
import { retryFailedReports, syncFieldReports } from '../services/fieldReportSync'
import type {
  FieldProject,
  LocalFieldReport,
  SessionIdentity,
  SyncState,
} from '../types/fieldReports'

const today = new Date().toISOString().slice(0, 10)

const syncLabels: Record<SyncState, string> = {
  local: 'Local',
  pending: 'Pendiente',
  syncing: 'Sincronizando',
  synced: 'Sincronizado',
  error: 'Error',
}

function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return [...bytes].map((byte, index) => {
    const hex = byte.toString(16).padStart(2, '0')
    return [4, 6, 8, 10].includes(index) ? `-${hex}` : hex
  }).join('')
}

function messageFrom(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'La operación agotó el tiempo de espera. Comprueba la conexión.'
  }
  return error instanceof Error ? error.message : 'No pudimos completar la operación.'
}

function reportStatus(report: LocalFieldReport): string {
  const serverStatus = report.serverReport?.status
  if (!serverStatus) return syncLabels[report.syncState]
  const labels = {
    DRAFT: 'Borrador remoto',
    SUBMITTED: 'Enviado',
    APPROVED: 'Aprobado',
    REJECTED: 'Rechazado',
  }
  return labels[serverStatus]
}

export function FieldReportsPage() {
  const [identity, setIdentity] = useState<SessionIdentity | null>(null)
  const [sessionMode, setSessionMode] = useState<'loading' | 'signed-out' | 'online' | 'offline'>('loading')
  const [projects, setProjects] = useState<FieldProject[]>([])
  const [reports, setReports] = useState<LocalFieldReport[]>([])
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [projectId, setProjectId] = useState('')
  const [reportDate, setReportDate] = useState(today)
  const [summary, setSummary] = useState('')
  const [personnelCount, setPersonnelCount] = useState('0')
  const [weatherNotes, setWeatherNotes] = useState('')
  const [incidentNotes, setIncidentNotes] = useState('')
  const [submitAfterCreate, setSubmitAfterCreate] = useState(false)

  const reloadLocal = useCallback(async (ownerId: string) => {
    const [cachedProjects, cachedReports] = await Promise.all([
      loadCachedProjects(ownerId),
      loadFieldReports(ownerId),
    ])
    setProjects(cachedProjects)
    setReports(cachedReports)
    setProjectId((current) => current || cachedProjects[0]?.id || '')
  }, [])

  const refreshRemote = useCallback(async (ownerId: string) => {
    const [remoteProjects, remoteReports] = await Promise.all([
      fetchProjects(),
      fetchFieldReports(),
    ])
    await Promise.all([
      cacheProjects(ownerId, remoteProjects),
      cacheServerReports(ownerId, remoteReports),
    ])
    await reloadLocal(ownerId)
  }, [reloadLocal])

  useEffect(() => {
    let cancelled = false
    loadCachedIdentity()
      .then(async (cachedIdentity) => {
        if (cancelled || !cachedIdentity) {
          if (!cancelled) setSessionMode('signed-out')
          return
        }
        setIdentity(cachedIdentity)
        await reloadLocal(cachedIdentity.id)
        if (!navigator.onLine) {
          if (!cancelled) setSessionMode('offline')
          return
        }
        try {
          const session = await refreshSession()
          const liveIdentity = toIdentity(session)
          await cacheIdentity(liveIdentity)
          if (cancelled) return
          setIdentity(liveIdentity)
          setSessionMode('online')
          await syncFieldReports(liveIdentity.id, true)
          await refreshRemote(liveIdentity.id)
        } catch (error) {
          if (!cancelled) {
            clearAccessToken()
            setSessionMode('offline')
            setMessage(`Modo local: ${messageFrom(error)}`)
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSessionMode('signed-out')
          setMessage(messageFrom(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [refreshRemote, reloadLocal])

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false)
      if (identity) setSessionMode('offline')
    }
    const handleOnline = async () => {
      setIsOnline(true)
      if (!identity) return
      try {
        const session = await refreshSession()
        const liveIdentity = toIdentity(session)
        await cacheIdentity(liveIdentity)
        setIdentity(liveIdentity)
        setSessionMode('online')
        await syncFieldReports(liveIdentity.id)
        await refreshRemote(liveIdentity.id)
        setMessage('Conexión recuperada y reportes sincronizados.')
      } catch (error) {
        setSessionMode('offline')
        setMessage(`No se pudo recuperar la sesión: ${messageFrom(error)}`)
      }
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [identity, refreshRemote])

  useEffect(() => {
    if (!identity || !isOnline || sessionMode !== 'online') return
    const interval = window.setInterval(() => {
      syncFieldReports(identity.id)
        .then(() => reloadLocal(identity.id))
        .catch(() => undefined)
    }, 15_000)
    return () => window.clearInterval(interval)
  }, [identity, isOnline, reloadLocal, sessionMode])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setIsBusy(true)
    setMessage('Iniciando sesión…')
    try {
      const previousIdentity = await loadCachedIdentity()
      const session = await login(email, password)
      const liveIdentity = toIdentity(session)
      if (previousIdentity && previousIdentity.id !== liveIdentity.id) {
        await clearFieldSessionData()
      }
      await cacheIdentity(liveIdentity)
      setIdentity(liveIdentity)
      setSessionMode('online')
      setPassword('')
      await reloadLocal(liveIdentity.id)
      await syncFieldReports(liveIdentity.id, true)
      await refreshRemote(liveIdentity.id)
      setMessage('Sesión iniciada. Datos operativos actualizados.')
    } catch (error) {
      clearAccessToken()
      setSessionMode('signed-out')
      setMessage(messageFrom(error))
    } finally {
      setIsBusy(false)
    }
  }

  const handleLogout = async () => {
    setIsBusy(true)
    setMessage('Cerrando sesión y limpiando datos operativos…')
    try {
      await logout()
    } catch {
      clearAccessToken()
    }
    try {
      await clearFieldSessionData()
      setIdentity(null)
      setProjects([])
      setReports([])
      setProjectId('')
      setSessionMode('signed-out')
      setMessage('Sesión cerrada. Identidad, proyectos, reportes y cola local fueron eliminados.')
    } catch (error) {
      setMessage(messageFrom(error))
    } finally {
      setIsBusy(false)
    }
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!identity) return
    const project = projects.find((candidate) => candidate.id === projectId)
    if (!project) {
      setMessage('Selecciona un proyecto disponible.')
      return
    }

    setIsBusy(true)
    const now = new Date().toISOString()
    const report: LocalFieldReport = {
      localId: uuidV4(),
      ownerId: identity.id,
      payload: {
        projectId,
        reportDate,
        summary: summary.trim(),
        personnelCount: Number(personnelCount),
        weatherNotes: weatherNotes.trim() || undefined,
        incidentNotes: incidentNotes.trim() || undefined,
        clientUpdatedAt: now,
        idempotencyKey: uuidV4(),
      },
      projectCode: project.code,
      projectName: project.name,
      submitAfterCreate,
      syncState: 'local',
      createdAt: now,
      updatedAt: now,
    }

    try {
      await saveFieldReport(report)
      await enqueueReport(report)
      await reloadLocal(identity.id)
      setSummary('')
      setPersonnelCount('0')
      setWeatherNotes('')
      setIncidentNotes('')
      setSubmitAfterCreate(false)
      setMessage(isOnline
        ? 'Reporte guardado localmente y añadido a la cola de sincronización.'
        : 'Reporte creado sin conexión. Se sincronizará al recuperar la red.')
      if (isOnline) {
        await syncFieldReports(identity.id, true)
        await reloadLocal(identity.id)
      }
    } catch (error) {
      setMessage(messageFrom(error))
    } finally {
      setIsBusy(false)
    }
  }

  const handleManualSync = async () => {
    if (!identity) return
    if (!navigator.onLine) {
      setMessage('No hay conexión. La cola permanece segura en este dispositivo.')
      return
    }
    setIsBusy(true)
    setMessage('Sincronizando reportes…')
    try {
      const session = await refreshSession()
      const liveIdentity = toIdentity(session)
      await cacheIdentity(liveIdentity)
      setSessionMode('online')
      await retryFailedReports(identity.id)
      await syncFieldReports(identity.id, true)
      await refreshRemote(identity.id)
      setMessage('Sincronización finalizada.')
    } catch (error) {
      setSessionMode('offline')
      await reloadLocal(identity.id)
      setMessage(messageFrom(error))
    } finally {
      setIsBusy(false)
    }
  }

  if (sessionMode === 'loading') {
    return <section className="page field-reports-page"><div className="field-loading"><span className="loading-spinner" /> Preparando reportes de campo…</div></section>
  }

  if (!identity || sessionMode === 'signed-out') {
    return (
      <section className="page field-reports-page">
        <header className="page-header">
          <span className="eyebrow">Operación sincronizable</span>
          <h1>Reportes de campo</h1>
          <p>Inicia sesión para descargar tus proyectos. El token de acceso vive únicamente en memoria y la renovación usa una cookie HttpOnly.</p>
        </header>
        <form className="field-login-card" onSubmit={handleLogin}>
          <div className="settings-title">
            <span><Icon name="shield" /></span>
            <div><h2>Acceso operativo</h2><p>Conecta con la API configurada para OPECONCA.</p></div>
          </div>
          <label className="field">
            <span>Correo electrónico</span>
            <input autoComplete="username" inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input autoComplete="current-password" minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <button className="primary-button" disabled={isBusy} type="submit">{isBusy ? <span className="loading-spinner light" /> : <Icon name="arrow" />} Entrar</button>
          {message && <p aria-live="polite" className="field-message">{message}</p>}
        </form>
      </section>
    )
  }

  const pendingCount = reports.filter((report) => report.syncState !== 'synced').length
  const canCreate = identity.permissions.includes('fieldReports.create') || sessionMode === 'offline'

  return (
    <section className="page field-reports-page">
      <header className="page-header split-header">
        <div>
          <span className="eyebrow">Operación sincronizable</span>
          <h1>Reportes de campo</h1>
          <p>Crea evidencias operativas en terreno. Cada reporte se guarda primero en el dispositivo y usa una clave idempotente al sincronizar.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" disabled={isBusy} onClick={handleManualSync} type="button"><Icon name="routines" /> Sincronizar{pendingCount ? ` (${pendingCount})` : ''}</button>
          <button className="secondary-button" disabled={isBusy} onClick={handleLogout} type="button">Cerrar sesión</button>
        </div>
      </header>

      <div aria-live="polite" className={`field-session-banner ${sessionMode}`} role="status">
        <span className="storage-dot" />
        <div><strong>{identity.displayName}</strong><p>{sessionMode === 'online' ? 'Sesión conectada' : 'Modo offline con identidad guardada'} · {identity.email}</p></div>
        <span className="field-connectivity">{isOnline ? 'En línea' : 'Sin red'}</span>
      </div>
      {message && <p aria-live="polite" className="notice-banner field-message">{message}</p>}

      <div className="field-report-layout">
        <form className="field-report-form" onSubmit={handleCreate}>
          <div className="card-heading">
            <div><h2>Nuevo reporte</h2><p>Los campos requeridos funcionan también sin conexión.</p></div>
            <span className="draft-status">Guardado local</span>
          </div>
          <div className="field-report-form-grid">
            <label className="field field-wide">
              <span>Proyecto</span>
              <select disabled={!projects.length} onChange={(event) => setProjectId(event.target.value)} required value={projectId}>
                {!projects.length && <option value="">Sin proyectos en caché</option>}
                {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Fecha del reporte</span>
              <input onChange={(event) => setReportDate(event.target.value)} required type="date" value={reportDate} />
            </label>
            <label className="field">
              <span>Personal en campo</span>
              <input max="10000" min="0" onChange={(event) => setPersonnelCount(event.target.value)} required step="1" type="number" value={personnelCount} />
            </label>
            <label className="field field-wide">
              <span>Resumen</span>
              <textarea maxLength={2000} onChange={(event) => setSummary(event.target.value)} required rows={4} value={summary} />
              <small className="field-hint">Describe avance, actividades y resultados principales.</small>
            </label>
            <label className="field field-wide">
              <span>Clima observado</span>
              <textarea maxLength={1000} onChange={(event) => setWeatherNotes(event.target.value)} rows={3} value={weatherNotes} />
            </label>
            <label className="field field-wide">
              <span>Incidentes o novedades</span>
              <textarea maxLength={4000} onChange={(event) => setIncidentNotes(event.target.value)} rows={3} value={incidentNotes} />
            </label>
            <label className="field-submit-option field-wide">
              <input checked={submitAfterCreate} onChange={(event) => setSubmitAfterCreate(event.target.checked)} type="checkbox" />
              <span><strong>Enviar a aprobación después de crear</strong><small>Si no lo marcas, quedará como borrador remoto.</small></span>
            </label>
          </div>
          <footer className="form-footer">
            <p><Icon name="shield" size={15} /> No se almacenan tokens. La cola contiene solo los datos operativos necesarios para sincronizar.</p>
            <button className="primary-button" disabled={isBusy || !projects.length || !canCreate} type="submit"><Icon name="plus" /> Crear reporte</button>
          </footer>
          {!canCreate && <p className="inline-status error">Tu sesión no tiene permiso para crear reportes.</p>}
        </form>

        <aside className="field-project-card">
          <span className="eyebrow">Proyectos accesibles</span>
          <strong>{projects.length}</strong>
          <p>{projects.length ? 'Disponibles también sin conexión tras esta sesión.' : 'Conéctate para descargar tu listado de proyectos.'}</p>
          <ul>{projects.slice(0, 5).map((project) => <li key={project.id}><span>{project.code}</span>{project.name}</li>)}</ul>
        </aside>
      </div>

      <section className="field-report-list" aria-labelledby="field-report-list-title">
        <div className="field-report-list-heading">
          <div><span className="eyebrow">Actividad reciente</span><h2 id="field-report-list-title">Reportes en este dispositivo</h2></div>
          <span>{reports.length} reportes</span>
        </div>
        {!reports.length ? (
          <div className="field-empty"><Icon name="checklist" size={28} /><strong>Aún no hay reportes</strong><p>El primer reporte aparecerá aquí inmediatamente, incluso si no tienes conexión.</p></div>
        ) : (
          <div className="field-report-cards">
            {reports.map((report) => (
              <article className="field-report-card" key={report.localId}>
                <header><div><span>{report.projectCode}</span><h3>{report.projectName}</h3></div><span className={`sync-badge ${report.syncState}`}>{report.syncState === 'syncing' && <span className="loading-spinner" />}{reportStatus(report)}</span></header>
                <p>{report.payload.summary}</p>
                <dl><div><dt>Fecha</dt><dd>{new Date(`${report.payload.reportDate}T00:00:00`).toLocaleDateString('es')}</dd></div><div><dt>Personal</dt><dd>{report.payload.personnelCount}</dd></div><div><dt>Destino</dt><dd>{report.submitAfterCreate ? 'Aprobación' : 'Borrador'}</dd></div></dl>
                {report.error && <p className="field-report-error">{report.error}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
