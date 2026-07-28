import { z } from 'zod'

export const entityIdSchema = z.uuid()
export const isoDateTimeSchema = z.iso.datetime({ offset: true })

export const paginatedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
})

export type PaginatedQuery = z.infer<typeof paginatedQuerySchema>

export interface PaginatedResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
