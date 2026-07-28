import { permissionCodes, type PermissionCode as ContractPermissionCode } from '@opeconca/contracts'
import { PermissionCode, PrismaClient, UserStatus } from '@prisma/client'
import { argon2id, hash } from 'argon2'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '../../.env'), quiet: true })

const prisma = new PrismaClient()
const databasePermissionByContract: Record<ContractPermissionCode, PermissionCode> = {
  'users.read': PermissionCode.USERS_READ,
  'users.manage': PermissionCode.USERS_MANAGE,
  'clients.read': PermissionCode.CLIENTS_READ,
  'clients.manage': PermissionCode.CLIENTS_MANAGE,
  'projects.read': PermissionCode.PROJECTS_READ,
  'projects.manage': PermissionCode.PROJECTS_MANAGE,
  'fieldReports.create': PermissionCode.FIELD_REPORTS_CREATE,
  'fieldReports.read': PermissionCode.FIELD_REPORTS_READ,
  'fieldReports.approve': PermissionCode.FIELD_REPORTS_APPROVE,
  'publications.read': PermissionCode.PUBLICATIONS_READ,
  'publications.create': PermissionCode.PUBLICATIONS_CREATE,
  'publications.manage': PermissionCode.PUBLICATIONS_MANAGE,
  'publications.publish': PermissionCode.PUBLICATIONS_PUBLISH,
  'tasks.read': PermissionCode.TASKS_READ,
  'tasks.create': PermissionCode.TASKS_CREATE,
  'tasks.manage': PermissionCode.TASKS_MANAGE,
  'tasks.assign': PermissionCode.TASKS_ASSIGN,
  'tasks.complete': PermissionCode.TASKS_COMPLETE,
  'tasks.approve': PermissionCode.TASKS_APPROVE,
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} para crear el administrador inicial.`)
  return value
}

async function seed(): Promise<void> {
  const email = requiredEnvironment('ADMIN_EMAIL').toLowerCase()
  const password = requiredEnvironment('ADMIN_PASSWORD')
  const displayName = requiredEnvironment('ADMIN_NAME')
  const bootstrapOnly = process.env.ADMIN_SEED_MODE === 'bootstrap'
  if (password.length < 12 || password.startsWith('replace-with-')) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres y no ser un valor de ejemplo.')
  }

  const passwordHash = await hash(password, {
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
    type: argon2id,
  })

  await prisma.$transaction(async (transaction) => {
    const permissions = []
    for (const contractCode of permissionCodes) {
      permissions.push(await transaction.permission.upsert({
        where: { code: databasePermissionByContract[contractCode] },
        update: {},
        create: { code: databasePermissionByContract[contractCode] },
      }))
    }

    const adminRole = await transaction.role.upsert({
      where: { code: 'ADMIN' },
      update: { name: 'Administrador' },
      create: {
        code: 'ADMIN',
        description: 'Acceso administrativo completo.',
        name: 'Administrador',
      },
    })
    await transaction.rolePermission.deleteMany({ where: { roleId: adminRole.id } })
    await transaction.rolePermission.createMany({
      data: permissions.map((permission) => ({
        permissionId: permission.id,
        roleId: adminRole.id,
      })),
    })

    let existing = await transaction.user.findUnique({ where: { email } })
    if (existing) {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`user:${existing.id}`}, 0))`
      existing = await transaction.user.findUnique({ where: { id: existing.id } })
    }
    const admin = existing
      ? bootstrapOnly
        ? existing
        : await transaction.user.update({
            where: { id: existing.id },
            data: {
              displayName,
              passwordHash,
              status: UserStatus.ACTIVE,
              tokenVersion: { increment: 1 },
            },
          })
      : await transaction.user.create({
          data: { displayName, email, passwordHash },
        })

    if (!bootstrapOnly || !existing) {
      await transaction.refreshSession.updateMany({
        where: { userId: admin.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      await transaction.loginThrottle.deleteMany({ where: { email } })
    }
    await transaction.userRole.upsert({
      where: { userId_roleId: { roleId: adminRole.id, userId: admin.id } },
      update: {},
      create: { roleId: adminRole.id, userId: admin.id },
    })
    if (!bootstrapOnly || !existing) {
      await transaction.auditLog.create({
        data: {
          action: 'admin.seed.applied',
          actorId: admin.id,
          entityId: admin.id,
          entityType: 'User',
        },
      })
    }
  }, { timeout: 15_000 })
}

seed()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
