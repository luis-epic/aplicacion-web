import type { ResolvedLocation, WeatherContext } from '../types/app'

const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'sunset',
].join(',')

interface GeocodingResult {
  name?: unknown
  latitude?: unknown
  longitude?: unknown
  country?: unknown
  admin1?: unknown
}

interface GeocodingResponse {
  results?: GeocodingResult[]
}

interface DailyForecast {
  time?: unknown
  weather_code?: unknown
  temperature_2m_max?: unknown
  temperature_2m_min?: unknown
  precipitation_probability_max?: unknown
  wind_speed_10m_max?: unknown
  sunset?: unknown
}

interface ForecastResponse {
  daily?: DailyForecast
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function firstNumber(value: unknown): number | undefined {
  return Array.isArray(value) && isNumber(value[0]) ? value[0] : undefined
}

function firstString(value: unknown): string | undefined {
  return Array.isArray(value) && isString(value[0]) ? value[0] : undefined
}

async function fetchJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
  let response: Response

  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('No pudimos conectar con el servicio meteorológico. Revisa tu conexión.')
  }

  if (!response.ok) {
    if (response.status === 400) {
      throw new Error('No hay un pronóstico disponible para esa fecha o ubicación.')
    }
    throw new Error('El servicio meteorológico no está disponible en este momento.')
  }

  return response.json() as Promise<T>
}

function weatherCondition(code: number): string {
  if (code === 0) return 'Despejado'
  if (code === 1) return 'Mayormente despejado'
  if (code === 2) return 'Parcialmente nublado'
  if (code === 3) return 'Nublado'
  if (code === 45 || code === 48) return 'Niebla'
  if (code >= 51 && code <= 57) return 'Llovizna'
  if (code >= 61 && code <= 67) return 'Lluvia'
  if (code >= 71 && code <= 77) return 'Nieve'
  if (code >= 80 && code <= 82) return 'Chubascos'
  if (code >= 85 && code <= 86) return 'Chubascos de nieve'
  if (code >= 95) return 'Tormenta'
  return 'Condiciones variables'
}

function locationDetail(result: GeocodingResult): string | undefined {
  const admin = isString(result.admin1) ? result.admin1 : undefined
  const country = isString(result.country) ? result.country : undefined
  if (admin && country && admin !== country) return `${admin}, ${country}`
  return admin ?? country
}

export async function searchCity(
  query: string,
  signal?: AbortSignal,
): Promise<ResolvedLocation> {
  const cleanQuery = query.trim()
  if (cleanQuery.length < 2) {
    throw new Error('Escribe al menos dos caracteres para buscar una ciudad.')
  }

  const url = new URL(GEOCODING_ENDPOINT)
  url.searchParams.set('name', cleanQuery)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'es')
  url.searchParams.set('format', 'json')

  const data = await fetchJson<GeocodingResponse>(url, signal)
  const result = data.results?.[0]

  if (
    !result ||
    !isString(result.name) ||
    !isNumber(result.latitude) ||
    !isNumber(result.longitude)
  ) {
    throw new Error(`No encontramos una ciudad llamada “${cleanQuery}”.`)
  }

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    name: result.name,
    detail: locationDetail(result),
    source: 'search',
  }
}

export async function fetchForecast(
  location: ResolvedLocation,
  date: string,
  signal?: AbortSignal,
): Promise<WeatherContext> {
  const url = new URL(FORECAST_ENDPOINT)
  url.searchParams.set('latitude', String(location.latitude))
  url.searchParams.set('longitude', String(location.longitude))
  url.searchParams.set('daily', DAILY_FIELDS)
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('start_date', date)
  url.searchParams.set('end_date', date)

  const data = await fetchJson<ForecastResponse>(url, signal)
  const daily = data.daily
  const forecastDate = firstString(daily?.time)
  const code = firstNumber(daily?.weather_code)
  const temperatureMax = firstNumber(daily?.temperature_2m_max)
  const temperatureMin = firstNumber(daily?.temperature_2m_min)
  const rainProbability = firstNumber(daily?.precipitation_probability_max)
  const windSpeed = firstNumber(daily?.wind_speed_10m_max)
  const sunsetDateTime = firstString(daily?.sunset)

  if (
    forecastDate !== date ||
    code === undefined ||
    temperatureMax === undefined ||
    temperatureMin === undefined ||
    rainProbability === undefined ||
    windSpeed === undefined ||
    !sunsetDateTime
  ) {
    throw new Error('El pronóstico recibido está incompleto. Generaremos una lista sin clima.')
  }

  return {
    temperature: Math.round((temperatureMax + temperatureMin) / 2),
    temperatureMax: Math.round(temperatureMax),
    temperatureMin: Math.round(temperatureMin),
    rainProbability: Math.round(rainProbability),
    windSpeed: Math.round(windSpeed),
    condition: weatherCondition(code),
    sunset: sunsetDateTime.split('T')[1]?.slice(0, 5) ?? '--:--',
    source: 'live',
  }
}
