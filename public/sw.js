/* global self, caches, fetch */
const CACHE_PREFIX = 'opeconca-field-'
const HISTORICAL_CACHE_PREFIXES = ['salida-lista-']
const CACHE_NAME = `${CACHE_PREFIX}shell-v5`
const SHELL_PATHS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.svg',
  './icon-512.svg',
  './maskable-icon.svg',
]

function scopedUrl(path) {
  return new URL(path, self.registration.scope).toString()
}

async function fetchRequired(url) {
  const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' })
  if (!response.ok) throw new Error(`No se pudo precachear ${url}: ${response.status}`)
  return response
}

async function precacheApplication() {
  const indexUrl = scopedUrl('./index.html')
  const indexResponse = await fetchRequired(indexUrl)
  const html = await indexResponse.clone().text()
  const discoveredAssets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], self.registration.scope))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.toString())
  const urls = [...new Set([...SHELL_PATHS.map(scopedUrl), ...discoveredAssets])]

  const responses = await Promise.all(urls.map(async (url) => [url, await fetchRequired(url)]))
  const cache = await caches.open(CACHE_NAME)
  try {
    await Promise.all(responses.map(([url, response]) => cache.put(url, response)))
  } catch (error) {
    await caches.delete(CACHE_NAME)
    throw error
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheApplication())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => (
            (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) ||
            HISTORICAL_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
          ))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  if (event.data?.type === 'PURGE_PRIVATE_CACHES') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => HISTORICAL_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
        .map((key) => caches.delete(key)),
    )))
  }
})

function isPrivateRequest(request, url) {
  return (
    url.pathname.includes('/api/') ||
    url.pathname.startsWith('/media/publications/') ||
    url.pathname.endsWith('/sw.js') ||
    request.headers.has('authorization') ||
    request.cache === 'no-store'
  )
}

function canStoreResponse(response) {
  const cacheControl = response.headers.get('cache-control') ?? ''
  return response.ok && !/private|no-store/i.test(cacheControl)
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || isPrivateRequest(request, url)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME)
        return await cache.match(scopedUrl('./index.html')) ?? Response.error()
      }),
    )
    return
  }

  if (!['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) return
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkResponse = fetch(request).then((response) => {
        if (canStoreResponse(response)) {
          const copy = response.clone()
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)))
        }
        return response
      }).catch(() => cachedResponse ?? Response.error())
      return cachedResponse ?? networkResponse
    }),
  )
})
