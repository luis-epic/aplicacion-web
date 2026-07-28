import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, UserStatus } from '@prisma/client'
import { argon2id, hash } from 'argon2'
import type { SessionUser } from '@opeconca/contracts'
import { PrismaService } from '../database/prisma.service'
import { PageQueryDto, type PageResult, pageArgs } from '../common/page-query.dto'
import { iso, throwPrismaConflict } from '../common/prisma-errors'
import { CreateUserDto, UpdateUserDto } from './users.dto'

const userArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: { roles: { include: { role: true } } },
})
type UserRecord = Prisma.UserGetPayload<typeof userArgs>

export interface UserView {
  id: string
  email: string
  displayName: string
  status: UserStatus
  roles: Array<{ id: string; code: string; name: string }>
  createdAt: string
  updatedAt: string
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PageQueryDto): Promise<PageResult<UserView>> {
    const search = query.search?.trim()
    const where: Prisma.UserWhereInput = search
      ? { OR: [
          { displayName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ] }
      : {}
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

  async get(id: string): Promise<UserView> {
    const user = await this.prisma.user.findUnique({ where: { id }, ...userArgs })
    if (!user) throw new NotFoundException('Usuario no encontrado.')
    return this.toView(user)
  }

  async create(dto: CreateUserDto, actor: SessionUser): Promise<UserView> {
    const passwordHash = await this.hashPassword(dto.password)
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        await this.assertRoles(tx, dto.roleIds ?? [])
        const created = await tx.user.create({
          data: {
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
        const existing = await tx.user.findUnique({ where: { id } })
        if (!existing) throw new NotFoundException('Usuario no encontrado.')
        if (dto.roleIds) await this.assertRoles(tx, dto.roleIds)
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
        const existing = await tx.user.findUnique({ where: { id }, select: { id: true } })
        if (!existing) throw new NotFoundException('Usuario no encontrado.')
        await tx.user.delete({ where: { id } })
        await tx.auditLog.create({ data: {
          action: 'user.deleted', actorId: actor.id, entityId: id, entityType: 'User',
        } })
      })
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      throwPrismaConflict(error, 'El usuario tiene registros asociados y no puede eliminarse.')
    }
  }

  private async assertRoles(tx: Prisma.TransactionClient, roleIds: string[]): Promise<void> {
    if (!roleIds.length) return
    const count = await tx.role.count({ where: { id: { in: roleIds } } })
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
