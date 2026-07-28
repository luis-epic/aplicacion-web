import { activityLabels, transportLabels } from '../data/mockData'
import type {
  AppPreferences,
  ChecklistItem,
  NotificationPermissionState,
  OutingDraft,
  ResolvedLocation,
  ShareOutcome,
  WeatherContext,
} from '../types/app'
import { formatTemperatureRange } from '../utils/temperature'

interface ChecklistTextInput {
  draft: OutingDraft
  items: ChecklistItem[]
  location?: ResolvedLocation
  temperatureUnit: AppPreferences['temperatureUnit']
  weather?: WeatherContext
}

export interface EarthquakeNotificationInput {
  distanceKm: number
  eventId: string
  magnitude: number
  place: string
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.requestPermission()
}

export function showChecklistNotification(incompleteCount: number): boolean {
  if (getNotificationPermission() !== 'granted') return false

  try {
    new Notification('Tu lista aún tiene pendientes', {
      body: `Te faltan ${incompleteCount} ${incompleteCount === 1 ? 'objeto' : 'objetos'} antes de salir.`,
      icon: new URL('favicon.svg', document.baseURI).toString(),
      tag: 'salida-lista-pendientes',
    })
    return true
  } catch {
    return false
  }
}

export function showEarthquakeNotification({
  distanceKm,
  eventId,
  magnitude,
  place,
}: EarthquakeNotificationInput): boolean {
  if (getNotificationPermission() !== 'granted') return false

  try {
    const notification = new Notification(`Nuevo reporte de USGS · M ${magnitude.toFixed(1)}`, {
      body: `${place}, a unos ${distanceKm} km. Evento ya detectado y publicado; no es alerta temprana.`,
      icon: new URL('favicon.svg', document.baseURI).toString(),
      tag: `salida-lista-sismo-${eventId}`,
    })
    notification.onclick = () => {
      window.focus()
      window.location.hash = '#/sismos-cercanos'
      notification.close()
    }
    return true
  } catch {
    return false
  }
}

export function buildChecklistText({
  draft,
  items,
  location,
  temperatureUnit,
  weather,
}: ChecklistTextInput): string {
  const locationLabel = location
    ? [location.name, location.detail].filter(Boolean).join(' · ')
    : draft.locationMode === 'manual'
      ? draft.city.trim() || 'Ubicación no indicada'
      : 'Ubicación no disponible'
  const weatherLabel = weather
    ? `${weather.condition}, ${formatTemperatureRange(weather.temperatureMin, weather.temperatureMax, temperatureUnit)}`
    : 'Clima no disponible'
  const itemLines = items.map((item) => `${item.completed ? '✓' : '○'} ${item.label}`)

  return [
    'OPECONCA Campo',
    `${activityLabels[draft.activity]} · ${draft.date} a las ${draft.time}`,
    `${transportLabels[draft.transport]} · ${locationLabel}`,
    weatherLabel,
    '',
    ...itemLines,
  ].join('\n')
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.className = 'clipboard-fallback'
  textarea.value = text
  textarea.setAttribute('readonly', '')
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('No pudimos copiar la lista. Selecciona el contenido manualmente.')
}

export async function shareOrCopyChecklist(text: string): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Mi lista de salida', text })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }

  await copyText(text)
  return 'copied'
}

export function signalChecklist(incompleteCount: number, importantCount: number): boolean {
  if (!navigator.vibrate) return false
  if (!incompleteCount) return navigator.vibrate(120)
  if (importantCount) return navigator.vibrate([180, 90, 180])
  return navigator.vibrate([100, 70, 100])
}
