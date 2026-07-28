import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, ProjectMemberRole, ProjectStatus } from '@prisma/client'
import type { SessionUser } from '@opeconca/contracts'
import { PrismaService } from '../database/prisma.service'
import { PageQueryDto, type PageResult, pageArgs } from '../common/page-query.dto'
import { iso, throwPrismaConflict } from '../common/prisma-errors'
import { AddProjectMemberDto, CreateProjectDto, ProjectQueryDto, UpdateProjectDto, UpdateProjectMemberDto } from './projects.dto'

export interface ProjectMemberView {
  userId: string
  displayName: string
  email: string
  role: ProjectMemberRole
  joinedAt: string
}

export interface ProjectView {
  id: string
  code: string
  clientId: string
  clientName: string
  name: string
  description: string | null
  status: ProjectStatus
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
  members?: ProjectMemberView[]
}

const projectInclude = Prisma.validator<Prisma.ProjectInclude>()({ client: true })
type ProjectRecord = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProjectQueryDto): Promise<PageResult<ProjectView>> {
    const search = query.search?.trim()
    const where: Prisma.ProjectWhereInput = {
      clientId: query.clientId,
      status: query.status,
      OR: search ? [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ] : undefined,
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({ ...pageArgs(query), where, include: projectInclude, orderBy: { updatedAt: 'desc' } }),
      this.prisma.project.count({ where }),
    ])
    return { items: items.map((item) => this.toView(item)), page: query.page, pageSize: query.pageSize, total }
  }

  async get(id: string): Promise<ProjectView> {
    const project = await this.prisma.project.findUnique({ where: { id }, include: projectInclude })
    if (!project) throw new NotFoundException('Proyecto no encontrado.')
    return this.toView(project)
  }

  async create(dto: CreateProjectDto, actor: SessionUser): Promise<ProjectView> {
    this.assertDateRange(dto.startsAt, dto.endsAt)
    try {
      const project = await this.prisma.$transaction(async (tx) => {
        await this.assertClient(tx, dto.clientId)
        const created = await tx.project.create({ data: {
          code: dto.code.trim(), clientId: dto.clientId, name: dto.name.trim(),
          description: dto.description?.trim(), status: dto.status,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        }, include: projectInclude })
        await tx.auditLog.create({ data: { action: 'project.created', actorId: actor.id, entityId: created.id, entityType: 'Project', metadata: { clientId: dto.clientId } } })
        return created
      })
      return this.toView(project)
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      throwPrismaConflict(error, 'Ya existe un proyecto con ese código.')
    }
  }

  async update(id: string, dto: UpdateProjectDto, actor: SessionUser): Promise<ProjectView> {
    try {
      const project = await this.prisma.$transaction(async (tx) => {
        const current = await tx.project.findUnique({ where: { id } })
        if (!current) throw new NotFoundException('Proyecto no encontrado.')
        if (dto.clientId) await this.assertClient(tx, dto.clientId)
        const startsAt = dto.startsAt === null ? null : dto.startsAt ? new Date(dto.startsAt) : current.startsAt
        const endsAt = dto.endsAt === null ? null : dto.endsAt ? new Date(dto.endsAt) : current.endsAt
        this.assertDateObjects(startsAt, endsAt)
        const updated = await tx.project.update({ where: { id }, data: {
          code: dto.code?.trim(), clientId: dto.clientId, name: dto.name?.trim(),
          description: dto.description === null ? null : dto.description?.trim(), status: dto.status,
          startsAt: dto.startsAt === undefined ? undefined : startsAt,
          endsAt: dto.endsAt === undefined ? undefined : endsAt,
        }, include: projectInclude })
        await tx.auditLog.create({ data: { action: 'project.updated', actorId: actor.id, entityId: id, entityType: 'Project', metadata: { fields: Object.keys(dto) } } })
        return updated
      })
      return this.toView(project)
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error
      throwPrismaConflict(error, 'Ya existe un proyecto con ese código o el cliente no es válido.')
    }
  }

  async remove(id: string, actor: SessionUser): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.assertProject(tx, id)
        await tx.project.delete({ where: { id } })
        await tx.auditLog.create({ data: { action: 'project.deleted', actorId: actor.id, entityId: id, entityType: 'Project' } })
      })
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      throwPrismaConflict(error, 'El proyecto tiene reportes asociados y no puede eliminarse.')
    }
  }

  async listMembers(projectId: string, query: PageQueryDto): Promise<PageResult<ProjectMemberView>> {
    await this.assertProject(this.prisma, projectId)
    const search = query.search?.trim()
    const where: Prisma.ProjectMemberWhereInput = {
      projectId,
      user: search ? { OR: [
        { displayName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ] } : undefined,
    }
    const [members, total] = await this.prisma.$transaction([
      this.prisma.projectMember.findMany({ ...pageArgs(query), where, include: { user: true }, orderBy: { joinedAt: 'asc' } }),
      this.prisma.projectMember.count({ where }),
    ])
    return { items: members.map((member) => this.toMember(member)), page: query.page, pageSize: query.pageSize, total }
  }

  async getMember(projectId: string, userId: string): Promise<ProjectMemberView> {
    const member = await this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, include: { user: true } })
    if (!member) throw new NotFoundException('Miembro de proyecto no encontrado.')
    return this.toMember(member)
  }

  async addMember(projectId: string, dto: AddProjectMemberDto, actor: SessionUser): Promise<ProjectMemberView> {
    try {
      const member = await this.prisma.$transaction(async (tx) => {
        await this.assertProject(tx, projectId)
        const user = await tx.user.findUnique({ where: { id: dto.userId }, select: { id: true } })
        if (!user) throw new NotFoundException('Usuario no encontrado.')
        const created = await tx.projectMember.create({ data: { projectId, userId: dto.userId, role: dto.role }, include: { user: true } })
        await tx.auditLog.create({ data: { action: 'project.member.added', actorId: actor.id, entityId: dto.userId, entityType: 'ProjectMember', metadata: { projectId, role: dto.role } } })
        return created
      })
      return this.toMember(member)
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      throwPrismaConflict(error, 'El usuario ya pertenece al proyecto.')
    }
  }

  async updateMember(projectId: string, userId: string, dto: UpdateProjectMemberDto, actor: SessionUser): Promise<ProjectMemberView> {
    const member = await this.prisma.$transaction(async (tx) => {
      await this.assertMember(tx, projectId, userId)
      const updated = await tx.projectMember.update({ where: { projectId_userId: { projectId, userId } }, data: { role: dto.role }, include: { user: true } })
      await tx.auditLog.create({ data: { action: 'project.member.updated', actorId: actor.id, entityId: userId, entityType: 'ProjectMember', metadata: { projectId, role: dto.role } } })
      return updated
    })
    return this.toMember(member)
  }

  async removeMember(projectId: string, userId: string, actor: SessionUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertMember(tx, projectId, userId)
      await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } })
      await tx.auditLog.create({ data: { action: 'project.member.removed', actorId: actor.id, entityId: userId, entityType: 'ProjectMember', metadata: { projectId } } })
    })
  }

  private async assertProject(tx: Prisma.TransactionClient | PrismaService, id: string): Promise<void> {
    if (!await tx.project.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Proyecto no encontrado.')
  }

  private async assertClient(tx: Prisma.TransactionClient, id: string): Promise<void> {
    if (!await tx.client.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Cliente no encontrado.')
  }

  private async assertMember(tx: Prisma.TransactionClient, projectId: string, userId: string): Promise<void> {
    if (!await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } })) throw new NotFoundException('Miembro de proyecto no encontrado.')
  }

  private assertDateRange(startsAt?: string, endsAt?: string): void {
    this.assertDateObjects(startsAt ? new Date(startsAt) : null, endsAt ? new Date(endsAt) : null)
  }

  private assertDateObjects(startsAt: Date | null, endsAt: Date | null): void {
    if (startsAt && endsAt && startsAt > endsAt) throw new BadRequestException('La fecha de inicio no puede ser posterior a la fecha de fin.')
  }

  private toView(project: ProjectRecord): ProjectView {
    return {
      id: project.id, code: project.code, clientId: project.clientId, clientName: project.client.name,
      name: project.name, description: project.description, status: project.status,
      startsAt: iso(project.startsAt), endsAt: iso(project.endsAt),
      createdAt: iso(project.createdAt)!, updatedAt: iso(project.updatedAt)!,
    }
  }

  private toMember(member: { userId: string; role: ProjectMemberRole; joinedAt: Date; user: { displayName: string; email: string } }): ProjectMemberView {
    return { userId: member.userId, displayName: member.user.displayName, email: member.user.email, role: member.role, joinedAt: iso(member.joinedAt)! }
  }
}
