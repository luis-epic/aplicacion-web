import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? 'http://api:4000/api/v1').replace(/\/$/, '')
const REQUEST_TIMEOUT_MS = 15_000
const requestHeaderDenylist = new Set(['connection', 'content-length', 'host', 'transfer-encoding'])
const responseHeaderDenylist = new Set(['connection', 'content-encoding', 'content-length', 'transfer-encoding'])

type RouteContext = { params: Promise<{ path: string[] }> }

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params
  if (path.length === 1 && path[0] === 'metrics') return new Response(null, { status: 404 })
  const sourceUrl = new URL(request.url)
  const targetPath = path.map((segment) => encodeURIComponent(segment)).join('/')
  const targetUrl = `${API_INTERNAL_URL}/${targetPath}${sourceUrl.search}`
  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!requestHeaderDenylist.has(key.toLowerCase())) headers.set(key, value)
  })
  headers.set('x-forwarded-host', sourceUrl.host)
  headers.set('x-forwarded-proto', sourceUrl.protocol.slice(0, -1))

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer()
  const upstream = await fetch(targetUrl, {
    body,
    cache: 'no-store',
    headers,
    method: request.method,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!responseHeaderDenylist.has(key.toLowerCase())) responseHeaders.append(key, value)
  })
  return new Response(await upstream.arrayBuffer(), {
    headers: responseHeaders,
    status: upstream.status,
    statusText: upstream.statusText,
  })
}

export const DELETE = proxy
export const GET = proxy
export const HEAD = proxy
export const OPTIONS = proxy
export const PATCH = proxy
export const POST = proxy
export const PUT = proxy
