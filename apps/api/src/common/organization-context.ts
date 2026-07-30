import { ForbiddenException } from '@nestjs/common'
import type { SessionUser } from '@opeconca/contracts'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../database/prisma.service'

type OrganizationClient = Prisma.TransactionClient | PrismaService

export async function requireActiveOrganizationId(
  db: OrganizationClient,
  actor: SessionUser,
): Promise<string> {
  if (!actor.organizationId) {
    throw new ForbiddenException('Tu usuario no está asignado a una organización activa.')
  }

  const organization = await db.organization.findFirst({
    where: { id: actor.organizationId, isActive: true },
    select: { id: true },
  })
  if (!organization) {
    throw new ForbiddenException('Tu organización no está activa.')
  }
  return organization.id
}
