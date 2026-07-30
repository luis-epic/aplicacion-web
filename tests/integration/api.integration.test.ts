import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'

const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4400/api/v1'
const portalBaseUrl = process.env.PORTAL_BASE_URL ?? 'http://localhost:3300'
const fieldBaseUrl = process.env.FIELD_BASE_URL ?? 'http://localhost:5273'
const adminEmail = process.env.E2E_ADMIN_EMAIL
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const publicationPublisherRoleId = '00000000-0000-4000-8000-000000000002'

interface SessionResponse {
  accessToken: string
  user: { id: string; permissions: string[] }
}

interface Entity { id: string }
interface Page<T> { items: T[]; total: number }

async function request(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)
  return fetch(`${baseUrl}${path}`, { ...init, headers })
}

async function json<T>(response: Response, expectedStatus: number): Promise<T> {
  const payload = await response.json().catch(() => null) as T
  expect(response.status, JSON.stringify(payload)).toBe(expectedStatus)
  return payload
}

describe('API MVP integration', () => {
  let session: SessionResponse
  let client: Entity
  let project: Entity & { code: string }
  const projectCode = `REL-${randomUUID().slice(0, 8).toUpperCase()}`

  beforeAll(async () => {
    if (!adminEmail || !adminPassword) {
      throw new Error('E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD son obligatorios para la integración.')
    }
    await json(await request('/health/ready'), 200)
    session = await json<SessionResponse>(await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    }), 200)
    expect(session.accessToken).toBeTruthy()

    client = await json<Entity>(await request('/clients', {
      method: 'POST',
      body: JSON.stringify({ name: `Cliente release ${projectCode}` }),
    }, session.accessToken), 201)
    project = await json<typeof project>(await request('/projects', {
      method: 'POST',
      body: JSON.stringify({ clientId: client.id, code: projectCode, name: `Proyecto ${projectCode}` }),
    }, session.accessToken), 201)
    await json(await request(`/projects/${project.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId: session.user.id, role: 'SUPERVISOR' }),
    }, session.accessToken), 201)
  })

  it('enforces authentication and trusted origins', async () => {
    expect((await request('/clients')).status).toBe(401)
    const forbidden = await request('/auth/refresh', {
      method: 'POST',
      headers: { origin: 'https://untrusted.example.test' },
    })
    expect(forbidden.status).toBe(403)
  })

  it('returns validation, not-found and conflict semantics', async () => {
    const invalid = await request('/field-reports', {
      method: 'POST',
      body: JSON.stringify({ projectId: project.id, summary: '' }),
    }, session.accessToken)
    expect(invalid.status).toBe(400)

    const externalCover = await request('/publications', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Portada externa no permitida',
        slug: `portada-externa-${randomUUID()}`,
        summary: 'Debe rechazarse antes de persistir.',
        content: 'La política sólo admite medios corporativos del mismo origen.',
        coverImageUrl: 'https://cdn.example.test/cover.webp',
        type: 'DAILY',
        category: 'Operaciones',
      }),
    }, session.accessToken)
    expect(externalCover.status).toBe(400)

    expect((await request(`/field-reports/${randomUUID()}`, {}, session.accessToken)).status).toBe(404)

    const conflict = await request('/projects', {
      method: 'POST',
      body: JSON.stringify({ clientId: client.id, code: projectCode, name: 'Código repetido' }),
    }, session.accessToken)
    expect(conflict.status).toBe(409)
  })

  it('creates an idempotent field report exactly once', async () => {
    const idempotencyKey = randomUUID()
    const payload = {
      projectId: project.id,
      reportDate: '2026-07-29',
      summary: 'Validación integral del release candidato.',
      personnelCount: 3,
      clientUpdatedAt: new Date().toISOString(),
      idempotencyKey,
    }
    const first = await json<Entity>(await request('/field-reports', {
      method: 'POST', body: JSON.stringify(payload),
    }, session.accessToken), 201)
    const repeated = await json<Entity>(await request('/field-reports', {
      method: 'POST', body: JSON.stringify(payload),
    }, session.accessToken), 201)
    expect(repeated.id).toBe(first.id)

    const page = await json<Page<Entity & { idempotencyKey: string }>>(await request(
      `/field-reports?projectId=${project.id}&page=1&pageSize=100`,
      {},
      session.accessToken,
    ), 200)
    expect(page.items.filter((item) => item.idempotencyKey === idempotencyKey)).toEqual([
      expect.objectContaining({ id: first.id, idempotencyKey }),
    ])
  })

  it('enforces least privilege and project membership on enterprise workflows', async () => {
    const limitedEmail = `limited-${randomUUID()}@opeconca.invalid`
    const limitedPassword = `${randomUUID()}aA1!`
    const limitedUser = await json<Entity>(await request('/users', {
      method: 'POST',
      body: JSON.stringify({
        email: limitedEmail,
        password: limitedPassword,
        displayName: 'Usuario de mínimo privilegio',
      }),
    }, session.accessToken), 201)
    const limitedSession = await json<SessionResponse>(await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: limitedEmail, password: limitedPassword }),
    }), 200)
    expect(limitedSession.user.permissions).toEqual([])

    expect((await request('/tasks?mine=true', {}, limitedSession.accessToken)).status).toBe(403)
    expect((await request('/tasks/assignment-candidates', {}, limitedSession.accessToken)).status).toBe(403)
    expect((await request('/publications/review-queue', {}, limitedSession.accessToken)).status).toBe(403)

    const publication = await json<Entity & { coverImageUrl: string }>(await request('/publications', {
      method: 'POST',
      body: JSON.stringify({
        title: `Boletín ${projectCode}`,
        slug: `boletin-${randomUUID()}`,
        summary: 'Validación de autorización editorial.',
        content: 'Contenido de validación para comprobar el permiso de publicación.',
        coverImageUrl: '/media/publications/integration/boletin.png',
        type: 'DAILY',
        category: 'Operaciones',
      }),
    }, session.accessToken), 201)
    expect(publication.coverImageUrl).toBe('/media/publications/integration/boletin.png')
    expect((await request(`/publications/${publication.id}/cover`)).status).toBe(401)
    expect((await request(`/publications/${publication.id}/cover`, {}, limitedSession.accessToken)).status).toBe(403)
    for (const origin of [portalBaseUrl, fieldBaseUrl]) {
      const publicMediaResponse = await fetch(`${origin}${publication.coverImageUrl}`)
      expect(publicMediaResponse.status).toBe(404)
      const mediaResponse = await fetch(`${origin}/api/v1/publications/${publication.id}/cover`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      })
      expect(mediaResponse.status).toBe(200)
      expect(mediaResponse.headers.get('content-type')).toBe('image/png')
      expect(mediaResponse.headers.get('cache-control')).toContain('no-store')
      expect((await mediaResponse.arrayBuffer()).byteLength).toBeGreaterThan(0)
    }
    await json(await request(`/publications/${publication.id}/submit`, {
      method: 'POST',
    }, session.accessToken), 200)
    expect((await request(`/publications/${publication.id}/publish`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, limitedSession.accessToken)).status).toBe(403)

    const publisherEmail = `publisher-${randomUUID()}@opeconca.invalid`
    const publisherPassword = `${randomUUID()}pP1!`
    await json<Entity>(await request('/users', {
      method: 'POST',
      body: JSON.stringify({
        email: publisherEmail,
        password: publisherPassword,
        displayName: 'Publicador de mínimo privilegio',
        roleIds: [publicationPublisherRoleId],
      }),
    }, session.accessToken), 201)
    const publisherSession = await json<SessionResponse>(await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: publisherEmail, password: publisherPassword }),
    }), 200)
    expect(publisherSession.user.permissions).toHaveLength(6)
    expect(publisherSession.user.permissions).toEqual(expect.arrayContaining([
      'publications.read',
      'publications.create',
      'publications.manage',
      'publications.publish',
      'tasks.read',
      'tasks.create',
    ]))
    await json<Page<Entity>>(await request('/publications/feed', {}, publisherSession.accessToken), 200)
    await json<Page<Entity>>(await request('/publications/review-queue', {}, publisherSession.accessToken), 200)
    await json<Entity>(await request(`/publications/${publication.id}`, {}, publisherSession.accessToken), 200)
    await json<Entity>(await request(`/publications/${publication.id}/publish`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, publisherSession.accessToken), 200)

    const task = await json<Entity>(await request('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: `Tarea de autorización ${projectCode}`,
        projectId: project.id,
        idempotencyKey: randomUUID(),
      }),
    }, session.accessToken), 201)
    const assignment = { assigneeId: limitedUser.id }
    expect((await request(`/tasks/${task.id}/assign`, {
      method: 'POST', body: JSON.stringify(assignment),
    }, limitedSession.accessToken)).status).toBe(403)
    expect((await request(`/tasks/${task.id}/assign`, {
      method: 'POST', body: JSON.stringify(assignment),
    }, session.accessToken)).status).toBe(403)

    await json(await request(`/projects/${project.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId: limitedUser.id, role: 'WORKER' }),
    }, session.accessToken), 201)
    await json(await request(`/tasks/${task.id}/assign`, {
      method: 'POST', body: JSON.stringify(assignment),
    }, session.accessToken), 200)
  })
})
