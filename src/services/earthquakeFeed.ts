const USGS_DAILY_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
const USGS_ORIGIN = 'https://earthquake.usgs.gov'
const MAX_FEED_EVENTS = 2_000
const MAX_EVENT_AGE_MS = 25 * 60 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000
const MAX_FEED_AGE_MS = 60 * 60 * 1000

export interface EarthquakeEvent {
  depthKm: number
  id: string
  latitude: number
  longitude: number
  magnitude: number
  occurredAt: number
  place: string
  sourceUrl: string
  tsunami: boolean
  updatedAt: number
}

export interface EarthquakeSnapshot {
  events: EarthquakeEvent[]
  generatedAt: number
  sourceLabel: string
  sourceUrl: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function parseEventUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (
      url.origin !== USGS_ORIGIN ||
      !url.pathname.startsWith('/earthquakes/eventpage/') ||
      url.username ||
      url.password
    ) return null
    return url.toString()
  } catch {
    return null
  }
}

function parseEvent(value: unknown, now: number): EarthquakeEvent | null {
  if (!isRecord(value) || !isRecord(value.properties) || !isRecord(value.geometry)) return null
  if (value.geometry.type !== 'Point' || value.properties.type !== 'earthquake') return null

  const id = value.id
  const magnitude = value.properties.mag
  const place = value.properties.place
  const occurredAt = value.properties.time
  const updatedAt = value.properties.updated
  const sourceUrl = parseEventUrl(value.properties.url)
  const coordinates = value.geometry.coordinates

  if (
    typeof id !== 'string' ||
    !/^[a-z0-9._-]{1,80}$/i.test(id) ||
    !isFiniteInRange(magnitude, -3, 10) ||
    typeof place !== 'string' ||
    !place.trim() ||
    place.length > 240 ||
    !isSafeInteger(occurredAt) ||
    occurredAt < now - MAX_EVENT_AGE_MS ||
    occurredAt > now + MAX_FUTURE_SKEW_MS ||
    !isSafeInteger(updatedAt) ||
    updatedAt < occurredAt ||
    updatedAt > now + MAX_FUTURE_SKEW_MS ||
    !sourceUrl ||
    !Array.isArray(coordinates) ||
    coordinates.length < 3 ||
    !isFiniteInRange(coordinates[0], -180, 180) ||
    !isFiniteInRange(coordinates[1], -90, 90) ||
    !isFiniteInRange(coordinates[2], -20, 1_000)
  ) return null

  return {
    depthKm: coordinates[2],
    id,
    latitude: coordinates[1],
    longitude: coordinates[0],
    magnitude,
    occurredAt,
    place: place.trim(),
    sourceUrl,
    tsunami: value.properties.tsunami === 1,
    updatedAt,
  }
}

function parseSnapshot(data: unknown): EarthquakeSnapshot {
  if (!isRecord(data) || data.type !== 'FeatureCollection' || !isRecord(data.metadata)) {
    throw new Error('La fuente sísmica devolvió una respuesta no válida.')
  }

  const now = Date.now()
  const generatedAt = data.metadata.generated
  if (
    !isSafeInteger(generatedAt) ||
    generatedAt < now - MAX_FEED_AGE_MS ||
    generatedAt > now + MAX_FUTURE_SKEW_MS ||
    !Array.isArray(data.features) ||
    data.features.length > MAX_FEED_EVENTS
  ) {
    throw new Error('La fuente sísmica no contiene observaciones recientes válidas.')
  }

  const parsedEvents = data.features.map((feature) => parseEvent(feature, now))
  const events = parsedEvents
    .filter((event): event is EarthquakeEvent => event !== null)
    .sort((first, second) => second.occurredAt - first.occurredAt)

  if (data.features.length > 0 && events.length / data.features.length < 0.75) {
    throw new Error('La fuente sísmica cambió de formato o contiene demasiados eventos no válidos.')
  }

  return {
    events,
    generatedAt,
    sourceLabel: 'USGS Earthquake Hazards Program',
    sourceUrl: 'https://earthquake.usgs.gov/earthquakes/feed/',
  }
}

export async function fetchEarthquakeSnapshot(signal?: AbortSignal): Promise<EarthquakeSnapshot> {
  let response: Response
  try {
    response = await fetch(USGS_DAILY_FEED, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/geo+json, application/json' },
      referrerPolicy: 'no-referrer',
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('No pudimos conectar con la fuente sísmica. Revisa tu conexión.')
  }

  if (!response.ok) throw new Error('La información sísmica no está disponible en este momento.')

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('La fuente sísmica devolvió una respuesta no válida.')
  }

  return parseSnapshot(data)
}
