import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import {
  Prisma,
  PublicationAudience,
  PublicationStatus,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
  UserStatus,
  type WorkTask,
} from '@prisma/client'
import type { SessionUser } from '@opeconca/contracts'
import { createHash } from 'node:crypto'
import { type PageResult, pageArgs } from '../common/page-query.dto'
import { iso } from '../common/prisma-errors'
import { PrismaService } from '../database/prisma.service'
import {
  CreatePublicationDto,
  GeneratePublicationTasksDto,
  PublicationAcknowledgementQueryDto,
  PublicationFeedQueryDto,
  PublicationQueryDto,
  PublishPublicationDto,
  UpdatePublicationDto,
} from './publications.dto'

const publicationInclude = Prisma.validator<Prisma.PublicationInclude>()({
  project: { select: { code: true, name: true } },
  author: { select: { displayName: true } },
  reviewer: { select: { displayName: true } },
  _count: { select: { acknowledgements: true, generatedTasks: true } },
})
type PublicationRecord = Prisma.PublicationGetPayload<{ include: typeof publicationInclude }>

type DatabaseClient = Prisma.TransactionClient | PrismaService

export interface PublicationView {
  id: string
  title: string
  slug: string
  summary: string
  content: string
  coverImageUrl: string | null
  type: PublicationRecord['type']
  category: string
  status: PublicationRecord['status']
  priority: PublicationRecord['priority']
  audience: PublicationRecord['audience']
  audienceRoleCode: string | null
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  authorId: string
  authorName: string
  reviewerId: string | null
  reviewerName: string | null
  scheduledAt: string | null
  publishedAt: string | null
  expiresAt: string | null
  acknowledgementCount: number
  generatedTaskCount: number
  createdAt: string
  updatedAt: string
}

export interface AcknowledgementView {
  publicationId: string
  userId: string
  userName: string
  userEmail: string
  readAt: string
}

export interface GeneratedTaskView {
  id: string
  projectId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  recurrence: TaskRecurrence
  creatorId: string
  assigneeId: string | null
  supervisorId: string | null
  sourcePublicationId: string | null
  idempotencyKey: string | null
  dueAt: string | null
  estimatedMinutes: number | null
  createdAt: string
  updatedAt: string
}

@Injectable()
export class PublicationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublicationsService.name)
  private activationTimer?: ReturnType<typeof setInterval>

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.activateScheduledPublications(new Date()).catch((error: unknown) => {
      this.logger.error('No se pudieron activar las publicaciones programadas.', error instanceof Error ? error.stack : undefined)
    })
    this.activationTimer = setInterval(() => {
      void this.activateScheduledPublications(new Date()).catch((error: unknown) => {
        this.logger.error('No se pudieron activar las publicaciones programadas.', error instanceof Error ? error.stack : undefined)
      })
    }, 30_000)
    this.activationTimer.unref()
  }

  onModuleDestroy(): void {
    if (this.activationTimer) clearInterval(this.activationTimer)
  }

  async feed(query: PublicationFeedQueryDto, actor: SessionUser): Promise<PageResult<PublicationView>> {
    const now = new Date()
    await this.activateScheduledPublications(now)
    const search = query.search?.trim()
    const audiences: Prisma.PublicationWhereInput[] = [
      { audience: PublicationAudience.ALL },
      {
        audience: PublicationAudience.PROJECT,
        project: { members: { some: { userId: actor.id } } },
      },
    ]
    if (actor.roles.length > 0) {
      audiences.push({ audience: PublicationAudience.ROLE, audienceRoleCode: { in: actor.roles } })
    }
    const where: Prisma.PublicationWhereInput = {
      status: PublicationStatus.PUBLISHED,
      publishedAt: { lte: now },
      OR: audiences,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ...(search ? [{ OR: [
          { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { summary: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { category: { contains: search, mode: Prisma.QueryMode.insensitive } },
        ] }] : []),
      ],
      type: query.type,
      category: query.category?.trim(),
      projectId: query.projectId,
    }
    return this.findPage(where, query, [{ priority: 'desc' }, { publishedAt: 'desc' }])
  }

  async reviewQueue(query: PublicationQueryDto): Promise<PageResult<PublicationView>> {
    const search = query.search?.trim()
    const reviewStatuses: PublicationStatus[] = [PublicationStatus.IN_REVIEW, PublicationStatus.SCHEDULED]
    const status = query.status
      ? reviewStatuses.includes(query.status) ? query.status : { in: [] }
      : { in: reviewStatuses }
    const where: Prisma.PublicationWhereInput = {
      status,
      type: query.type,
      audience: query.audience,
      priority: query.priority,
      projectId: query.projectId,
      authorId: query.authorId,
      category: query.category?.trim(),
      OR: search ? [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ] : undefined,
    }
    return this.findPage(where, query, [{ updatedAt: 'desc' }])
  }

  async mine(query: PublicationQueryDto, actor: SessionUser): Promise<PageResult<PublicationView>> {
    return this.list({ ...query, authorId: actor.id })
  }

  async list(query: PublicationQueryDto): Promise<PageResult<PublicationView>> {
    const search = query.search?.trim()
    const where: Prisma.PublicationWhereInput = {
      status: query.status,
      type: query.type,
      audience: query.audience,
      priority: query.priority,
      projectId: query.projectId,
      authorId: query.authorId,
      category: query.category?.trim(),
      OR: search ? [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ] : undefined,
    }
    return this.findPage(where, query, [{ updatedAt: 'desc' }])
  }

  async get(id: string, actor: SessionUser): Promise<PublicationView> {
    const publication = await this.getRecord(this.prisma, id)
    await this.assertReadable(publication, actor)
    return this.toView(publication)
  }

  async create(dto: CreatePublicationDto, actor: SessionUser): Promise<PublicationView> {
    const scheduledAt = this.date(dto.scheduledAt)
    const expiresAt = this.date(dto.expiresAt)
    this.assertDates(scheduledAt, expiresAt)
    try {
      const publication = await this.prisma.$transaction(async (tx) => {
        await this.assertAudienceReferences(tx, dto.audience, dto.projectId ?? null, dto.audienceRoleCode ?? null)
        const created = await tx.publication.create({
          data: {
            title: dto.title.trim(),
            slug: dto.slug.trim(),
            summary: dto.summary.trim(),
            content: dto.content.trim(),
            coverImageUrl: dto.coverImageUrl?.trim(),
            type: dto.type,
            category: dto.category.trim(),
            priority: dto.priority,
            audience: dto.audience,
            projectId: dto.projectId,
            audienceRoleCode: dto.audienceRoleCode?.trim(),
            scheduledAt,
            expiresAt,
            authorId: actor.id,
          },
          include: publicationInclude,
        })
        await this.audit(tx, 'publication.created', created.id, actor.id, { slug: created.slug })
        return created
      })
      return this.toView(publication)
    } catch (error) {
      this.rethrowMutationError(error, 'El slug ya está en uso.')
    }
  }

  async update(id: string, dto: UpdatePublicationDto, actor: SessionUser): Promise<PublicationView> {
    try {
      const publication = await this.prisma.$transaction(async (tx) => {
        const current = await this.getRecord(tx, id)
        this.assertAuthorOrManage(current, actor)
        this.assertStatus(
          current.status,
          [PublicationStatus.DRAFT, PublicationStatus.IN_REVIEW, PublicationStatus.SCHEDULED],
          'La publicación ya no admite edición.',
        )
        const audience = dto.audience ?? current.audience
        const projectId = dto.projectId === undefined ? current.projectId : dto.projectId
        const roleCode = dto.audienceRoleCode === undefined ? current.audienceRoleCode : dto.audienceRoleCode
        const scheduledAt = dto.scheduledAt === undefined ? current.scheduledAt : this.date(dto.scheduledAt)
        const expiresAt = dto.expiresAt === undefined ? current.expiresAt : this.date(dto.expiresAt)
        if (current.status === PublicationStatus.SCHEDULED && !scheduledAt) {
          throw new BadRequestException('Una publicación programada debe conservar una fecha de programación futura.')
        }
        await this.assertAudienceReferences(tx, audience, projectId, roleCode)
        this.assertDates(scheduledAt, expiresAt)
        const result = await tx.publication.updateMany({
          where: { id, status: current.status },
          data: {
            title: dto.title?.trim(),
            slug: dto.slug?.trim(),
            summary: dto.summary?.trim(),
            content: dto.content?.trim(),
            coverImageUrl: dto.coverImageUrl === null ? null : dto.coverImageUrl?.trim(),
            type: dto.type,
            category: dto.category?.trim(),
            priority: dto.priority,
            audience,
            projectId: audience === PublicationAudience.PROJECT ? projectId : null,
            audienceRoleCode: audience === PublicationAudience.ROLE ? roleCode?.trim() : null,
            scheduledAt,
            expiresAt,
          },
        })
        if (result.count !== 1) throw new ConflictException('La publicación cambió mientras se actualizaba; vuelve a intentarlo.')
        const updated = await this.getRecord(tx, id)
        await this.audit(tx, 'publication.updated', id, actor.id, { fields: Object.keys(dto) })
        return updated
      })
      return this.toView(publication)
    } catch (error) {
      this.rethrowMutationError(error, 'El slug ya está en uso.')
    }
  }

  async submit(id: string, actor: SessionUser): Promise<PublicationView> {
    const publication = await this.prisma.$transaction(async (tx) => {
      const current = await this.getRecord(tx, id)
      this.assertAuthorOrManage(current, actor)
      this.assertStatus(current.status, [PublicationStatus.DRAFT], 'Sólo puede enviarse un borrador a revisión.')
      const result = await tx.publication.updateMany({
        where: { id, status: PublicationStatus.DRAFT },
        data: { status: PublicationStatus.IN_REVIEW, reviewerId: null, publishedAt: null },
      })
      if (result.count !== 1) throw new ConflictException('La publicación cambió durante el envío; vuelve a intentarlo.')
      const updated = await this.getRecord(tx, id)
      await this.audit(tx, 'publication.submitted', id, actor.id)
      return updated
    })
    return this.toView(publication)
  }

  async publish(id: string, dto: PublishPublicationDto, actor: SessionUser): Promise<PublicationView> {
    const publication = await this.prisma.$transaction(async (tx) => {
      const current = await this.getRecord(tx, id)
      this.assertStatus(
        current.status,
        [PublicationStatus.IN_REVIEW, PublicationStatus.SCHEDULED],
        'Sólo puede publicarse una publicación en revisión o programada.',
      )
      const now = new Date()
      const scheduledAt = this.date(dto.scheduledAt)
      if (scheduledAt && scheduledAt <= now) {
        throw new BadRequestException('La fecha programada debe estar en el futuro; omítela para publicar ahora.')
      }
      const expiresAt = dto.expiresAt === undefined ? current.expiresAt : this.date(dto.expiresAt)
      this.assertDates(scheduledAt, expiresAt, now)
      const isScheduled = Boolean(scheduledAt)
      const result = await tx.publication.updateMany({
        where: { id, status: current.status },
        data: {
          status: isScheduled ? PublicationStatus.SCHEDULED : PublicationStatus.PUBLISHED,
          scheduledAt,
          publishedAt: isScheduled ? null : now,
          expiresAt,
          reviewerId: actor.id,
        },
      })
      if (result.count !== 1) throw new ConflictException('La publicación cambió durante la publicación; vuelve a intentarlo.')
      const updated = await this.getRecord(tx, id)
      await this.audit(tx, isScheduled ? 'publication.scheduled' : 'publication.published', id, actor.id, {
        scheduledAt: iso(scheduledAt),
      })
      return updated
    })
    return this.toView(publication)
  }

  async archive(id: string, actor: SessionUser): Promise<PublicationView> {
    const publication = await this.prisma.$transaction(async (tx) => {
      const current = await this.getRecord(tx, id)
      this.assertStatus(
        current.status,
        [PublicationStatus.DRAFT, PublicationStatus.IN_REVIEW, PublicationStatus.SCHEDULED, PublicationStatus.PUBLISHED],
        'La publicación ya está archivada.',
      )
      const result = await tx.publication.updateMany({
        where: { id, status: current.status },
        data: { status: PublicationStatus.ARCHIVED },
      })
      if (result.count !== 1) throw new ConflictException('La publicación cambió durante el archivado; vuelve a intentarlo.')
      const updated = await this.getRecord(tx, id)
      await this.audit(tx, 'publication.archived', id, actor.id, { previousStatus: current.status })
      return updated
    })
    return this.toView(publication)
  }

  async acknowledge(id: string, actor: SessionUser): Promise<AcknowledgementView> {
    const acknowledgement = await this.prisma.$transaction(async (tx) => {
      const publication = await this.getRecord(tx, id)
      await this.assertReadable(publication, actor, false, tx)
      const readAt = new Date()
      const created = await tx.publicationAcknowledgement.createMany({
        data: [{ publicationId: id, userId: actor.id, readAt }],
        skipDuplicates: true,
      })
      const record = await tx.publicationAcknowledgement.findUnique({
        where: { publicationId_userId: { publicationId: id, userId: actor.id } },
        include: { user: { select: { displayName: true, email: true } } },
      })
      if (!record) throw new ConflictException('No se pudo registrar la confirmación de lectura.')
      if (created.count === 1) {
        await this.audit(tx, 'publication.acknowledged', id, actor.id, { readAt: readAt.toISOString() })
      }
      return record
    })
    return this.toAcknowledgementView(acknowledgement)
  }

  async acknowledgements(
    id: string,
    query: PublicationAcknowledgementQueryDto,
  ): Promise<PageResult<AcknowledgementView>> {
    await this.getRecord(this.prisma, id)
    const search = query.search?.trim()
    const where: Prisma.PublicationAcknowledgementWhereInput = {
      publicationId: id,
      user: search ? { OR: [
        { displayName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ] } : undefined,
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.publicationAcknowledgement.findMany({
        ...pageArgs(query),
        where,
        include: { user: { select: { displayName: true, email: true } } },
        orderBy: { readAt: 'desc' },
      }),
      this.prisma.publicationAcknowledgement.count({ where }),
    ])
    return {
      items: items.map((item) => this.toAcknowledgementView(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    }
  }

  async generateTasks(
    id: string,
    dto: GeneratePublicationTasksDto,
    actor: SessionUser,
    retryOnConflict = true,
  ): Promise<GeneratedTaskView[]> {
    if (
      dto.tasks.some((task) => task.assigneeId || task.supervisorId) &&
      !actor.permissions.includes('tasks.assign')
    ) {
      throw new ForbiddenException('Necesitas tasks.assign para crear tareas con responsables o supervisores.')
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const publication = await this.getRecord(tx, id)
        await this.assertCanGenerateTasks(publication, actor, tx)

        const idempotencyKeys = dto.tasks.map((task) => task.idempotencyKey)
        if (new Set(idempotencyKeys).size !== idempotencyKeys.length) {
          throw new BadRequestException('Cada tarea del lote debe usar una clave de idempotencia distinta.')
        }
        const resolvedTasks = dto.tasks.map((task) => ({
          task,
          projectId: task.projectId ?? publication.projectId,
        }))
        const existingTasks = await tx.workTask.findMany({
          where: { idempotencyKey: { in: idempotencyKeys } },
        })
        const existingByKey = new Map(existingTasks.map((task) => [task.idempotencyKey, task]))
        for (const { task, projectId } of resolvedTasks) {
          const existing = existingByKey.get(task.idempotencyKey)
          if (existing) this.assertGeneratedTaskMatches(existing, task, projectId, id, actor.id)
        }
        const pendingTasks = resolvedTasks.filter(({ task }) => !existingByKey.has(task.idempotencyKey))
        if (pendingTasks.length === 0) {
          return resolvedTasks.map(({ task }) => this.toTaskView(existingByKey.get(task.idempotencyKey)!))
        }

        const projectIds = [...new Set(pendingTasks.map(({ projectId }) => projectId).filter((value): value is string => Boolean(value)))]
        if (projectIds.length > 0) {
          const count = await tx.project.count({ where: { id: { in: projectIds } } })
          if (count !== projectIds.length) throw new NotFoundException('Uno o más proyectos de las tareas no existen.')
        }

        const userIds = [...new Set([
          actor.id,
          ...pendingTasks.flatMap(({ task }) => [task.assigneeId, task.supervisorId]),
        ].filter((value): value is string => Boolean(value)))]
        const activeUserCount = await tx.user.count({
          where: { id: { in: userIds }, status: UserStatus.ACTIVE },
        })
        if (activeUserCount !== userIds.length) {
          throw new NotFoundException('Uno o más usuarios asignados no existen o no están activos.')
        }

        const usersByProject = new Map<string, Set<string>>()
        for (const { task, projectId } of pendingTasks) {
          if (!projectId) continue
          const projectUsers = usersByProject.get(projectId) ?? new Set<string>()
          projectUsers.add(actor.id)
          if (task.assigneeId) projectUsers.add(task.assigneeId)
          if (task.supervisorId) projectUsers.add(task.supervisorId)
          usersByProject.set(projectId, projectUsers)
        }
        if (usersByProject.size > 0) {
          const memberships = await tx.projectMember.findMany({
            where: {
              OR: [...usersByProject].map(([projectId, users]) => ({
                projectId,
                userId: { in: [...users] },
              })),
            },
            select: { projectId: true, userId: true },
          })
          const membershipKeys = new Set(memberships.map(({ projectId, userId }) => `${projectId}:${userId}`))
          const missingMembership = [...usersByProject].some(([projectId, users]) => (
            [...users].some((userId) => !membershipKeys.has(`${projectId}:${userId}`))
          ))
          if (missingMembership) {
            throw new ForbiddenException('Todas las personas vinculadas a una tarea deben pertenecer a su proyecto.')
          }
        }

        const now = new Date()
        for (const { task } of pendingTasks) {
          if (task.dueAt && new Date(task.dueAt) <= now) {
            throw new BadRequestException('Las fechas de vencimiento de las tareas deben estar en el futuro.')
          }
        }

        const tasks = []
        const createdTaskIds: string[] = []
        for (const { task, projectId } of resolvedTasks) {
          const existing = existingByKey.get(task.idempotencyKey)
          if (existing) {
            tasks.push(existing)
            continue
          }
          const created = await tx.workTask.create({ data: {
            projectId,
            title: task.title.trim(),
            description: task.description?.trim(),
            priority: task.priority,
            recurrence: task.recurrence,
            creatorId: actor.id,
            assigneeId: task.assigneeId,
            supervisorId: task.supervisorId,
            sourcePublicationId: id,
            idempotencyKey: task.idempotencyKey,
            idempotencyFingerprint: this.generatedTaskFingerprint(task, projectId, id),
            dueAt: this.date(task.dueAt),
            estimatedMinutes: task.estimatedMinutes,
          } })
          tasks.push(created)
          createdTaskIds.push(created.id)
        }
        if (createdTaskIds.length > 0) {
          await this.audit(tx, 'publication.tasksGenerated', id, actor.id, {
            taskIds: createdTaskIds,
            count: createdTaskIds.length,
          })
        }
        return tasks.map((task) => this.toTaskView(task))
      })
    } catch (error) {
      if (retryOnConflict && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.generateTasks(id, dto, actor, false)
      }
      this.rethrowMutationError(error, 'Una clave de idempotencia de tarea ya está en uso con otro contenido.')
    }
  }

  private async activateScheduledPublications(now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const candidates = await tx.publication.findMany({
        where: {
          status: PublicationStatus.SCHEDULED,
          scheduledAt: { lte: now },
        },
        select: { id: true },
      })
      if (candidates.length === 0) return
      const candidateIds = candidates.map(({ id }) => id)
      const result = await tx.publication.updateMany({
        where: {
          id: { in: candidateIds },
          status: PublicationStatus.SCHEDULED,
          scheduledAt: { lte: now },
        },
        data: {
          status: PublicationStatus.PUBLISHED,
          publishedAt: now,
        },
      })
      if (result.count === 0) return
      const activated = await tx.publication.findMany({
        where: {
          id: { in: candidateIds },
          status: PublicationStatus.PUBLISHED,
          publishedAt: now,
        },
        select: { id: true },
      })
      await tx.auditLog.createMany({
        data: activated.map(({ id }) => ({
          action: 'publication.scheduledPublished',
          entityId: id,
          entityType: 'Publication',
          metadata: { activatedAt: now.toISOString() },
        })),
      })
    })
  }

  private generatedTaskFingerprint(
    task: GeneratePublicationTasksDto['tasks'][number],
    projectId: string | null,
    publicationId: string,
  ): string {
    return createHash('sha256').update(JSON.stringify({
      sourcePublicationId: publicationId,
      title: task.title.trim(),
      description: task.description?.trim() ?? null,
      projectId,
      assigneeId: task.assigneeId ?? null,
      supervisorId: task.supervisorId ?? null,
      priority: task.priority ?? TaskPriority.NORMAL,
      recurrence: task.recurrence ?? TaskRecurrence.NONE,
      dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
      estimatedMinutes: task.estimatedMinutes ?? null,
    })).digest('hex')
  }

  private assertGeneratedTaskMatches(
    existing: WorkTask,
    task: GeneratePublicationTasksDto['tasks'][number],
    projectId: string | null,
    publicationId: string,
    creatorId: string,
  ): void {
    const fingerprint = this.generatedTaskFingerprint(task, projectId, publicationId)
    if (existing.creatorId !== creatorId || existing.sourcePublicationId !== publicationId) {
      throw new ConflictException('Una clave de idempotencia ya pertenece a otra tarea.')
    }
    if (existing.idempotencyFingerprint) {
      if (existing.idempotencyFingerprint !== fingerprint) {
        throw new ConflictException('Una clave de idempotencia ya fue utilizada con otro contenido.')
      }
      return
    }
    const matchesLegacyPayload = (
      existing.title === task.title.trim() &&
      existing.description === (task.description?.trim() ?? null) &&
      existing.projectId === projectId &&
      existing.assigneeId === (task.assigneeId ?? null) &&
      existing.supervisorId === (task.supervisorId ?? null) &&
      existing.priority === (task.priority ?? TaskPriority.NORMAL) &&
      existing.recurrence === (task.recurrence ?? TaskRecurrence.NONE) &&
      (existing.dueAt?.getTime() ?? null) === (task.dueAt ? new Date(task.dueAt).getTime() : null) &&
      existing.estimatedMinutes === (task.estimatedMinutes ?? null)
    )
    if (!matchesLegacyPayload) {
      throw new ConflictException('Una clave de idempotencia ya fue utilizada con otro contenido.')
    }
  }

  private async assertCanGenerateTasks(
    publication: PublicationRecord,
    actor: SessionUser,
    tx: DatabaseClient,
  ): Promise<void> {
    if (actor.permissions.includes('publications.manage')) return
    if (publication.authorId === actor.id && actor.permissions.includes('publications.create')) return
    await this.assertReadable(publication, actor, false, tx)
  }

  private async findPage(
    where: Prisma.PublicationWhereInput,
    query: PublicationFeedQueryDto,
    orderBy: Prisma.PublicationOrderByWithRelationInput[],
  ): Promise<PageResult<PublicationView>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.publication.findMany({ ...pageArgs(query), where, include: publicationInclude, orderBy }),
      this.prisma.publication.count({ where }),
    ])
    return { items: items.map((item) => this.toView(item)), page: query.page, pageSize: query.pageSize, total }
  }

  private async getRecord(tx: DatabaseClient, id: string): Promise<PublicationRecord> {
    const publication = await tx.publication.findUnique({ where: { id }, include: publicationInclude })
    if (!publication) throw new NotFoundException('Publicación no encontrada.')
    return publication
  }

  private async assertReadable(
    publication: PublicationRecord,
    actor: SessionUser,
    allowManage = true,
    tx: DatabaseClient = this.prisma,
  ): Promise<void> {
    if (allowManage && actor.permissions.includes('publications.manage')) return
    if (
      allowManage &&
      publication.authorId === actor.id &&
      actor.permissions.includes('publications.create')
    ) return
    if (!actor.permissions.includes('publications.read')) {
      throw new ForbiddenException('No tienes permiso para leer publicaciones.')
    }
    const now = new Date()
    if (
      publication.status !== PublicationStatus.PUBLISHED ||
      !publication.publishedAt || publication.publishedAt > now ||
      (publication.expiresAt !== null && publication.expiresAt <= now)
    ) {
      throw new ForbiddenException('La publicación no está visible.')
    }
    if (publication.audience === PublicationAudience.ALL) return
    if (publication.audience === PublicationAudience.ROLE && publication.audienceRoleCode && actor.roles.includes(publication.audienceRoleCode)) return
    if (publication.audience === PublicationAudience.PROJECT && publication.projectId) {
      const membership = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: publication.projectId, userId: actor.id } },
        select: { userId: true },
      })
      if (membership) return
    }
    throw new ForbiddenException('La publicación no pertenece a tu audiencia.')
  }

  private assertAuthorOrManage(publication: PublicationRecord, actor: SessionUser): void {
    if (publication.authorId === actor.id && actor.permissions.includes('publications.create')) return
    if (actor.permissions.includes('publications.manage')) return
    throw new ForbiddenException('Sólo el autor o un administrador puede modificar esta publicación.')
  }

  private async assertAudienceReferences(
    tx: DatabaseClient,
    audience: PublicationAudience,
    projectId: string | null,
    roleCode: string | null,
  ): Promise<void> {
    if (audience === PublicationAudience.ALL) {
      if (projectId || roleCode?.trim()) throw new BadRequestException('La audiencia ALL no admite proyecto ni rol.')
      return
    }
    if (audience === PublicationAudience.PROJECT) {
      if (!projectId || roleCode?.trim()) throw new BadRequestException('La audiencia PROJECT requiere sólo projectId.')
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } })
      if (!project) throw new NotFoundException('Proyecto de audiencia no encontrado.')
      return
    }
    if (!roleCode?.trim() || projectId) throw new BadRequestException('La audiencia ROLE requiere sólo audienceRoleCode.')
    const role = await tx.role.findUnique({ where: { code: roleCode.trim() }, select: { id: true } })
    if (!role) throw new NotFoundException('Rol de audiencia no encontrado.')
  }

  private assertDates(scheduledAt: Date | null, expiresAt: Date | null, baseline = new Date()): void {
    if (scheduledAt && scheduledAt <= baseline) throw new BadRequestException('La fecha programada debe estar en el futuro.')
    const effectiveStart = scheduledAt ?? baseline
    if (expiresAt && expiresAt <= effectiveStart) {
      throw new BadRequestException('La fecha de expiración debe ser posterior a la publicación o programación.')
    }
  }

  private assertStatus(status: PublicationStatus, allowed: PublicationStatus[], message: string): void {
    if (!allowed.includes(status)) throw new ConflictException(message)
  }

  private date(value: string | null | undefined): Date | null {
    return value ? new Date(value) : null
  }

  private async audit(
    tx: Prisma.TransactionClient,
    action: string,
    entityId: string,
    actorId: string,
    metadata?: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.auditLog.create({ data: { action, actorId, entityId, entityType: 'Publication', metadata } })
  }

  private rethrowMutationError(error: unknown, conflictMessage: string): never {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof ForbiddenException || error instanceof NotFoundException) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(conflictMessage)
    }
    throw error
  }

  private toView(publication: PublicationRecord): PublicationView {
    return {
      id: publication.id,
      title: publication.title,
      slug: publication.slug,
      summary: publication.summary,
      content: publication.content,
      coverImageUrl: publication.coverImageUrl,
      type: publication.type,
      category: publication.category,
      status: publication.status,
      priority: publication.priority,
      audience: publication.audience,
      audienceRoleCode: publication.audienceRoleCode,
      projectId: publication.projectId,
      projectCode: publication.project?.code ?? null,
      projectName: publication.project?.name ?? null,
      authorId: publication.authorId,
      authorName: publication.author.displayName,
      reviewerId: publication.reviewerId,
      reviewerName: publication.reviewer?.displayName ?? null,
      scheduledAt: iso(publication.scheduledAt),
      publishedAt: iso(publication.publishedAt),
      expiresAt: iso(publication.expiresAt),
      acknowledgementCount: publication._count.acknowledgements,
      generatedTaskCount: publication._count.generatedTasks,
      createdAt: iso(publication.createdAt)!,
      updatedAt: iso(publication.updatedAt)!,
    }
  }

  private toAcknowledgementView(acknowledgement: {
    publicationId: string
    userId: string
    readAt: Date
    user: { displayName: string; email: string }
  }): AcknowledgementView {
    return {
      publicationId: acknowledgement.publicationId,
      userId: acknowledgement.userId,
      userName: acknowledgement.user.displayName,
      userEmail: acknowledgement.user.email,
      readAt: iso(acknowledgement.readAt)!,
    }
  }

  private toTaskView(task: {
    id: string
    projectId: string | null
    title: string
    description: string | null
    status: TaskStatus
    priority: TaskPriority
    recurrence: TaskRecurrence
    creatorId: string
    assigneeId: string | null
    supervisorId: string | null
    sourcePublicationId: string | null
    idempotencyKey: string | null
    dueAt: Date | null
    estimatedMinutes: number | null
    createdAt: Date
    updatedAt: Date
  }): GeneratedTaskView {
    return {
      ...task,
      dueAt: iso(task.dueAt),
      createdAt: iso(task.createdAt)!,
      updatedAt: iso(task.updatedAt)!,
    }
  }
}
