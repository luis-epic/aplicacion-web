/* global self, caches, fetch */
const CACHE_PREFIX = 'salida-lista-'
const CACHE_NAME = `${CACHE_PREFIX}shell-v3`
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

async function cacheResponse(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' })
    if (response.ok) await cache.put(url, response)
  } catch {
    // A single optional resource must not prevent service worker installation.
  }
}

async function precacheApplication() {
  const cache = await caches.open(CACHE_NAME)
  await Promise.all(SHELL_PATHS.map((path) => cacheResponse(cache, scopedUrl(path))))

  try {
    const indexUrl = scopedUrl('./index.html')
    const indexResponse = await fetch(indexUrl, { cache: 'reload' })
    if (!indexResponse.ok) return
    const html = await indexResponse.clone().text()
    await cache.put(indexUrl, indexResponse)

    const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], self.registration.scope))
      .filter((url) => url.origin === self.location.origin)
      .map((url) => url.toString())

    await Promise.all(assetUrls.map((url) => cacheResponse(cache, url)))
  } catch {
    // The static shell paths above still provide an offline fallback.
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
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(scopedUrl('./index.html'), copy))
          }
          return response
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME)
          return (
            await cache.match(scopedUrl('./index.html')) ??
            await cache.match(scopedUrl('./')) ??
            Response.error()
          )
        }),
    )
    return
  }

  if (url.pathname.endsWith('/sw.js')) return

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkResponse = fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
          }
          return response
        })
        .catch(() => cachedResponse ?? Response.error())

      return cachedResponse ?? networkResponse
    }),
  )
})
