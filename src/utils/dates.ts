export const FORECAST_DAY_COUNT = 16

export function toLocalIsoDate(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

export function getForecastDateRange(now = new Date()): {
  minimum: string
  maximum: string
} {
  const lastDay = new Date(now)
  lastDay.setDate(lastDay.getDate() + FORECAST_DAY_COUNT - 1)

  return {
    minimum: toLocalIsoDate(now),
    maximum: toLocalIsoDate(lastDay),
  }
}

export function isDateWithinForecastRange(value: string, now = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(year, month - 1, day)
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return false
  }

  const { minimum, maximum } = getForecastDateRange(now)
  return value >= minimum && value <= maximum
}
