import type { ResolvedLocation } from '../types/app'

const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const MAX_FORECAST_HOURS = 12
const MAX_PRECIPITATION_MM = 500

export interface CurrentPrecipitation {
  time: string
  precipitation: number
  rain: number
  showers: number
  weatherCode: number
}

export interface HourlyPrecipitation {
  time: string
  probability: number
  precipitation: number
  rain: number
  showers: number
  weatherCode: number
}

export interface PrecipitationForecast {
  current: CurrentPrecipitation
  fetchedAt: number
  hourly: HourlyPrecipitation[]
  timezone: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`El pronóstico devolvió un valor no válido para ${label}.`)
  }
  return value
}

function parseWeatherCode(value: unknown): number {
  const code = parseNumber(value, 'el estado del cielo', 0, 99)
  if (!Number.isInteger(code)) throw new Error('El pronóstico devolvió un código meteorológico no válido.')
  return code
}

function parseLocalTime(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error('El pronóstico devolvió una hora no válida.')
  }
  return value
}

function parseNumericArray(
  value: unknown,
  label: string,
  length: number,
  minimum: number,
  maximum: number,
): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`El pronóstico devolvió datos incompletos para ${label}.`)
  }
  return value.map((item) => parseNumber(item, label, minimum, maximum))
}

function parseForecast(data: unknown): PrecipitationForecast {
  if (!isRecord(data) || !isRecord(data.current) || !isRecord(data.hourly)) {
    throw new Error('El pronóstico devolvió una respuesta no válida.')
  }

  const timezone = data.timezone
  if (typeof timezone !== 'string' || !timezone.trim() || timezone.length > 100) {
    throw new Error('El pronóstico devolvió una zona horaria no válida.')
  }

  const timesRaw = data.hourly.time
  if (!Array.isArray(timesRaw) || timesRaw.length < 1 || timesRaw.length > MAX_FORECAST_HOURS) {
    throw new Error('El pronóstico horario está incompleto.')
  }
  const times = timesRaw.map(parseLocalTime)
  const timestamps = times.map((time) => Date.parse(time))
  if (timestamps.some((time, index) => index > 0 && time <= timestamps[index - 1])) {
    throw new Error('Las horas del pronóstico no están ordenadas.')
  }

  const length = times.length
  const probabilities = parseNumericArray(
    data.hourly.precipitation_probability,
    'la probabilidad de lluvia',
    length,
    0,
    100,
  )
  const precipitation = parseNumericArray(
    data.hourly.precipitation,
    'la precipitación',
    length,
    0,
    MAX_PRECIPITATION_MM,
  )
  const rain = parseNumericArray(data.hourly.rain, 'la lluvia', length, 0, MAX_PRECIPITATION_MM)
  const showers = parseNumericArray(data.hourly.showers, 'los chubascos', length, 0, MAX_PRECIPITATION_MM)
  const weatherCodes = parseNumericArray(data.hourly.weather_code, 'el estado del cielo', length, 0, 99)

  return {
    current: {
      time: parseLocalTime(data.current.time),
      precipitation: parseNumber(data.current.precipitation, 'la precipitación actual', 0, MAX_PRECIPITATION_MM),
      rain: parseNumber(data.current.rain, 'la lluvia actual', 0, MAX_PRECIPITATION_MM),
      showers: parseNumber(data.current.showers, 'los chubascos actuales', 0, MAX_PRECIPITATION_MM),
      weatherCode: parseWeatherCode(data.current.weather_code),
    },
    fetchedAt: Date.now(),
    hourly: times.map((time, index) => ({
      time,
      probability: probabilities[index],
      precipitation: precipitation[index],
      rain: rain[index],
      showers: showers[index],
      weatherCode: parseWeatherCode(weatherCodes[index]),
    })),
    timezone,
  }
}

export async function fetchPrecipitationForecast(
  location: ResolvedLocation,
  signal?: AbortSignal,
): Promise<PrecipitationForecast> {
  const url = new URL(FORECAST_ENDPOINT)
  url.searchParams.set('latitude', String(location.latitude))
  url.searchParams.set('longitude', String(location.longitude))
  url.searchParams.set('current', 'precipitation,rain,showers,weather_code')
  url.searchParams.set('hourly', 'precipitation_probability,precipitation,rain,showers,weather_code')
  url.searchParams.set('forecast_hours', String(MAX_FORECAST_HOURS))
  url.searchParams.set('timezone', 'auto')

  let response: Response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      referrerPolicy: 'no-referrer',
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('No pudimos conectar con el pronóstico. Revisa tu conexión.')
  }

  if (!response.ok) throw new Error('El pronóstico de lluvia no está disponible en este momento.')

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('El pronóstico devolvió una respuesta no válida.')
  }

  return parseForecast(data)
}
