const RAINVIEWER_METADATA_ENDPOINT = 'https://api.rainviewer.com/public/weather-maps.json'
const ALLOWED_TILE_ORIGIN = 'https://tilecache.rainviewer.com'
const MAX_VISIBLE_FRAMES = 7
const MAX_METADATA_AGE_SECONDS = 6 * 60 * 60
const MAX_FUTURE_SKEW_SECONDS = 15 * 60
const MAX_FRAME_AGE_SECONDS = 3 * 60 * 60

export interface RainFrame {
  path: string
  time: number
}

export interface RainMapSnapshot {
  attributionLabel: string
  attributionUrl: string
  frames: RainFrame[]
  generatedAt: number
  tileHost: string
}

export interface RainMapProvider {
  loadSnapshot: (signal?: AbortSignal) => Promise<RainMapSnapshot>
  tileUrl: (snapshot: RainMapSnapshot, frame: RainFrame) => string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTileHost(value: unknown): string {
  if (typeof value !== 'string') throw new Error('El proveedor de radar devolvió un host no válido.')

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('El proveedor de radar devolvió un host no válido.')
  }

  if (
    url.origin !== ALLOWED_TILE_ORIGIN ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error('El proveedor de radar devolvió un host no permitido.')
  }

  return ALLOWED_TILE_ORIGIN
}

function parseFrames(value: unknown, generatedAt: number): RainFrame[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .flatMap((candidate) => {
      const time = candidate.time
      const path = candidate.path
      if (
        typeof time !== 'number' ||
        !Number.isSafeInteger(time) ||
        time < generatedAt - MAX_FRAME_AGE_SECONDS ||
        time > generatedAt + MAX_FUTURE_SKEW_SECONDS ||
        typeof path !== 'string' ||
        !/^\/v2\/radar\/[a-f0-9]+$/i.test(path)
      ) {
        return []
      }
      return [{ path, time }]
    })
    .sort((first, second) => first.time - second.time)
    .slice(-MAX_VISIBLE_FRAMES)
}

async function loadRainViewerSnapshot(signal?: AbortSignal): Promise<RainMapSnapshot> {
  let response: Response

  try {
    response = await fetch(RAINVIEWER_METADATA_ENDPOINT, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      referrerPolicy: 'no-referrer',
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('No pudimos conectar con el radar. Revisa tu conexión.')
  }

  if (!response.ok) {
    throw new Error('El radar no está disponible en este momento.')
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('El radar devolvió una respuesta no válida.')
  }

  if (!isRecord(data)) throw new Error('El radar devolvió una respuesta no válida.')
  const generatedAt = data.generated
  const now = Math.floor(Date.now() / 1000)
  if (
    typeof generatedAt !== 'number' ||
    !Number.isSafeInteger(generatedAt) ||
    generatedAt < now - MAX_METADATA_AGE_SECONDS ||
    generatedAt > now + MAX_FUTURE_SKEW_SECONDS
  ) {
    throw new Error('El radar no tiene observaciones recientes válidas.')
  }

  const radar = isRecord(data.radar) ? data.radar : undefined
  const frames = parseFrames(radar?.past, generatedAt)
  if (!frames.length) {
    throw new Error('El radar devolvió información incompleta.')
  }

  return {
    attributionLabel: 'Radar: RainViewer',
    attributionUrl: 'https://www.rainviewer.com/',
    frames,
    generatedAt,
    tileHost: parseTileHost(data.host),
  }
}

function buildRainViewerTileUrl(snapshot: RainMapSnapshot, frame: RainFrame): string {
  if (!snapshot.frames.some((candidate) => candidate.path === frame.path)) {
    throw new Error('La imagen de radar seleccionada ya no está disponible.')
  }

  return `${snapshot.tileHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`
}

export const rainMapProvider: RainMapProvider = {
  loadSnapshot: loadRainViewerSnapshot,
  tileUrl: buildRainViewerTileUrl,
}
