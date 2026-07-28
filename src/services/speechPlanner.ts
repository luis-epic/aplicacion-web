import type { OutingDraft } from '../types/app'
import { toLocalIsoDate } from '../utils/dates'

interface SpeechAlternativeLike {
  transcript: string
}

interface SpeechResultLike {
  readonly length: number
  [index: number]: SpeechAlternativeLike
}

interface SpeechResultListLike {
  readonly length: number
  [index: number]: SpeechResultLike
}

interface SpeechResultEventLike {
  results: SpeechResultListLike
}

interface SpeechErrorEventLike {
  error: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechResultEventLike) => void) | null
  onerror: ((event: SpeechErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export interface SpeechDraftResult {
  transcript: string
  draft: OutingDraft
  changes: string[]
}

const activityLabels: Record<OutingDraft['activity'], string> = {
  work: 'Trabajo',
  university: 'Universidad',
  gym: 'Gimnasio',
  bike: 'Bicicleta',
  errand: 'Recado',
  custom: 'Otra salida',
}

const transportLabels: Record<OutingDraft['transport'], string> = {
  walking: 'A pie',
  public: 'Transporte público',
  car: 'Coche',
  bike: 'Bicicleta',
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

function closestDuration(hours: number): string {
  if (hours <= 1) return '1'
  if (hours <= 2) return '2'
  if (hours <= 6) return '4'
  if (hours <= 12) return '8'
  return '24'
}

function speechErrorMessage(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'No se concedió permiso para usar el micrófono. Puedes completar el formulario manualmente.'
    case 'audio-capture':
      return 'No encontramos un micrófono disponible.'
    case 'network':
      return 'El reconocimiento de voz no pudo conectarse. Usa el formulario manual.'
    case 'no-speech':
      return 'No detectamos voz. Acércate al micrófono e inténtalo de nuevo.'
    default:
      return 'No pudimos interpretar el dictado. Puedes continuar con el formulario.'
  }
}

export function supportsSpeechRecognition(): boolean {
  const speechWindow = window as SpeechWindow
  return Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition)
}

export function recognizeOuting(): Promise<string> {
  const speechWindow = window as SpeechWindow
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

  if (!window.isSecureContext) {
    return Promise.reject(new Error('El dictado requiere HTTPS o localhost.'))
  }
  if (!Recognition) {
    return Promise.reject(
      new Error('Este navegador no admite dictado. El formulario manual sigue disponible.'),
    )
  }

  return new Promise((resolve, reject) => {
    const recognition = new Recognition()
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }

    recognition.lang = 'es-ES'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1]
      const transcript = lastResult?.[0]?.transcript?.trim()
      if (transcript) {
        finish(() => resolve(transcript))
      } else {
        finish(() => reject(new Error('No detectamos una frase completa.')))
      }
    }
    recognition.onerror = (event) => {
      finish(() => reject(new Error(speechErrorMessage(event.error))))
    }
    recognition.onend = () => {
      finish(() => reject(new Error('El dictado terminó sin detectar una frase.')))
    }

    try {
      recognition.start()
    } catch {
      finish(() => reject(new Error('No pudimos iniciar el micrófono. Inténtalo de nuevo.')))
    }
  })
}

export function parseSpokenOuting(
  transcript: string,
  currentDraft: OutingDraft,
  now = new Date(),
): SpeechDraftResult {
  const text = normalize(transcript)
  const draft = { ...currentDraft }
  const changes: string[] = []

  const activityMatchers: Array<[OutingDraft['activity'], RegExp]> = [
    ['university', /\b(universidad|campus|clase|biblioteca)\b/],
    ['gym', /\b(gimnasio|entrenamiento|entrenar|deporte)\b/],
    ['work', /\b(trabajo|trabajar|oficina)\b/],
    ['errand', /\b(recado|compra|compras|supermercado)\b/],
    ['bike', /\b(ciclismo|paseo en bici|ruta en bici)\b/],
  ]
  const matchedActivity = activityMatchers.find(([, pattern]) => pattern.test(text))?.[0]
  if (matchedActivity) {
    draft.activity = matchedActivity
    changes.push(`Actividad: ${activityLabels[matchedActivity]}`)
  }

  const transportMatchers: Array<[OutingDraft['transport'], RegExp]> = [
    ['public', /\b(metro|autobus|bus|tren|transporte publico)\b/],
    ['car', /\b(coche|carro|auto|automovil)\b/],
    ['bike', /\b(bicicleta|bici)\b/],
    ['walking', /\b(a pie|caminando|caminar)\b/],
  ]
  const matchedTransport = transportMatchers.find(([, pattern]) => pattern.test(text))?.[0]
  if (matchedTransport) {
    draft.transport = matchedTransport
    changes.push(`Transporte: ${transportLabels[matchedTransport]}`)
  }

  const durationMatch = text.match(/\b(?:durante|por)?\s*(\d{1,2})\s*(?:hora|horas|h)\b/)
  if (durationMatch) {
    draft.duration = closestDuration(Number(durationMatch[1]))
    changes.push(`Duración aproximada: ${draft.duration} h`)
  }

  const timeMatch = text.match(/\ba las?\s+([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\b/)
  if (timeMatch) {
    draft.time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] ?? '00'}`
    changes.push(`Hora: ${draft.time}`)
  }

  if (/\bmanana\b/.test(text)) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    draft.date = toLocalIsoDate(tomorrow)
    changes.push('Fecha: mañana')
  } else if (/\bhoy\b/.test(text)) {
    draft.date = toLocalIsoDate(now)
    changes.push('Fecha: hoy')
  }

  const cityMatch = transcript.match(
    /\b(?:en|hacia)\s+([a-záéíóúüñ][a-záéíóúüñ\s-]{1,40}?)(?=\s+(?:a las?|durante|por|en (?:coche|carro|auto|bicicleta|bici|metro|autobús|bus|tren)|y)\b|$)/iu,
  )
  if (cityMatch) {
    const city = cityMatch[1].trim()
    const normalizedCity = normalize(city)
    const transportWords = /^(bicicleta|bici|coche|carro|auto|metro|autobus|bus|tren|transporte publico)$/
    if (!transportWords.test(normalizedCity)) {
      draft.locationMode = 'manual'
      draft.city = city.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('es'))
      changes.push(`Ciudad: ${draft.city}`)
    }
  }

  return { transcript, draft, changes }
}
