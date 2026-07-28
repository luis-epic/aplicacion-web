import type {
  AuthSession,
  FieldProject,
  FieldReportPayload,
  PageResult,
  ServerFieldReport,
  SessionIdentity,
} from '../types/fieldReports'

const DEFAULT_API_URL = 'http://localhost:4000/api/v1'
const AUTH_TIMEOUT_MS = 10_000
const SYNC_TIMEOUT_MS = 15_000

let accessToken: string | null = null
let refreshRequest: Promise<AuthSession> | null = null

function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_URL
  const normalized = configured.replace(/\/$/, '')
  return /\/api\/v\d+$/.test(normalized) ? normalized : `${normalized}/api/v1`
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

async function responseError(response: Response): Promise<Error> {
  let message = `La API respondió con estado ${response.status}.`
  try {
    const body = await response.json() as { message?: string | string[] }
    if (Array.isArray(body.message)) message = body.message.join(' ')
    else if (body.message) message = body.message
  } catch {
    // The status-based message remains useful for non-JSON failures.
  }
  const error = new Error(message) as Error & { status?: number }
  error.status = response.status
  return error
}

async function authRequest(path: string, init: RequestInit = {}): Promise<AuthSession> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    signal: timeoutSignal(AUTH_TIMEOUT_MS),
  })
  if (!response.ok) throw await responseError(response)
  const session = await response.json() as AuthSession
  accessToken = session.accessToken
  return session
}

export function toIdentity(session: AuthSession): SessionIdentity {
  return { ...session.user, cachedAt: new Date().toISOString() }
}

export function login(email: string, password: string): Promise<AuthSession> {
  return authRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function refreshSession(): Promise<AuthSession> {
  if (!refreshRequest) {
    refreshRequest = authRequest('/auth/refresh', { method: 'POST' })
      .finally(() => {
        refreshRequest = null
      })
  }
  return refreshRequest
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${apiBaseUrl()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      signal: timeoutSignal(AUTH_TIMEOUT_MS),
    })
  } finally {
    accessToken = null
  }
}

export function clearAccessToken(): void {
  accessToken = null
}

interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number
  retryAuth?: boolean
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = SYNC_TIMEOUT_MS, retryAuth = true, ...init } = options
  if (!accessToken) await refreshSession()

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${accessToken ?? ''}`,
      ...init.headers,
    },
    signal: timeoutSignal(timeoutMs),
  })

  if (response.status === 401 && retryAuth) {
    accessToken = null
    await refreshSession()
    return apiRequest<T>(path, { ...options, retryAuth: false })
  }
  if (!response.ok) throw await responseError(response)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function fetchEveryPage<T>(path: string): Promise<T[]> {
  const items: T[] = []
  let page = 1
  let total = 0
  do {
    const separator = path.includes('?') ? '&' : '?'
    const result = await apiRequest<PageResult<T>>(`${path}${separator}page=${page}&pageSize=100`)
    items.push(...result.items)
    total = result.total
    page += 1
  } while (items.length < total)
  return items
}

export function fetchProjects(): Promise<FieldProject[]> {
  return fetchEveryPage<FieldProject>('/projects')
}

export function fetchFieldReports(): Promise<ServerFieldReport[]> {
  return fetchEveryPage<ServerFieldReport>('/field-reports')
}

export function createFieldReport(payload: FieldReportPayload): Promise<ServerFieldReport> {
  return apiRequest('/field-reports', { method: 'POST', body: JSON.stringify(payload) })
}

export function submitFieldReport(id: string): Promise<ServerFieldReport> {
  return apiRequest(`/field-reports/${encodeURIComponent(id)}/submit`, { method: 'POST' })
}
