import { PrismaClient, UserStatus } from '@prisma/client'
import { argon2id, hash } from 'argon2'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '../../.env'), quiet: true })

const prisma = new PrismaClient()
const LEGACY_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000000'

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
    const adminRole = await transaction.role.findUnique({
      where: { organizationId_code: { organizationId: LEGACY_ORGANIZATION_ID, code: 'ADMIN' } },
    })
    if (!adminRole) {
      throw new Error('El rol ADMIN no existe. Ejecuta prisma migrate deploy antes del seed.')
    }

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
              organizationId: existing.organizationId ?? LEGACY_ORGANIZATION_ID,
              status: UserStatus.ACTIVE,
              tokenVersion: { increment: 1 },
            },
          })
      : await transaction.user.create({
          data: { displayName, email, passwordHash, organizationId: LEGACY_ORGANIZATION_ID },
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
