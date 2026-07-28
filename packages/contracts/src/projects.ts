import { z } from 'zod'

export const projectStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
])

export const projectSummarySchema = z.object({
  id: z.uuid(),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  clientName: z.string().min(1).max(160),
  status: projectStatusSchema,
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
})

export type ProjectStatus = z.infer<typeof projectStatusSchema>
export type ProjectSummary = z.infer<typeof projectSummarySchema>
