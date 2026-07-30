import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from './Icon'
import {
  clearAccessToken,
  fetchFieldReports,
  fetchProjects,
  fetchPublications,
  fetchTasks,
  isAuthenticationError,
  login,
  logout,
  onAuthenticationFailure,
  refreshSession,
  toIdentity,
} from '../services/fieldApi'
import { retryFailedEnterpriseOperations, syncEnterpriseOperations, waitForEnterpriseSync } from '../services/enterpriseSync'
import { cachePublications, cacheTasks, loadEnterpriseOutbox } from '../services/enterpriseStorage'
import {
  cacheIdentity,
  cacheProjects,
  cacheServerReports,
  clearFieldSessionData,
  loadCachedIdentity,
  loadCachedProjects,
  loadFieldReports,
  reconcileFieldAuthorizationData,
} from '../services/fieldReportStorage'
import { retryFailedReports, syncFieldReports, waitForFieldReportSync } from '../services/fieldReportSync'
import type { FieldProject, SessionIdentity } from '../types/fieldReports'

export type FieldSessionMode = 'loading' | 'signed-out' | 'online' | 'offline'

interface FieldSessionContextValue {
  identity: SessionIdentity | null
  mode: FieldSessionMode
  projects: FieldProject[]
  isOnline: boolean
  isBusy: boolean
  message: string
  pendingCount: number
  dataRevision: number
  lastSyncAt: string | null
  loginWithCredentials: (email: string, password: string) => Promise<void>
  logoutSession: () => Promise<void>
  synchronize: (force?: boolean) => Promise<void>
  outboxChanged: () => Promise<void>
  setMessage: (message: string) => void
}

const FieldSessionContext = createContext<FieldSessionContextValue | null>(null)

const OFFLINE_SESSION_TTL_MS = 24 * 60 * 60 * 1_000

function isOfflineIdentityExpired(identity: SessionIdentity): boolean {
  const cachedAt = Date.parse(identity.cachedAt)
  return !Number.isFinite(cachedAt) || Date.now() - cachedAt > OFFLINE_SESSION_TTL_MS
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'La operación agotó el tiempo de espera. Comprueba la conexión.'
  }
  return error instanceof Error ? error.message : 'No pudimos completar la operación.'
}

async function purgePrivateBrowserCaches(): Promise<void> {
  if ('caches' in window) {
    const keys = await window.caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('salida-lista-')).map((key) => window.caches.delete(key)))
  }
  navigator.serviceWorker?.controller?.postMessage({ type: 'PURGE_PRIVATE_CACHES' })
}

export function FieldSessionProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<SessionIdentity | null>(null)
  const [mode, setMode] = useState<FieldSessionMode>('loading')
  const [projects, setProjects] = useState<FieldProject[]>([])
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [dataRevision, setDataRevision] = useState(0)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const sessionGeneration = useRef(0)
  const activeSynchronizations = useRef(new Map<string, Promise<void>>())

  const revokeSession = useCallback(async (ownerId: string, reason: string) => {
    sessionGeneration.current += 1
    clearAccessToken()
    setIdentity(null)
    setProjects([])
    setPendingCount(0)
    setMode('signed-out')
    await Promise.allSettled([
      activeSynchronizations.current.get(ownerId) ?? Promise.resolve(),
      waitForFieldReportSync(ownerId),
      waitForEnterpriseSync(ownerId),
    ])
    await clearFieldSessionData(ownerId)
    await purgePrivateBrowserCaches()
    setMessage(reason)
  }, [])

  const updatePendingCount = useCallback(async (ownerId: string) => {
    const [reports, operations] = await Promise.all([
      loadFieldReports(ownerId),
      loadEnterpriseOutbox(ownerId),
    ])
    setPendingCount(reports.filter((report) => report.syncState !== 'synced').length + operations.length)
  }, [])

  const outboxChanged = useCallback(async () => {
    if (!identity) return
    await updatePendingCount(identity.id)
    setDataRevision((current) => current + 1)
  }, [identity, updatePendingCount])

  useEffect(() => onAuthenticationFailure(() => {
    if (identity) {
      void revokeSession(identity.id, 'La sesión expiró o fue revocada. Los datos operativos locales fueron eliminados.')
    }
  }), [identity, revokeSession])

  const refreshRemote = useCallback(async (liveIdentity: SessionIdentity, expectedGeneration: number) => {
    const permissions = new Set(liveIdentity.permissions)
    const jobs: Promise<void>[] = []
    if (permissions.has('projects.read')) {
      jobs.push(fetchProjects().then(async (items) => {
        if (expectedGeneration !== sessionGeneration.current) return
        await cacheProjects(liveIdentity.id, items)
        if (expectedGeneration === sessionGeneration.current) setProjects(items)
      }))
    }
    if (permissions.has('fieldReports.read')) {
      jobs.push(fetchFieldReports().then(async (items) => {
        if (expectedGeneration === sessionGeneration.current) await cacheServerReports(liveIdentity.id, items)
      }))
    }
    if (permissions.has('publications.read')) {
      jobs.push(fetchPublications().then(async (items) => {
        if (expectedGeneration === sessionGeneration.current) await cachePublications(liveIdentity.id, items)
      }))
    }
    if (permissions.has('tasks.read')) {
      jobs.push(fetchTasks().then(async (items) => {
        if (expectedGeneration === sessionGeneration.current) await cacheTasks(liveIdentity.id, items)
      }))
    }
    await Promise.all(jobs)
    if (expectedGeneration === sessionGeneration.current) setDataRevision((current) => current + 1)
  }, [])

  const runSynchronization = useCallback((liveIdentity: SessionIdentity, force = false): Promise<void> => {
    const existing = activeSynchronizations.current.get(liveIdentity.id)
    if (existing) return existing
    const expectedGeneration = sessionGeneration.current
    const operation = (async () => {
      await Promise.all([
        syncFieldReports(liveIdentity.id, force),
        syncEnterpriseOperations(liveIdentity.id, force),
      ])
      if (expectedGeneration !== sessionGeneration.current) return
      await refreshRemote(liveIdentity, expectedGeneration)
      if (expectedGeneration !== sessionGeneration.current) return
      await updatePendingCount(liveIdentity.id)
      setLastSyncAt(new Date().toISOString())
    })().finally(() => {
      if (activeSynchronizations.current.get(liveIdentity.id) === operation) {
        activeSynchronizations.current.delete(liveIdentity.id)
      }
    })
    activeSynchronizations.current.set(liveIdentity.id, operation)
    return operation
  }, [refreshRemote, updatePendingCount])

  const synchronize = useCallback(async (force = false) => {
    if (!identity) return
    const expectedGeneration = sessionGeneration.current
    if (!navigator.onLine) {
      setMode('offline')
      setMessage('Sin conexión. Los cambios permanecen seguros en este dispositivo.')
      await updatePendingCount(identity.id)
      return
    }
    setIsBusy(true)
    try {
      const session = await refreshSession()
      if (expectedGeneration !== sessionGeneration.current) return
      const liveIdentity = toIdentity(session)
      await reconcileFieldAuthorizationData(liveIdentity.id, liveIdentity.permissions)
      await cacheIdentity(liveIdentity)
      if (expectedGeneration !== sessionGeneration.current) return
      setIdentity(liveIdentity)
      setMode('online')
      if (force) {
        await Promise.all([
          retryFailedReports(liveIdentity.id),
          retryFailedEnterpriseOperations(liveIdentity.id),
        ])
      }
      if (expectedGeneration !== sessionGeneration.current) return
      await runSynchronization(liveIdentity, force)
      if (expectedGeneration === sessionGeneration.current) setMessage('Datos operativos sincronizados.')
    } catch (error) {
      if (expectedGeneration !== sessionGeneration.current) return
      if (isAuthenticationError(error)) {
        await revokeSession(identity.id, 'La sesión expiró o fue revocada. Los datos operativos locales fueron eliminados.')
      } else {
        clearAccessToken()
        setMode('offline')
        setMessage(`Modo local: ${errorMessage(error)}`)
        await updatePendingCount(identity.id)
      }
    } finally {
      setIsBusy(false)
    }
  }, [identity, revokeSession, runSynchronization, updatePendingCount])

  useEffect(() => {
    let cancelled = false
    loadCachedIdentity().then(async (cachedIdentity) => {
      if (cancelled) return
      if (!cachedIdentity) {
        setMode('signed-out')
        return
      }
      if (!navigator.onLine && isOfflineIdentityExpired(cachedIdentity)) {
        await clearFieldSessionData(cachedIdentity.id)
        if (!cancelled) {
          setMode('signed-out')
          setMessage('La autorización offline venció. Conéctate e inicia sesión nuevamente.')
        }
        return
      }
      setIdentity(cachedIdentity)
      const cachedProjects = await loadCachedProjects(cachedIdentity.id)
      if (cancelled) return
      setProjects(cachedProjects)
      await updatePendingCount(cachedIdentity.id)
      if (!navigator.onLine) {
        setMode('offline')
        return
      }
      try {
        const session = await refreshSession()
        const liveIdentity = toIdentity(session)
        await cacheIdentity(liveIdentity)
        if (cancelled) return
        setIdentity(liveIdentity)
        setMode('online')
        await runSynchronization(liveIdentity, true)
      } catch (error) {
        if (cancelled) return
        if (isAuthenticationError(error)) {
          await revokeSession(cachedIdentity.id, 'Tu sesión ya no es válida. Los datos operativos locales fueron eliminados.')
        } else {
          clearAccessToken()
          setMode('offline')
          setMessage(`Modo local: ${errorMessage(error)}`)
        }
      }
    }).catch((error) => {
      if (!cancelled) {
        setMode('signed-out')
        setMessage(errorMessage(error))
      }
    })
    return () => {
      cancelled = true
    }
  }, [revokeSession, runSynchronization, updatePendingCount])

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false)
      if (identity) setMode('offline')
    }
    const handleOnline = () => {
      setIsOnline(true)
      if (identity) void synchronize()
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [identity, synchronize])

  useEffect(() => {
    if (!identity || mode !== 'offline') return
    const expiresAt = Date.parse(identity.cachedAt) + OFFLINE_SESSION_TTL_MS
    const remaining = expiresAt - Date.now()
    const expireOfflineSession = () => revokeSession(
      identity.id,
      'La autorización offline venció. Conéctate e inicia sesión nuevamente.',
    )
    if (remaining <= 0) {
      void expireOfflineSession()
      return
    }
    const timeout = window.setTimeout(() => void expireOfflineSession(), remaining)
    return () => window.clearTimeout(timeout)
  }, [identity, mode, revokeSession])

  useEffect(() => {
    if (!identity || mode !== 'online' || !isOnline) return
    const interval = window.setInterval(() => void synchronize(), 20_000)
    return () => window.clearInterval(interval)
  }, [identity, isOnline, mode, synchronize])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('opeconca-sync-state', {
      detail: { pendingCount, lastSyncAt, mode },
    }))
  }, [lastSyncAt, mode, pendingCount])

  const loginWithCredentials = useCallback(async (email: string, password: string) => {
    sessionGeneration.current += 1
    const expectedGeneration = sessionGeneration.current
    clearAccessToken()
    setIsBusy(true)
    setMessage('Iniciando sesión…')
    try {
      const previousIdentity = await loadCachedIdentity()
      const session = await login(email, password)
      if (expectedGeneration !== sessionGeneration.current) return
      const liveIdentity = toIdentity(session)
      if (previousIdentity && previousIdentity.id !== liveIdentity.id) await clearFieldSessionData(previousIdentity.id)
      await cacheIdentity(liveIdentity)
      setIdentity(liveIdentity)
      setMode('online')
      setProjects(await loadCachedProjects(liveIdentity.id))
      await runSynchronization(liveIdentity, true)
      setMessage('Sesión iniciada. Información operativa actualizada.')
    } catch (error) {
      clearAccessToken()
      setMode('signed-out')
      setMessage(errorMessage(error))
      throw error
    } finally {
      setIsBusy(false)
    }
  }, [runSynchronization])

  const logoutSession = useCallback(async () => {
    const currentIdentity = identity
    if (!currentIdentity) return
    const [localReports, enterpriseEntries] = await Promise.all([
      loadFieldReports(currentIdentity.id),
      loadEnterpriseOutbox(currentIdentity.id),
    ])
    const actualPendingCount = localReports.filter((report) => report.syncState !== 'synced').length + enterpriseEntries.length
    setPendingCount(actualPendingCount)
    if (actualPendingCount > 0 && !window.confirm(`Hay ${actualPendingCount} cambios sin sincronizar. Si cierras sesión se eliminarán de este dispositivo. ¿Continuar?`)) return

    setIsBusy(true)
    sessionGeneration.current += 1
    setIdentity(null)
    setMode('signed-out')
    clearAccessToken()
    try {
      await Promise.allSettled([
        activeSynchronizations.current.get(currentIdentity.id) ?? Promise.resolve(),
        waitForFieldReportSync(currentIdentity.id),
        waitForEnterpriseSync(currentIdentity.id),
      ])
      try {
        await logout()
      } catch {
        clearAccessToken()
      }
      await clearFieldSessionData(currentIdentity.id)
      await purgePrivateBrowserCaches()
      setProjects([])
      setPendingCount(0)
      setMessage('Sesión cerrada y datos operativos locales eliminados.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }, [identity])

  const value = useMemo<FieldSessionContextValue>(() => ({
    identity,
    mode,
    projects,
    isOnline,
    isBusy,
    message,
    pendingCount,
    dataRevision,
    lastSyncAt,
    loginWithCredentials,
    logoutSession,
    synchronize,
    outboxChanged,
    setMessage,
  }), [dataRevision, identity, isBusy, isOnline, lastSyncAt, loginWithCredentials, logoutSession, message, mode, outboxChanged, pendingCount, projects, synchronize])

  return <FieldSessionContext.Provider value={value}>{children}</FieldSessionContext.Provider>
}

// The hook intentionally shares this module with its provider to keep one session singleton.
// oxlint-disable-next-line react/only-export-components
export function useFieldSession(): FieldSessionContextValue {
  const context = useContext(FieldSessionContext)
  if (!context) throw new Error('useFieldSession debe usarse dentro de FieldSessionProvider.')
  return context
}

export function FieldSessionGate({
  children,
  title = 'Operación de campo',
  requiredPermissions = [],
}: {
  children: ReactNode
  title?: string
  requiredPermissions?: string[]
}) {
  const session = useFieldSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await session.loginWithCredentials(email, password)
      setPassword('')
    } catch {
      // The provider exposes the safe error message.
    }
  }

  if (session.mode === 'loading') {
    return <section className="page field-loading"><span className="loading-spinner" /> Preparando espacio operativo…</section>
  }
  if (!session.identity || session.mode === 'signed-out') {
    return (
      <section className="page field-access-page">
        <header className="page-header"><span className="eyebrow">Acceso seguro</span><h1>{title}</h1><p>El token de acceso permanece sólo en memoria. La renovación se realiza mediante una cookie HttpOnly.</p></header>
        <form className="field-login-card" onSubmit={handleLogin}>
          <div className="settings-title"><span><Icon name="shield" /></span><div><h2>Acceso operativo</h2><p>Usa tus credenciales corporativas OPECONCA.</p></div></div>
          <label className="field"><span>Correo electrónico</span><input autoComplete="username" inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label className="field"><span>Contraseña</span><input autoComplete="current-password" minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          <button className="primary-button" disabled={session.isBusy} type="submit"><Icon name="arrow" /> {session.isBusy ? 'Conectando…' : 'Entrar'}</button>
          {session.message && <p aria-live="polite" className="field-message">{session.message}</p>}
        </form>
      </section>
    )
  }
  const missingPermissions = requiredPermissions.filter((permission) => !session.identity?.permissions.includes(permission))
  if (missingPermissions.length) {
    return (
      <section className="page field-access-page">
        <header className="page-header"><span className="eyebrow">Acceso restringido</span><h1>{title}</h1><p>Tu sesión está activa, pero no tiene autorización para consultar este módulo.</p></header>
        <div className="field-login-card">
          <div className="settings-title"><span><Icon name="shield" /></span><div><h2>Permiso requerido</h2><p>Solicita el acceso correspondiente a un administrador.</p></div></div>
          <button className="secondary-button" disabled={session.isBusy} onClick={() => void session.logoutSession()} type="button">Cerrar sesión</button>
        </div>
      </section>
    )
  }
  return <>{children}</>
}

export function FieldSessionBanner() {
  const session = useFieldSession()
  if (!session.identity) return null
  return (
    <div aria-live="polite" className={`field-session-banner ${session.mode}`} role="status">
      <span className="storage-dot" />
      <div><strong>{session.identity.displayName}</strong><p>{session.mode === 'online' ? 'Sesión conectada' : 'Modo offline con identidad guardada'} · {session.identity.email}</p></div>
      <span className="field-connectivity">{session.isOnline ? `${session.pendingCount} pendientes` : 'Sin red'}</span>
    </div>
  )
}
