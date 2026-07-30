import {
  acknowledgePublication,
  fetchTask,
  isAuthenticationError,
  isRetryableApiError,
  transitionTask,
} from './fieldApi'
import {
  loadCachedPublications,
  loadCachedTasks,
  loadEnterpriseOutbox,
  removeEnterpriseOutboxEntry,
  saveCachedPublication,
  saveCachedTask,
  saveEnterpriseOutboxEntry,
} from './enterpriseStorage'
import type { EnterpriseOutboxEntry } from '../types/enterprise'

const MAX_ATTEMPTS = 6
const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 120_000
const activeSync = new Map<string, Promise<void>>()

function failureMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'La sincronización agotó el tiempo de espera.'
  }
  return error instanceof Error ? error.message : 'No pudimos sincronizar la acción.'
}

function nextBackoff(attempts: number): number {
  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS)
  return Math.round(exponential * (0.8 + Math.random() * 0.4))
}

async function markTerminal(ownerId: string, entry: EnterpriseOutboxEntry, message: string): Promise<void> {
  await saveEnterpriseOutboxEntry({
    ...entry,
    attempts: entry.attempts + 1,
    lastError: message,
    terminal: true,
    nextAttemptAt: new Date().toISOString(),
  })

  const operation = entry.operation
  if (operation.kind === 'task.transition') {
    const task = (await loadCachedTasks(ownerId)).find((item) => item.id === operation.taskId)
    if (task) await saveCachedTask(ownerId, { ...task, pendingTransition: undefined, syncError: message })
  } else if (operation.kind === 'publication.acknowledge') {
    const publication = (await loadCachedPublications(ownerId)).find((item) => item.id === operation.publicationId)
    if (publication) {
      await saveCachedPublication(ownerId, {
        ...publication,
        acknowledgedAt: undefined,
        pendingAcknowledgement: false,
        acknowledgementError: message,
      })
    }
  }
}

async function executeEntry(ownerId: string, entry: EnterpriseOutboxEntry): Promise<void> {
  const operation = entry.operation
  if (operation.kind === 'publication.acknowledge') {
    const acknowledgement = await acknowledgePublication(operation.publicationId)
    const publication = (await loadCachedPublications(ownerId)).find((item) => item.id === operation.publicationId)
    if (publication) {
      await saveCachedPublication(ownerId, {
        ...publication,
        acknowledgedAt: acknowledgement.readAt,
        pendingAcknowledgement: false,
        acknowledgementError: undefined,
      })
    }
    return
  }

  if (operation.kind === 'task.transition') {
    const task = await transitionTask(operation.taskId, operation.transition)
    await saveCachedTask(ownerId, { ...task, pendingTransition: undefined, syncError: undefined })
  }
}

function transitionTarget(transition: Extract<EnterpriseOutboxEntry['operation'], { kind: 'task.transition' }>['transition']) {
  if (transition === 'start') return 'IN_PROGRESS' as const
  if (transition === 'block') return 'BLOCKED' as const
  if (transition === 'submit-review') return 'IN_REVIEW' as const
  return 'COMPLETED' as const
}

async function reconcileAppliedTransition(ownerId: string, entry: EnterpriseOutboxEntry): Promise<boolean> {
  const operation = entry.operation
  if (operation.kind !== 'task.transition') return false
  try {
    const remote = await fetchTask(operation.taskId)
    if (remote.status !== transitionTarget(operation.transition)) {
      await saveCachedTask(ownerId, {
        ...remote,
        pendingTransition: operation.transition,
        syncError: undefined,
      })
      return false
    }
    await saveCachedTask(ownerId, { ...remote, pendingTransition: undefined, syncError: undefined })
    await removeEnterpriseOutboxEntry(entry.localId)
    return true
  } catch {
    return false
  }
}

async function runSync(ownerId: string, force: boolean): Promise<void> {
  if (!navigator.onLine) return
  const entries = await loadEnterpriseOutbox(ownerId)
  for (const entry of entries) {
    if (entry.terminal) continue
    if (!force && Date.parse(entry.nextAttemptAt) > Date.now()) continue
    try {
      await executeEntry(ownerId, entry)
      await removeEnterpriseOutboxEntry(entry.localId)
    } catch (error) {
      if (isAuthenticationError(error)) throw error
      if (await reconcileAppliedTransition(ownerId, entry)) continue
      const attempts = entry.attempts + 1
      const message = failureMessage(error)
      if (!isRetryableApiError(error) || attempts >= MAX_ATTEMPTS) {
        await markTerminal(ownerId, entry, attempts >= MAX_ATTEMPTS
          ? `${message} Reintentos automáticos agotados.`
          : message)
        continue
      }
      await saveEnterpriseOutboxEntry({
        ...entry,
        attempts,
        lastError: message,
        nextAttemptAt: new Date(Date.now() + nextBackoff(attempts)).toISOString(),
      })
    }
  }
}

export function syncEnterpriseOperations(ownerId: string, force = false): Promise<void> {
  const existing = activeSync.get(ownerId)
  if (existing) return existing
  const operation = runSync(ownerId, force).finally(() => activeSync.delete(ownerId))
  activeSync.set(ownerId, operation)
  return operation
}

export async function retryFailedEnterpriseOperations(ownerId: string): Promise<void> {
  const entries = await loadEnterpriseOutbox(ownerId)
  await Promise.all(entries.filter((entry) => entry.terminal).map((entry) => saveEnterpriseOutboxEntry({
    ...entry,
    attempts: 0,
    terminal: false,
    lastError: undefined,
    nextAttemptAt: new Date().toISOString(),
  })))
  await syncEnterpriseOperations(ownerId, true)
}

export function waitForEnterpriseSync(ownerId: string): Promise<void> {
  return activeSync.get(ownerId) ?? Promise.resolve()
}
