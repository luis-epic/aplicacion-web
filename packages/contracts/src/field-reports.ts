import { z } from 'zod'

export const reportStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'])

export const fieldReportDraftSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  reportDate: z.iso.date(),
  summary: z.string().trim().min(1).max(2_000),
  personnelCount: z.number().int().min(0).max(10_000),
  weatherNotes: z.string().trim().max(1_000).optional(),
  incidentNotes: z.string().trim().max(4_000).optional(),
  clientUpdatedAt: z.iso.datetime({ offset: true }),
  idempotencyKey: z.uuid(),
})

export type FieldReportDraft = z.infer<typeof fieldReportDraftSchema>
export type ReportStatus = z.infer<typeof reportStatusSchema>
