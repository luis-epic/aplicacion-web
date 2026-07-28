import { createFieldReport, submitFieldReport } from './fieldApi'
import {
  enqueueReport,
  loadFieldReports,
  loadOutbox,
  removeOutboxEntry,
  saveFieldReport,
  saveOutboxEntry,
} from './fieldReportStorage'
import type { LocalFieldReport } from '../types/fieldReports'

const MAX_ATTEMPTS = 5
const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 60_000

let activeSync: Promise<void> | null = null

function failureMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'La sincronización agotó el tiempo de espera.'
  }
  return error instanceof Error ? error.message : 'No pudimos sincronizar el reporte.'
}

function nextBackoff(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS)
}

async function runSync(ownerId: string, force: boolean): Promise<void> {
  if (!navigator.onLine) return
  const entries = await loadOutbox(ownerId)
  const reports = await loadFieldReports(ownerId)
  const byId = new Map(reports.map((report) => [report.localId, report]))

  for (const entry of entries) {
    if (!force && new Date(entry.nextAttemptAt).getTime() > Date.now()) continue
    const report = byId.get(entry.localId)
    if (!report) {
      await removeOutboxEntry(entry.localId)
      continue
    }

    await saveFieldReport({
      ...report,
      syncState: 'syncing',
      error: undefined,
      updatedAt: new Date().toISOString(),
    })

    try {
      let serverReport = await createFieldReport(report.payload)
      if (report.submitAfterCreate && serverReport.status === 'DRAFT') {
        serverReport = await submitFieldReport(serverReport.id)
      }
      await saveFieldReport({
        ...report,
        syncState: 'synced',
        serverReport,
        error: undefined,
        updatedAt: new Date().toISOString(),
      })
      await removeOutboxEntry(entry.localId)
    } catch (error) {
      const attempts = entry.attempts + 1
      const terminal = attempts >= MAX_ATTEMPTS
      await saveFieldReport({
        ...report,
        syncState: terminal ? 'error' : 'pending',
        error: terminal
          ? `${failureMessage(error)} Reintentos automáticos agotados.`
          : failureMessage(error),
        updatedAt: new Date().toISOString(),
      })
      if (terminal) {
        await removeOutboxEntry(entry.localId)
      } else {
        await saveOutboxEntry({
          ...entry,
          attempts,
          nextAttemptAt: new Date(Date.now() + nextBackoff(attempts)).toISOString(),
        })
      }
    }
  }
}

export function syncFieldReports(ownerId: string, force = false): Promise<void> {
  if (!activeSync) {
    activeSync = runSync(ownerId, force).finally(() => {
      activeSync = null
    })
  }
  return activeSync
}

export async function retryFailedReports(ownerId: string): Promise<void> {
  const reports = await loadFieldReports(ownerId)
  const failed = reports.filter((report) => report.syncState === 'error')
  await Promise.all(failed.map((report) => enqueueReport({
    ...report,
    syncState: 'local',
    error: undefined,
    updatedAt: new Date().toISOString(),
  } satisfies LocalFieldReport)))
  await syncFieldReports(ownerId, true)
}
