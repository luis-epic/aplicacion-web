import type { PermissionCode, SessionUser } from '@opeconca/contracts'
import { PermissionCode as DatabasePermissionCode, Prisma } from '@prisma/client'

export const userAccessArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: {
    roles: {
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    },
  },
})

export type UserWithAccess = Prisma.UserGetPayload<typeof userAccessArgs>

const permissionCodeMap: Record<DatabasePermissionCode, PermissionCode> = {
  [DatabasePermissionCode.USERS_READ]: 'users.read',
  [DatabasePermissionCode.USERS_MANAGE]: 'users.manage',
  [DatabasePermissionCode.CLIENTS_READ]: 'clients.read',
  [DatabasePermissionCode.CLIENTS_MANAGE]: 'clients.manage',
  [DatabasePermissionCode.PROJECTS_READ]: 'projects.read',
  [DatabasePermissionCode.PROJECTS_MANAGE]: 'projects.manage',
  [DatabasePermissionCode.FIELD_REPORTS_CREATE]: 'fieldReports.create',
  [DatabasePermissionCode.FIELD_REPORTS_READ]: 'fieldReports.read',
  [DatabasePermissionCode.FIELD_REPORTS_APPROVE]: 'fieldReports.approve',
  [DatabasePermissionCode.PUBLICATIONS_READ]: 'publications.read',
  [DatabasePermissionCode.PUBLICATIONS_CREATE]: 'publications.create',
  [DatabasePermissionCode.PUBLICATIONS_MANAGE]: 'publications.manage',
  [DatabasePermissionCode.PUBLICATIONS_PUBLISH]: 'publications.publish',
  [DatabasePermissionCode.TASKS_READ]: 'tasks.read',
  [DatabasePermissionCode.TASKS_CREATE]: 'tasks.create',
  [DatabasePermissionCode.TASKS_MANAGE]: 'tasks.manage',
  [DatabasePermissionCode.TASKS_ASSIGN]: 'tasks.assign',
  [DatabasePermissionCode.TASKS_COMPLETE]: 'tasks.complete',
  [DatabasePermissionCode.TASKS_APPROVE]: 'tasks.approve',
}

export function toSessionUser(user: UserWithAccess): SessionUser {
  const roles = user.roles.map(({ role }) => role.code)
  const permissions = new Set<PermissionCode>()

  user.roles.forEach(({ role }) => {
    role.permissions.forEach(({ permission }) => {
      permissions.add(permissionCodeMap[permission.code])
    })
  })

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles,
    permissions: [...permissions],
  }
}
