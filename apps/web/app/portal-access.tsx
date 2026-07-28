'use client'

import {
  authSessionSchema,
  type AuthSession,
  type LoginRequest,
} from '@opeconca/contracts'
import { FormEvent, useEffect, useState } from 'react'
import { PortalWorkspace } from './portal-workspace'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
const AUTH_TIMEOUT_MS = 12_000
let restorePromise: Promise<AuthSession | null> | null = null

function BrandMark({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <span aria-hidden="true" className={compact ? 'brand-mark brand-mark-compact' : 'brand-mark'}>
      <span />
      <span />
    </span>
  )
}

async function authFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado. Intenta nuevamente.')
    }
    throw new Error('No fue posible conectar con la API.')
  } finally {
    window.clearTimeout(timeout)
  }
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { message?: unknown }
    if (Array.isArray(payload.message)) return payload.message.join(' ')
    if (typeof payload.message === 'string') return payload.message
  } catch {
    // La respuesta puede no contener JSON; se usa el mensaje seguro por defecto.
  }
  return 'No fue posible completar la solicitud.'
}

async function readSession(response: Response): Promise<AuthSession> {
  const payload: unknown = await response.json()
  const parsed = authSessionSchema.safeParse(payload)
  if (!parsed.success) throw new Error('La API devolvió una sesión incompleta.')
  return parsed.data
}

function restoreSession(): Promise<AuthSession | null> {
  if (restorePromise) return restorePromise

  const pending = authFetch('/auth/refresh', { method: 'POST' }).then(async (response) => {
    if (response.status === 401) return null
    if (!response.ok) throw new Error(await responseMessage(response))
    return readSession(response)
  })
  restorePromise = pending
  void pending.finally(() => {
    if (restorePromise === pending) restorePromise = null
  }).catch(() => undefined)
  return pending
}

export function PortalAccess() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    restoreSession()
      .then((restored) => {
        if (active && restored) setSession(restored)
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : 'No se pudo restaurar la sesión.')
      })
      .finally(() => {
        if (active) setInitializing(false)
      })
    return () => { active = false }
  }, [])

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    const form = new FormData(event.currentTarget)
    const credentials: LoginRequest = {
      email: String(form.get('email') ?? '').trim().toLowerCase(),
      password: String(form.get('password') ?? ''),
    }

    try {
      const response = await authFetch('/auth/login', {
        body: JSON.stringify(credentials),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) throw new Error(await responseMessage(response))
      const nextSession = await readSession(response)
      restorePromise = null
      setSession(nextSession)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar sesión.')
    } finally {
      setSubmitting(false)
    }
  }

  const logout = async () => {
    setSubmitting(true)
    setMessage('')
    try {
      const response = await authFetch('/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error(await responseMessage(response))
      restorePromise = null
      setSession(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.')
    } finally {
      setSubmitting(false)
    }
  }

  if (initializing) {
    return (
      <main aria-busy="true" className="access-state">
        <div className="access-loader"><BrandMark /><span className="loader-ring" /><strong>Preparando tu espacio operativo</strong><small>Verificando sesión segura…</small></div>
      </main>
    )
  }

  if (session) {
    return <PortalWorkspace onLogout={logout} onSession={setSession} session={session} />
  }

  return (
    <main className="login-shell">
      <section className="login-intro" aria-labelledby="login-title">
        <div className="login-brand"><BrandMark /><div><strong>OPECONCA</strong><span>Plataforma operativa</span></div></div>
        <div className="login-hero-copy"><p className="eyebrow">Operación conectada</p><h1 id="login-title">Del terreno a la oficina, bajo un mismo control.</h1><p>Coordina clientes, proyectos y actividad de campo con información protegida y una visión clara del trabajo.</p></div>
        <div className="login-proof" aria-label="Capacidades de la plataforma"><div><strong>01</strong><span>Permisos verificados en servidor</span></div><div><strong>02</strong><span>Sesiones renovables y revocables</span></div><div><strong>03</strong><span>Actividad sensible auditable</span></div></div>
      </section>
      <section className="login-panel" aria-labelledby="access-title">
        <div className="login-panel-inner">
          <div className="login-mobile-brand"><BrandMark compact /><strong>OPECONCA</strong></div>
          <header className="login-form-heading"><span className="secure-chip"><i /> Acceso protegido</span><h2 id="access-title">Bienvenido</h2><p>Ingresa con tus credenciales para acceder al portal administrativo.</p></header>
          <form onSubmit={login}>
            <label>Correo electrónico<input autoComplete="username" name="email" placeholder="nombre@empresa.com" required type="email" /></label>
            <label>Contraseña<input autoComplete="current-password" minLength={12} name="password" placeholder="••••••••••••" required type="password" /></label>
            {message && <p className="form-message" role="alert">{message}</p>}
            <button className="login-button" disabled={submitting} type="submit">{submitting && <span className="button-spinner" />}{submitting ? 'Verificando acceso…' : 'Entrar al portal'}{!submitting && <span aria-hidden="true">→</span>}</button>
          </form>
          <p className="login-security-note"><span aria-hidden="true">◆</span>El token de renovación permanece protegido en una cookie HttpOnly.</p>
        </div>
      </section>
    </main>
  )
}
