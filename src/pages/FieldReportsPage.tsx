import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { FieldSessionBanner, useFieldSession } from '../components/FieldSessionProvider'
import { Icon } from '../components/Icon'
import {
  enqueueReport,
  loadFieldReports,
} from '../services/fieldReportStorage'
import type { LocalFieldReport, SyncState } from '../types/fieldReports'

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

function reportStatus(report: LocalFieldReport): string {
  const serverStatus = report.serverReport?.status
  if (!serverStatus) return syncLabels[report.syncState]
  return ({ DRAFT: 'Borrador remoto', SUBMITTED: 'Enviado', APPROVED: 'Aprobado', REJECTED: 'Rechazado' })[serverStatus]
}

export function FieldReportsPage() {
  const session = useFieldSession()
  const [reports, setReports] = useState<LocalFieldReport[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [reportDate, setReportDate] = useState(today)
  const [summary, setSummary] = useState('')
  const [personnelCount, setPersonnelCount] = useState('0')
  const [weatherNotes, setWeatherNotes] = useState('')
  const [incidentNotes, setIncidentNotes] = useState('')
  const [submitAfterCreate, setSubmitAfterCreate] = useState(false)

  const reload = useCallback(async () => {
    if (!session.identity) return
    setReports(await loadFieldReports(session.identity.id))
    setProjectId((current) => current || session.projects[0]?.id || '')
  }, [session.identity, session.projects])

  useEffect(() => {
    void reload()
  }, [reload, session.dataRevision])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!session.identity) return
    const project = session.projects.find((candidate) => candidate.id === projectId)
    if (!project) {
      session.setMessage('Selecciona un proyecto disponible.')
      return
    }
    setIsSaving(true)
    const now = new Date().toISOString()
    const report: LocalFieldReport = {
      localId: uuidV4(),
      ownerId: session.identity.id,
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
      await enqueueReport(report)
      await session.outboxChanged()
      setSummary('')
      setPersonnelCount('0')
      setWeatherNotes('')
      setIncidentNotes('')
      setSubmitAfterCreate(false)
      await reload()
      session.setMessage(session.isOnline
        ? 'Reporte guardado localmente y añadido a la cola.'
        : 'Reporte creado sin conexión. Se sincronizará al recuperar la red.')
      if (session.isOnline) await session.synchronize(true)
    } catch (error) {
      session.setMessage(error instanceof Error ? error.message : 'No pudimos guardar el reporte.')
    } finally {
      setIsSaving(false)
    }
  }

  const canCreate = Boolean(session.identity?.permissions.includes('fieldReports.create'))

  return (
    <section className="page field-reports-page">
      <header className="page-header split-header">
        <div><span className="eyebrow">Operación sincronizable</span><h1>Reportes de campo</h1><p>Crea evidencias operativas en terreno. Cada reporte se guarda primero en el dispositivo y usa una clave idempotente al sincronizar.</p></div>
        <div className="header-actions"><button className="secondary-button" disabled={session.isBusy} onClick={() => void session.synchronize(true)} type="button"><Icon name="routines" /> Sincronizar{session.pendingCount ? ` (${session.pendingCount})` : ''}</button><button className="secondary-button" disabled={session.isBusy} onClick={() => void session.logoutSession()} type="button">Cerrar sesión</button></div>
      </header>
      <FieldSessionBanner />
      {session.message && <p aria-live="polite" className="notice-banner field-message">{session.message}</p>}

      <div className="field-report-layout">
        <form className="field-report-form" onSubmit={handleCreate}>
          <div className="card-heading"><div><h2>Nuevo reporte</h2><p>Los campos requeridos funcionan también sin conexión.</p></div><span className="draft-status">Guardado local</span></div>
          <div className="field-report-form-grid">
            <label className="field field-wide"><span>Proyecto</span><select disabled={!session.projects.length} onChange={(event) => setProjectId(event.target.value)} required value={projectId}>{!session.projects.length && <option value="">Sin proyectos en caché</option>}{session.projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>
            <label className="field"><span>Fecha del reporte</span><input onChange={(event) => setReportDate(event.target.value)} required type="date" value={reportDate} /></label>
            <label className="field"><span>Personal en campo</span><input max="10000" min="0" onChange={(event) => setPersonnelCount(event.target.value)} required step="1" type="number" value={personnelCount} /></label>
            <label className="field field-wide"><span>Resumen</span><textarea maxLength={2000} onChange={(event) => setSummary(event.target.value)} required rows={4} value={summary} /><small className="field-hint">Describe avance, actividades y resultados principales.</small></label>
            <label className="field field-wide"><span>Clima observado</span><textarea maxLength={1000} onChange={(event) => setWeatherNotes(event.target.value)} rows={3} value={weatherNotes} /></label>
            <label className="field field-wide"><span>Incidentes o novedades</span><textarea maxLength={4000} onChange={(event) => setIncidentNotes(event.target.value)} rows={3} value={incidentNotes} /></label>
            <label className="field-submit-option field-wide"><input checked={submitAfterCreate} onChange={(event) => setSubmitAfterCreate(event.target.checked)} type="checkbox" /><span><strong>Enviar a aprobación después de crear</strong><small>Si no lo marcas, quedará como borrador remoto.</small></span></label>
          </div>
          <footer className="form-footer"><p><Icon name="shield" size={15} /> No se almacenan tokens. La cola contiene sólo los datos necesarios.</p><button className="primary-button" disabled={isSaving || !session.projects.length || !canCreate} type="submit"><Icon name="plus" /> Crear reporte</button></footer>
          {!canCreate && <p className="inline-status error">Tu sesión no tiene permiso para crear reportes.</p>}
        </form>

        <aside className="field-project-card"><span className="eyebrow">Proyectos accesibles</span><strong>{session.projects.length}</strong><p>{session.projects.length ? 'Disponibles también sin conexión tras esta sesión.' : 'Conéctate para descargar tu listado de proyectos.'}</p><ul>{session.projects.slice(0, 5).map((project) => <li key={project.id}><span>{project.code}</span>{project.name}</li>)}</ul></aside>
      </div>

      <section className="field-report-list" aria-labelledby="field-report-list-title">
        <div className="field-report-list-heading"><div><span className="eyebrow">Actividad reciente</span><h2 id="field-report-list-title">Reportes en este dispositivo</h2></div><span>{reports.length} reportes</span></div>
        {!reports.length ? <div className="field-empty"><Icon name="checklist" size={28} /><strong>Aún no hay reportes</strong><p>El primer reporte aparecerá aquí inmediatamente, incluso sin conexión.</p></div> : <div className="field-report-cards">{reports.map((report) => <article className="field-report-card" key={report.localId}><header><div><span>{report.projectCode}</span><h3>{report.projectName}</h3></div><span className={`sync-badge ${report.syncState}`}>{report.syncState === 'syncing' && <span className="loading-spinner" />}{reportStatus(report)}</span></header><p>{report.payload.summary}</p><dl><div><dt>Fecha</dt><dd>{new Date(`${report.payload.reportDate}T00:00:00`).toLocaleDateString('es')}</dd></div><div><dt>Personal</dt><dd>{report.payload.personnelCount}</dd></div><div><dt>Destino</dt><dd>{report.submitAfterCreate ? 'Aprobación' : 'Borrador'}</dd></div></dl>{report.error && <p className="field-report-error">{report.error}</p>}</article>)}</div>}
      </section>
    </section>
  )
}
