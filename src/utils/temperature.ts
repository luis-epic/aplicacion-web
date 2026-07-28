import type { AppPreferences } from '../types/app'

export type TemperatureUnit = AppPreferences['temperatureUnit']

function convertFromCelsius(value: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? (value * 9) / 5 + 32 : value
}

function formatValue(value: number, unit: TemperatureUnit): string {
  return new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(
    convertFromCelsius(value, unit),
  )
}

export function formatTemperature(value: number, unit: TemperatureUnit): string {
  return `${formatValue(value, unit)} °${unit === 'fahrenheit' ? 'F' : 'C'}`
}

export function formatTemperatureRange(
  minimum: number,
  maximum: number,
  unit: TemperatureUnit,
): string {
  const symbol = unit === 'fahrenheit' ? 'F' : 'C'
  return `${formatValue(minimum, unit)}–${formatValue(maximum, unit)} °${symbol}`
}

export function formatTemperatureText(text: string, unit: TemperatureUnit): string {
  if (unit === 'celsius') return text

  return text.replace(/(-?\d+(?:[.,]\d+)?)\s*°C/g, (_match, rawValue: string) => {
    const value = Number(rawValue.replace(',', '.'))
    return Number.isFinite(value) ? formatTemperature(value, unit) : _match
  })
}
