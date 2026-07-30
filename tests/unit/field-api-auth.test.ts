import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apiRequest,
  clearAccessToken,
  FieldApiError,
  onAuthenticationFailure,
} from '../../src/services/fieldApi'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  clearAccessToken()
  vi.unstubAllGlobals()
})

describe('revocación de autorización de campo', () => {
  it('notifies a final 401 only after the automatic refresh retry fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        accessToken: 'first-token',
        expiresIn: 300,
        user: { id: 'owner-a', email: 'a@example.test', displayName: 'A', roles: [], permissions: [] },
      }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Token vencido' }))
      .mockResolvedValueOnce(jsonResponse(200, {
        accessToken: 'second-token',
        expiresIn: 300,
        user: { id: 'owner-a', email: 'a@example.test', displayName: 'A', roles: [], permissions: [] },
      }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Sesión revocada' }))
    vi.stubGlobal('fetch', fetchMock)
    const failures: FieldApiError[] = []
    const unsubscribe = onAuthenticationFailure((error) => failures.push(error))

    await expect(apiRequest('/projects')).rejects.toMatchObject({ status: 401, message: 'Sesión revocada' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(failures).toHaveLength(1)
    expect(failures[0]?.status).toBe(401)
    unsubscribe()
  })

  it('keeps a valid session on 403 so business authorization failures cannot purge unrelated offline work', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        accessToken: 'token',
        expiresIn: 300,
        user: { id: 'owner-a', email: 'a@example.test', displayName: 'A', roles: [], permissions: [] },
      }))
      .mockResolvedValueOnce(jsonResponse(403, { message: 'Permiso revocado' }))
    vi.stubGlobal('fetch', fetchMock)
    const failures: FieldApiError[] = []
    const unsubscribe = onAuthenticationFailure((error) => failures.push(error))

    await expect(apiRequest('/tasks')).rejects.toMatchObject({ status: 403, message: 'Permiso revocado' })
    expect(failures).toHaveLength(0)
    unsubscribe()
  })
})
