import { z } from 'zod'

export const taskStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'])
export const taskPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'])
export const taskRecurrenceSchema = z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'])

export const workTaskDraftSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10_000).optional(),
  projectId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
  supervisorId: z.uuid().optional(),
  priority: taskPrioritySchema.default('NORMAL'),
  dueAt: z.iso.datetime({ offset: true }).optional(),
  estimatedMinutes: z.number().int().min(0).max(100_000).optional(),
  recurrence: taskRecurrenceSchema.default('NONE'),
  idempotencyKey: z.uuid(),
})

export type TaskStatus = z.infer<typeof taskStatusSchema>
export type TaskPriority = z.infer<typeof taskPrioritySchema>
export type TaskRecurrence = z.infer<typeof taskRecurrenceSchema>
export type WorkTaskDraft = z.infer<typeof workTaskDraftSchema>
