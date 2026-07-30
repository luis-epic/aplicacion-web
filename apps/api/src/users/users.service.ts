import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, UserStatus } from '@prisma/client'
import { argon2id, hash } from 'argon2'
import type { SessionUser } from '@opeconca/contracts'
import { requireActiveOrganizationId } from '../common/organization-context'
import { PrismaService } from '../database/prisma.service'
import { PageQueryDto, type PageResult, pageArgs } from '../common/page-query.dto'
import { iso, throwPrismaConflict } from '../common/prisma-errors'
import { CreateUserDto, UpdateUserDto } from './users.dto'

const userArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: { roles: { include: { role: true } } },
})
type UserRecord = Prisma.UserGetPayload<typeof userArgs>

export interface RoleView {
  id: string
  code: string
  name: string
}

export interface UserView {
  id: string
  email: string
  displayName: string
  status: UserStatus
  roles: RoleView[]
  createdAt: string
  updatedAt: string
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PageQueryDto, actor: SessionUser): Promise<PageResult<UserView>> {
    const organizationId = await requireActiveOrganizationId(this.prisma, actor)
    const search = query.search?.trim()
    const where: Prisma.UserWhereInput = {
      organizationId,
      OR: search
        ? [
            { displayName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        ...pageArgs(query),
        ...userArgs,
        orderBy: { displayName: 'asc' },
        where,
      }),
      this.prisma.user.count({ where }),
    ])
    return { items: items.map((item) => this.toView(item)), page: query.page, pageSize: query.pageSize, total }
  }

  async get(id: string, actor: SessionUser): Promise<UserView> {
    const organizationId = await requireActiveOrganizationId(this.prisma, actor)
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      ...userArgs,
    })
    if (!user) throw new NotFoundException('Usuario no encontrado.')
    return this.toView(user)
  }

  async listRoles(actor: SessionUser): Promise<RoleView[]> {
    const organizationId = await requireActiveOrganizationId(this.prisma, actor)
    return this.prisma.role.findMany({
      where: { organizationId },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    })
  }

  async create(dto: CreateUserDto, actor: SessionUser): Promise<UserView> {
    const organizationId = await requireActiveOrganizationId(this.prisma, actor)
    const passwordHash = await this.hashPassword(dto.password)
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        await this.assertRoles(tx, dto.roleIds ?? [], organizationId)
        const created = await tx.user.create({
          data: {
            organizationId,
            displayName: dto.displayName.trim(),
            email: dto.email,
            passwordHash,
            status: dto.status,
            roles: dto.roleIds?.length
              ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
              : undefined,
          },
          ...userArgs,
        })
        await tx.auditLog.create({ data: {
          organizationId,
          action: 'user.created', actorId: actor.id, entityId: created.id, entityType: 'User',
          metadata: { roleIds: dto.roleIds ?? [] },
        } })
        return created
      })
      return this.toView(user)
    } catch (error) {
      throwPrismaConflict(error, 'Ya existe un usuario con ese correo o un rol no es válido.')
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: SessionUser): Promise<UserView> {
    const passwordHash = dto.password ? await this.hashPassword(dto.password) : undefined
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const organizationId = await requireActiveOrganizationId(tx, actor)
        const existing = await tx.user.findFirst({ where: { id, organizationId } })
        if (!existing) throw new NotFoundException('Usuario no encontrado.')
        if (dto.roleIds) await this.assertRoles(tx, dto.roleIds, organizationId)
        const invalidatesSessions = Boolean(
          passwordHash ||
          dto.roleIds !== undefined ||
          (dto.status && dto.status !== existing.status),
        )
        if (dto.roleIds) {
          await tx.userRole.deleteMany({ where: { userId: id } })
          if (dto.roleIds.length) {
            await tx.userRole.createMany({ data: dto.roleIds.map((roleId) => ({ roleId, userId: id })) })
          }
        }
        const updated = await tx.user.update({
          where: { id },
          data: {
            displayName: dto.displayName?.trim(),
            email: dto.email,
            passwordHash,
            status: dto.status,
            tokenVersion: invalidatesSessions ? { increment: 1 } : undefined,
          },
          ...userArgs,
        })
        if (invalidatesSessions) {
          await tx.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
        }
        await tx.auditLog.create({ data: {
          organizationId,
          action: 'user.updated', actorId: actor.id, entityId: id, entityType: 'User',
          metadata: { fields: Object.keys(dto).filter((field) => field !== 'password') },
        } })
        return updated
      })
      return this.toView(user)
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      throwPrismaConflict(error, 'No se pudo actualizar: el correo ya existe o un rol no es válido.')
    }
  }

  async remove(id: string, actor: SessionUser): Promise<void> {
    if (id === actor.id) throw new ConflictException('No puedes eliminar tu propio usuario.')
    try {
      await this.prisma.$transaction(async (tx) => {
        const organizationId = await requireActiveOrganizationId(tx, actor)
        const existing = await tx.user.findFirst({ where: { id, organizationId }, select: { id: true } })
        if (!existing) throw new NotFoundException('Usuario no encontrado.')
        await tx.user.delete({ where: { id } })
        await tx.auditLog.create({ data: {
          organizationId,
          action: 'user.deleted', actorId: actor.id, entityId: id, entityType: 'User',
        } })
      })
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      throwPrismaConflict(error, 'El usuario tiene registros asociados y no puede eliminarse.')
    }
  }

  private async assertRoles(tx: Prisma.TransactionClient, roleIds: string[], organizationId: string): Promise<void> {
    if (!roleIds.length) return
    const count = await tx.role.count({ where: { id: { in: roleIds }, organizationId } })
    if (count !== roleIds.length) throw new NotFoundException('Uno o más roles no existen.')
  }

  private hashPassword(password: string): Promise<string> {
    return hash(password, { memoryCost: 19_456, parallelism: 1, timeCost: 2, type: argon2id })
  }

  private toView(user: UserRecord): UserView {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      roles: user.roles.map(({ role }) => ({ id: role.id, code: role.code, name: role.name })),
      createdAt: iso(user.createdAt)!,
      updatedAt: iso(user.updatedAt)!,
    }
  }
}
