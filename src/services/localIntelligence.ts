import { parseSpokenOuting, type SpeechDraftResult } from './speechPlanner'
import type { OutingDraft } from '../types/app'
import { getForecastDateRange, isDateWithinForecastRange } from '../utils/dates'

export type LocalAiAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'unsupported'

export interface SmartInterpretationResult extends SpeechDraftResult {
  source: 'local-ai' | 'rules'
  availability: LocalAiAvailability
  note: string
}

interface DownloadProgressEventLike {
  loaded: number
}

interface ModelMonitorLike {
  addEventListener: (
    type: 'downloadprogress',
    listener: (event: DownloadProgressEventLike) => void,
  ) => void
}

interface LanguageModelSessionLike {
  prompt: (input: string, options?: { signal?: AbortSignal }) => Promise<string>
  destroy?: () => void
}

interface LanguageModelFactoryLike {
  availability: () => Promise<Exclude<LocalAiAvailability, 'unsupported'>>
  create: (options?: {
    monitor?: (monitor: ModelMonitorLike) => void
  }) => Promise<LanguageModelSessionLike>
}

type AiGlobal = typeof globalThis & {
  LanguageModel?: LanguageModelFactoryLike
}

const activities: OutingDraft['activity'][] = [
  'work',
  'university',
  'gym',
  'bike',
  'errand',
  'custom',
]
const transports: OutingDraft['transport'][] = ['walking', 'public', 'car', 'bike']
const durations = ['1', '2', '4', '8', '24']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractJson(response: string): Record<string, unknown> | null {
  const start = response.indexOf('{')
  const end = response.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const parsed: unknown = JSON.parse(response.slice(start, end + 1))
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function applyStructuredResult(
  value: Record<string, unknown>,
  baseline: OutingDraft,
  now: Date,
): OutingDraft {
  const draft = { ...baseline }

  if (activities.includes(value.activity as OutingDraft['activity'])) {
    draft.activity = value.activity as OutingDraft['activity']
  }
  if (transports.includes(value.transport as OutingDraft['transport'])) {
    draft.transport = value.transport as OutingDraft['transport']
  }
  if (typeof value.duration === 'string' && durations.includes(value.duration)) {
    draft.duration = value.duration
  }
  if (typeof value.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) {
    draft.time = value.time
  }
  if (typeof value.date === 'string' && isDateWithinForecastRange(value.date, now)) {
    draft.date = value.date
  }
  if (typeof value.city === 'string' && value.city.trim().length >= 2) {
    draft.city = value.city.trim().slice(0, 80)
    draft.locationMode = 'manual'
  }

  return draft
}

function describeChanges(before: OutingDraft, after: OutingDraft): string[] {
  const changes: string[] = []
  if (before.activity !== after.activity) changes.push(`actividad: ${after.activity}`)
  if (before.transport !== after.transport) changes.push(`transporte: ${after.transport}`)
  if (before.duration !== after.duration) changes.push(`duración: ${after.duration} h`)
  if (before.time !== after.time) changes.push(`hora: ${after.time}`)
  if (before.date !== after.date) changes.push(`fecha: ${after.date}`)
  if (before.city !== after.city || before.locationMode !== after.locationMode) {
    changes.push(`ciudad: ${after.city}`)
  }
  return changes
}

function rulesFallback(
  text: string,
  currentDraft: OutingDraft,
  now: Date,
  availability: LocalAiAvailability,
  note: string,
): SmartInterpretationResult {
  const result = parseSpokenOuting(text, currentDraft, now)
  return { ...result, source: 'rules', availability, note }
}

export async function getLocalAiAvailability(): Promise<LocalAiAvailability> {
  const factory = (globalThis as AiGlobal).LanguageModel
  if (!factory) return 'unsupported'

  try {
    return await factory.availability()
  } catch {
    return 'unavailable'
  }
}

export async function interpretOutingText(
  text: string,
  currentDraft: OutingDraft,
  options: {
    now?: Date
    signal?: AbortSignal
    onStatus?: (message: string) => void
  } = {},
): Promise<SmartInterpretationResult> {
  const cleanText = text.trim()
  const now = options.now ?? new Date()
  if (cleanText.length < 3) {
    return rulesFallback(
      cleanText,
      currentDraft,
      now,
      'unavailable',
      'Escribe una descripción más completa para interpretarla.',
    )
  }

  const factory = (globalThis as AiGlobal).LanguageModel
  if (!factory) {
    return rulesFallback(
      cleanText,
      currentDraft,
      now,
      'unsupported',
      'La IA integrada no está disponible; usamos reglas locales.',
    )
  }

  let availability: LocalAiAvailability
  try {
    availability = await factory.availability()
  } catch {
    availability = 'unavailable'
  }

  if (availability === 'unavailable') {
    return rulesFallback(
      cleanText,
      currentDraft,
      now,
      availability,
      'El modelo local no está disponible; usamos reglas locales.',
    )
  }

  options.onStatus?.(
    availability === 'available'
      ? 'Interpretando con la IA del dispositivo…'
      : 'Preparando el modelo local. El navegador puede descargarlo…',
  )

  let session: LanguageModelSessionLike | undefined
  try {
    session = await factory.create({
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          options.onStatus?.(`Descargando modelo local: ${Math.round(event.loaded * 100)}%`)
        })
      },
    })

    const { minimum: today, maximum: lastForecastDate } = getForecastDateRange(now)
    const prompt = [
      'Interpreta una salida cotidiana. Devuelve exclusivamente un objeto JSON, sin Markdown.',
      'Campos permitidos:',
      '- activity: work | university | gym | bike | errand | custom | null',
      '- transport: walking | public | car | bike | null',
      '- duration: 1 | 2 | 4 | 8 | 24 | null (horas aproximadas)',
      '- time: HH:MM | null',
      '- date: YYYY-MM-DD | null',
      '- city: string | null',
      `La fecha de hoy es ${today}. Solo acepta fechas entre ${today} y ${lastForecastDate}. No inventes datos ausentes.`,
      `Texto del usuario: ${JSON.stringify(cleanText)}`,
    ].join('\n')
    const response = await session.prompt(prompt, { signal: options.signal })
    const structured = extractJson(response)

    if (!structured) {
      return rulesFallback(
        cleanText,
        currentDraft,
        now,
        availability,
        'La respuesta local no tenía un formato seguro; usamos reglas locales.',
      )
    }

    const baseline = parseSpokenOuting(cleanText, currentDraft, now)
    const draft = applyStructuredResult(structured, baseline.draft, now)
    const changes = describeChanges(currentDraft, draft)
    return {
      transcript: cleanText,
      draft,
      changes,
      source: 'local-ai',
      availability,
      note: 'Interpretado en el dispositivo. Revisa los campos antes de continuar.',
    }
  } catch (error) {
    const note = error instanceof DOMException && error.name === 'AbortError'
      ? 'Interpretación cancelada; usamos reglas locales.'
      : 'La IA local no pudo completar la tarea; usamos reglas locales.'
    return rulesFallback(cleanText, currentDraft, now, availability, note)
  } finally {
    session?.destroy?.()
  }
}
