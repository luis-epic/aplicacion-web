import { PrismaClient, UserStatus } from '@prisma/client'
import { argon2id, hash } from 'argon2'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '../../.env'), quiet: true })

const prisma = new PrismaClient()
const LEGACY_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000000'

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} para ejecutar el bootstrap administrativo.`)
  return value
}

async function bootstrapAdmin(): Promise<void> {
  if (requiredEnvironment('ADMIN_BOOTSTRAP_CONFIRM') !== 'CREATE_INITIAL_ADMIN') {
    throw new Error('ADMIN_BOOTSTRAP_CONFIRM debe ser CREATE_INITIAL_ADMIN.')
  }
  const email = requiredEnvironment('ADMIN_EMAIL').toLowerCase()
  const displayName = requiredEnvironment('ADMIN_NAME')
  const password = requiredEnvironment('ADMIN_PASSWORD')
  if (password.length < 16 || password.startsWith('replace-with-')) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 16 caracteres y no ser un valor de ejemplo.')
  }

  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-bootstrap:${email}`}, 0))`
    const adminRole = await transaction.role.findUnique({
      where: { organizationId_code: { organizationId: LEGACY_ORGANIZATION_ID, code: 'ADMIN' } },
    })
    if (!adminRole) {
      throw new Error('El rol ADMIN no existe. Ejecuta prisma migrate deploy antes del bootstrap.')
    }

    let admin = await transaction.user.findUnique({ where: { email } })
    let created = false
    if (!admin) {
      const passwordHash = await hash(password, {
        memoryCost: 19_456,
        parallelism: 1,
        timeCost: 2,
        type: argon2id,
      })
      admin = await transaction.user.create({
        data: { displayName, email, passwordHash, organizationId: LEGACY_ORGANIZATION_ID, status: UserStatus.ACTIVE },
      })
      created = true
    } else if (admin.status !== UserStatus.ACTIVE) {
      throw new Error('El usuario de bootstrap existe pero está inactivo; requiere recuperación administrativa.')
    } else if (!admin.organizationId) {
      admin = await transaction.user.update({
        where: { id: admin.id },
        data: { organizationId: LEGACY_ORGANIZATION_ID },
      })
    }

    const existingGrant = await transaction.userRole.findUnique({
      where: { userId_roleId: { roleId: adminRole.id, userId: admin.id } },
    })
    if (!existingGrant) {
      await transaction.userRole.create({ data: { roleId: adminRole.id, userId: admin.id } })
    }
    if (created || !existingGrant) {
      await transaction.auditLog.create({
        data: {
          action: created ? 'admin.bootstrap.created' : 'admin.bootstrap.role_granted',
          actorId: admin.id,
          entityId: admin.id,
          entityType: 'User',
          metadata: { source: 'production-bootstrap' },
        },
      })
    }
    return { created, granted: !existingGrant, id: admin.id }
  }, { timeout: 15_000 })

  console.log(JSON.stringify({ event: 'admin.bootstrap.completed', ...result }))
}

bootstrapAdmin()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
