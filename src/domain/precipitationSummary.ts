import type { HourlyPrecipitation, PrecipitationForecast } from '../services/precipitationForecast'

const RAIN_PROBABILITY_THRESHOLD = 50
const MEASURABLE_PRECIPITATION_MM = 0.1
const SUMMARY_HOURS = 6

export interface PrecipitationSummary {
  currentPrecipitation: number
  hasCurrentPrecipitation: boolean
  maximumProbability: number
  nextRain?: HourlyPrecipitation
  peakHour?: HourlyPrecipitation
  projectedAccumulation: number
}

function roundTenths(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

export function summarizePrecipitation(forecast: PrecipitationForecast): PrecipitationSummary {
  const nextHours = forecast.hourly.slice(0, SUMMARY_HOURS)
  if (!nextHours.length) throw new Error('No hay horas suficientes para resumir el pronóstico.')

  const peakHour = nextHours.reduce((peak, hour) => {
    if (hour.precipitation > peak.precipitation) return hour
    if (hour.precipitation === peak.precipitation && hour.probability > peak.probability) return hour
    return peak
  })

  return {
    currentPrecipitation: roundTenths(forecast.current.precipitation),
    hasCurrentPrecipitation: forecast.current.precipitation >= MEASURABLE_PRECIPITATION_MM,
    maximumProbability: Math.round(Math.max(...nextHours.map((hour) => hour.probability))),
    nextRain: forecast.hourly.find((hour) => (
      hour.probability >= RAIN_PROBABILITY_THRESHOLD ||
      hour.precipitation >= MEASURABLE_PRECIPITATION_MM
    )),
    peakHour: peakHour.precipitation >= MEASURABLE_PRECIPITATION_MM ? peakHour : undefined,
    projectedAccumulation: roundTenths(
      nextHours.reduce((total, hour) => total + hour.precipitation, 0),
    ),
  }
}
