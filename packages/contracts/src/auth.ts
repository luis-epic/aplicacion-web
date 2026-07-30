import { z } from 'zod'

export const permissionCodes = [
  'users.read',
  'users.manage',
  'clients.read',
  'clients.manage',
  'projects.read',
  'projects.manage',
  'fieldReports.create',
  'fieldReports.read',
  'fieldReports.approve',
  'publications.read',
  'publications.create',
  'publications.manage',
  'publications.publish',
  'tasks.read',
  'tasks.create',
  'tasks.manage',
  'tasks.assign',
  'tasks.complete',
  'tasks.approve',
] as const

export const permissionCodeSchema = z.enum(permissionCodes)

export const loginRequestSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(12).max(128),
})

export const sessionUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1).max(120),
  organizationId: z.uuid().nullable().optional(),
  roles: z.array(z.string().min(1)),
  permissions: z.array(permissionCodeSchema),
})

export const authSessionSchema = z.object({
  accessToken: z.string().min(20),
  expiresIn: z.number().int().positive(),
  user: sessionUserSchema,
})

export type AuthSession = z.infer<typeof authSessionSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type PermissionCode = z.infer<typeof permissionCodeSchema>
export type SessionUser = z.infer<typeof sessionUserSchema>
