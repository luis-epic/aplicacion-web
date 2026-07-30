'use client'

import { authSessionSchema, type AuthSession } from '@opeconca/contracts'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1'
const REQUEST_TIMEOUT_MS = 12_000

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export class PortalApi {
  private accessToken: string
  private refreshPromise: Promise<AuthSession> | null = null

  constructor(
    session: AuthSession,
    private readonly onSession: (session: AuthSession | null) => void,
  ) {
    this.accessToken = session.accessToken
  }

  updateSession(session: AuthSession): void {
    this.accessToken = session.accessToken
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchWithTimeout(path, init)
    if (response.status !== 401) return this.read<T>(response)

    const session = await this.refresh()
    this.accessToken = session.accessToken
    this.onSession(session)
    return this.read<T>(await this.fetchWithTimeout(path, init))
  }

  async requestBlob(path: string): Promise<Blob> {
    let response = await this.fetchWithTimeout(path, { cache: 'no-store' })
    if (response.status === 401) {
      const session = await this.refresh()
      this.accessToken = session.accessToken
      this.onSession(session)
      response = await this.fetchWithTimeout(path, { cache: 'no-store' })
    }
    if (!response.ok) await this.read<never>(response)
    return response.blob()
  }

  private async refresh(): Promise<AuthSession> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.fetchWithTimeout('/auth/refresh', {
        credentials: 'include',
        method: 'POST',
      }, false).then(async (response) => {
        if (!response.ok) {
          this.accessToken = ''
          this.onSession(null)
          throw new Error('La sesión venció. Inicia sesión nuevamente.')
        }
        const payload: unknown = await response.json()
        const parsed = authSessionSchema.safeParse(payload)
        if (!parsed.success) throw new Error('La API devolvió una sesión incompleta.')
        return parsed.data
      }).finally(() => {
        this.refreshPromise = null
      })
    }
    return this.refreshPromise
  }

  private async fetchWithTimeout(
    path: string,
    init: RequestInit,
    authenticated = true,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const headers = new Headers(init.headers)
    if (authenticated) headers.set('Authorization', `Bearer ${this.accessToken}`)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

    try {
      return await fetch(`${API_URL}${path}`, {
        ...init,
        credentials: init.credentials ?? 'include',
        headers,
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

  private async read<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      if (!response.ok) throw new Error('La API devolvió una respuesta inválida.')
      return undefined as T
    }
    if (!response.ok) {
      const message = (payload as { message?: unknown }).message
      throw new Error(Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : 'No fue posible completar la operación.')
    }
    return payload as T
  }
}
