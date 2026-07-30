import type {
  PublicationView,
  TaskChecklistItem,
  TaskComment,
  TaskTransition,
  WorkTaskView,
} from '../types/enterprise'
import type {
  AuthSession,
  FieldProject,
  FieldReportPayload,
  PageResult,
  ServerFieldReport,
  SessionIdentity,
} from '../types/fieldReports'

const DEFAULT_API_URL = '/api/v1'
const AUTH_TIMEOUT_MS = 10_000
const SYNC_TIMEOUT_MS = 15_000

let accessToken: string | null = null
let refreshRequest: Promise<AuthSession> | null = null
let authGeneration = 0
const authenticationFailureListeners = new Set<(error: FieldApiError) => void>()

function notifyAuthenticationFailure(error: FieldApiError): void {
  authenticationFailureListeners.forEach((listener) => listener(error))
}

export function onAuthenticationFailure(listener: (error: FieldApiError) => void): () => void {
  authenticationFailureListeners.add(listener)
  return () => authenticationFailureListeners.delete(listener)
}

function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_URL
  const normalized = configured.replace(/\/$/, '')
  return /\/api\/v\d+$/.test(normalized) ? normalized : `${normalized}/api/v1`
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

export class FieldApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'FieldApiError'
    this.status = status
  }
}

async function responseError(response: Response): Promise<FieldApiError> {
  let message = `La API respondió con estado ${response.status}.`
  try {
    const body = await response.json() as { message?: string | string[] }
    if (Array.isArray(body.message)) message = body.message.join(' ')
    else if (body.message) message = body.message
  } catch {
    // The status-based message remains useful for non-JSON failures.
  }
  return new FieldApiError(message, response.status)
}

export function isAuthenticationError(error: unknown): boolean {
  return error instanceof FieldApiError && error.status === 401
}

export function isRetryableApiError(error: unknown): boolean {
  if (!(error instanceof FieldApiError)) return true
  return error.status === 408 || error.status === 429 || error.status >= 500
}

async function authRequest(path: string, init: RequestInit = {}): Promise<AuthSession> {
  const requestGeneration = authGeneration
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    signal: timeoutSignal(AUTH_TIMEOUT_MS),
  })
  if (!response.ok) throw await responseError(response)
  const session = await response.json() as AuthSession
  if (requestGeneration !== authGeneration) {
    throw new DOMException('La sesión cambió durante la solicitud.', 'AbortError')
  }
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
    const request = authRequest('/auth/refresh', { method: 'POST' })
    refreshRequest = request
    void request.finally(() => {
      if (refreshRequest === request) refreshRequest = null
    }).catch(() => undefined)
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
    clearAccessToken()
  }
}

export function clearAccessToken(): void {
  authGeneration += 1
  accessToken = null
  refreshRequest = null
}

interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number
  retryAuth?: boolean
}

async function authenticatedRequest(path: string, options: ApiRequestOptions = {}): Promise<Response> {
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
    return authenticatedRequest(path, { ...options, retryAuth: false })
  }
  if (!response.ok) {
    const error = await responseError(response)
    if (isAuthenticationError(error)) notifyAuthenticationFailure(error)
    throw error
  }
  return response
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await authenticatedRequest(path, options)
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

export function fetchPublications(): Promise<PublicationView[]> {
  return fetchEveryPage<PublicationView>('/publications/feed')
}

export async function fetchPublicationCover(publicationId: string): Promise<Blob> {
  const response = await authenticatedRequest(`/publications/${encodeURIComponent(publicationId)}/cover`, {
    cache: 'no-store',
  })
  return response.blob()
}

export function acknowledgePublication(publicationId: string): Promise<{ publicationId: string; userId: string; readAt: string }> {
  return apiRequest(`/publications/${encodeURIComponent(publicationId)}/acknowledge`, { method: 'POST' })
}

export function fetchTasks(): Promise<WorkTaskView[]> {
  return fetchEveryPage<WorkTaskView>('/tasks?mine=true')
}

export function transitionTask(taskId: string, transition: TaskTransition): Promise<WorkTaskView> {
  return apiRequest(`/tasks/${encodeURIComponent(taskId)}/${transition}`, { method: 'POST' })
}

export function toggleTaskChecklistItem(taskId: string, itemId: string): Promise<TaskChecklistItem> {
  return apiRequest(`/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}/toggle`, { method: 'POST' })
}

export function createTaskComment(taskId: string, content: string): Promise<TaskComment> {
  return apiRequest(`/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export function fetchTask(taskId: string): Promise<WorkTaskView> {
  return apiRequest(`/tasks/${encodeURIComponent(taskId)}`)
}
