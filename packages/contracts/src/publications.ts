import { z } from 'zod'

export const publicationTypeSchema = z.enum(['DAILY', 'WEEKLY', 'PROJECT_NEWS', 'SAFETY', 'HR', 'RECOGNITION', 'URGENT'])
export const publicationStatusSchema = z.enum(['DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'])
export const publicationAudienceSchema = z.enum(['ALL', 'PROJECT', 'ROLE'])
export const publicationPrioritySchema = z.enum(['NORMAL', 'IMPORTANT', 'URGENT'])

export const publicationDraftSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  summary: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(50_000),
  coverImageUrl: z.url().max(2_000).optional(),
  type: publicationTypeSchema,
  category: z.string().trim().min(1).max(80),
  priority: publicationPrioritySchema.default('NORMAL'),
  audience: publicationAudienceSchema.default('ALL'),
  projectId: z.uuid().optional(),
  audienceRoleCode: z.string().trim().max(60).optional(),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
}).superRefine((draft, context) => {
  if (draft.audience === 'ALL') {
    if (draft.projectId) context.addIssue({ code: 'custom', message: 'La audiencia ALL no admite projectId.', path: ['projectId'] })
    if (draft.audienceRoleCode) context.addIssue({ code: 'custom', message: 'La audiencia ALL no admite audienceRoleCode.', path: ['audienceRoleCode'] })
  }
  if (draft.audience === 'PROJECT') {
    if (!draft.projectId) context.addIssue({ code: 'custom', message: 'La audiencia PROJECT requiere projectId.', path: ['projectId'] })
    if (draft.audienceRoleCode) context.addIssue({ code: 'custom', message: 'La audiencia PROJECT no admite audienceRoleCode.', path: ['audienceRoleCode'] })
  }
  if (draft.audience === 'ROLE') {
    if (!draft.audienceRoleCode) context.addIssue({ code: 'custom', message: 'La audiencia ROLE requiere audienceRoleCode.', path: ['audienceRoleCode'] })
    if (draft.projectId) context.addIssue({ code: 'custom', message: 'La audiencia ROLE no admite projectId.', path: ['projectId'] })
  }
})

export type PublicationType = z.infer<typeof publicationTypeSchema>
export type PublicationStatus = z.infer<typeof publicationStatusSchema>
export type PublicationAudience = z.infer<typeof publicationAudienceSchema>
export type PublicationPriority = z.infer<typeof publicationPrioritySchema>
export type PublicationDraft = z.infer<typeof publicationDraftSchema>
