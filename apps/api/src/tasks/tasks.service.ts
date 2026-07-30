import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, TaskPriority, TaskRecurrence, TaskStatus, UserStatus } from '@prisma/client'
import type { PermissionCode, SessionUser } from '@opeconca/contracts'
import { createHash } from 'node:crypto'
import { type PageResult, pageArgs } from '../common/page-query.dto'
import { iso } from '../common/prisma-errors'
import { PrismaService } from '../database/prisma.service'
import {
  AssignTaskDto,
  CreateChecklistItemDto,
  CreateTaskCommentDto,
  CreateTaskDto,
  TaskAssignmentCandidatesQueryDto,
  TaskQueryDto,
  UpdateChecklistItemDto,
  UpdateTaskDto,
} from './tasks.dto'

const taskInclude = Prisma.validator<Prisma.WorkTaskInclude>()({
  project: { select: { id: true, code: true, name: true } },
  creator: { select: { displayName: true } },
  assignee: { select: { displayName: true } },
  supervisor: { select: { displayName: true } },
  checklist: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
  comments: {
    include: { author: { select: { displayName: true } } },
    orderBy: { createdAt: 'asc' },
  },
})
type TaskRecord = Prisma.WorkTaskGetPayload<{ include: typeof taskInclude }>
type DbClient = Prisma.TransactionClient | PrismaService

type ChecklistRecord = TaskRecord['checklist'][number]
type CommentRecord = TaskRecord['comments'][number]

export interface AssignmentCandidateView {
  id: string
  displayName: string
  email: string
}

export interface ChecklistItemView {
  id: string
  taskId: string
  label: string
  completed: boolean
  position: number
  createdAt: string
  updatedAt: string
}

export interface TaskCommentView {
  id: string
  taskId: string
  authorId: string
  authorName: string
  content: string
  createdAt: string
}

export interface WorkTaskView {
  id: string
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskRecord['priority']
  recurrence: TaskRecord['recurrence']
  creatorId: string
  creatorName: string
  assigneeId: string | null
  assigneeName: string | null
  supervisorId: string | null
  supervisorName: string | null
  sourcePublicationId: string | null
  idempotencyKey: string | null
  dueAt: string | null
  startedAt: string | null
  completedAt: string | null
  estimatedMinutes: number | null
  createdAt: string
  updatedAt: string
  checklist: ChecklistItemView[]
  comments: TaskCommentView[]
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async assignmentCandidates(
    query: TaskAssignmentCandidatesQueryDto,
  ): Promise<PageResult<AssignmentCandidateView>> {
    if (query.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: query.projectId },
        select: { id: true },
      })
      if (!project) throw new NotFoundException('Proyecto no encontrado.')
    }
    const search = query.search?.trim()
    const where: Prisma.UserWhereInput = {
      status: UserStatus.ACTIVE,
      projectMemberships: query.projectId ? { some: { projectId: query.projectId } } : undefined,
      OR: search ? [
        { displayName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ] : undefined,
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        ...pageArgs(query),
        where,
        select: { id: true, displayName: true, email: true },
        orderBy: { displayName: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ])
    return { items, page: query.page, pageSize: query.pageSize, total }
  }

  async list(query: TaskQueryDto, actor: SessionUser): Promise<PageResult<WorkTaskView>> {
    const search = query.search?.trim()
    const restrictToMine = query.mine === true || !this.hasPermission(actor, 'tasks.manage')
    const where: Prisma.WorkTaskWhereInput = {
      projectId: query.projectId,
      status: query.status,
      priority: query.priority,
      AND: [
        restrictToMine ? { OR: [{ creatorId: actor.id }, { assigneeId: actor.id }, { supervisorId: actor.id }] } : {},
        search ? { OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { project: { name: { contains: search, mode: 'insensitive' } } },
          { project: { code: { contains: search, mode: 'insensitive' } } },
        ] } : {},
      ],
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workTask.findMany({
        ...pageArgs(query),
        where,
        include: taskInclude,
        orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.workTask.count({ where }),
    ])
    return { items: items.map((item) => this.toView(item)), page: query.page, pageSize: query.pageSize, total }
  }

  async get(id: string, actor: SessionUser): Promise<WorkTaskView> {
    const task = await this.getRecord(this.prisma, id)
    this.assertCanAccess(task, actor)
    return this.toView(task)
  }

  async create(dto: CreateTaskDto, actor: SessionUser): Promise<WorkTaskView> {
    if (dto.assigneeId || dto.supervisorId) this.assertPermission(actor, 'tasks.assign')
    const fingerprint = this.taskFingerprint(dto)
    const prior = await this.prisma.workTask.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: taskInclude })
    if (prior) return this.resolveIdempotency(prior, dto, actor.id, fingerprint)
    this.assertFutureDueAt(dto.dueAt)

    try {
      const task = await this.prisma.$transaction(async (tx) => {
        await this.validateProjectAndUsers(tx, dto.projectId ?? null, [actor.id, dto.assigneeId, dto.supervisorId])
        const created = await tx.workTask.create({
          data: {
            title: dto.title.trim(),
            description: dto.description?.trim(),
            projectId: dto.projectId,
            creatorId: actor.id,
            assigneeId: dto.assigneeId,
            supervisorId: dto.supervisorId,
            priority: dto.priority,
            recurrence: dto.recurrence,
            dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
            estimatedMinutes: dto.estimatedMinutes,
            idempotencyKey: dto.idempotencyKey,
            idempotencyFingerprint: fingerprint,
          },
          include: taskInclude,
        })
        await this.audit(tx, actor.id, 'task.created', created.id, {
          projectId: dto.projectId ?? null,
          idempotencyKey: dto.idempotencyKey,
        })
        return created
      })
      return this.toView(task)
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) throw error
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.workTask.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: taskInclude })
        if (existing) return this.resolveIdempotency(existing, dto, actor.id, fingerprint)
      }
      throw error
    }
  }

  async update(id: string, dto: UpdateTaskDto, actor: SessionUser): Promise<WorkTaskView> {
    const task = await this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, id)
      const current = await this.getRecord(tx, id)
      this.assertCreatorOrManage(current, actor)
      this.assertMutable(current.status)
      this.assertFutureDueAt(dto.dueAt)
      const projectId = dto.projectId === undefined ? current.projectId : dto.projectId
      if (projectId !== current.projectId) {
        const usersToValidate = [current.assigneeId, current.supervisorId]
        if (!this.hasPermission(actor, 'tasks.manage')) usersToValidate.push(actor.id)
        await this.validateProjectAndUsers(tx, projectId, usersToValidate, false)
      }
      const result = await tx.workTask.updateMany({
        where: { id, status: current.status },
        data: {
          title: dto.title?.trim(),
          description: dto.description === null ? null : dto.description?.trim(),
          projectId: dto.projectId,
          priority: dto.priority,
          recurrence: dto.recurrence,
          dueAt: dto.dueAt === null ? null : dto.dueAt ? new Date(dto.dueAt) : undefined,
          estimatedMinutes: dto.estimatedMinutes,
        },
      })
      if (result.count !== 1) throw new ConflictException('La tarea cambió mientras se actualizaba; vuelve a intentarlo.')
      const updated = await this.getRecord(tx, id)
      await this.audit(tx, actor.id, 'task.updated', id, { fields: Object.keys(dto) })
      return updated
    })
    return this.toView(task)
  }

  async remove(id: string, actor: SessionUser): Promise<void> {
    this.assertPermission(actor, 'tasks.manage')
    await this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, id)
      const task = await this.getRecord(tx, id)
      this.assertStatus(task.status, [TaskStatus.PENDING], 'Sólo pueden eliminarse tareas pendientes.')
      const result = await tx.workTask.deleteMany({ where: { id, status: TaskStatus.PENDING } })
      if (result.count !== 1) throw new ConflictException('La tarea cambió mientras se eliminaba; vuelve a intentarlo.')
      await this.audit(tx, actor.id, 'task.deleted', id, { projectId: task.projectId })
    })
  }

  async assign(id: string, dto: AssignTaskDto, actor: SessionUser): Promise<WorkTaskView> {
    this.assertPermission(actor, 'tasks.assign')
    const task = await this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, id)
      const current = await this.getRecord(tx, id)
      this.assertStatus(current.status, [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED], 'La tarea ya no admite cambios de asignación.')
      const supervisorId = dto.supervisorId === undefined ? current.supervisorId : dto.supervisorId
      await this.validateProjectAndUsers(tx, current.projectId, [dto.assigneeId, supervisorId])
      const result = await tx.workTask.updateMany({
        where: { id, status: current.status },
        data: { assigneeId: dto.assigneeId, supervisorId: dto.supervisorId },
      })
      if (result.count !== 1) throw new ConflictException('La tarea cambió mientras se asignaba; vuelve a intentarlo.')
      const updated = await this.getRecord(tx, id)
      await this.audit(tx, actor.id, 'task.assigned', id, { assigneeId: dto.assigneeId, supervisorId })
      return updated
    })
    return this.toView(task)
  }

  async start(id: string, actor: SessionUser): Promise<WorkTaskView> {
    return this.transition(id, actor, {
      action: 'task.started',
      allowed: [TaskStatus.PENDING, TaskStatus.BLOCKED],
      status: TaskStatus.IN_PROGRESS,
      authorize: (task) => this.assertAssigneeOrPermission(task, actor, 'tasks.complete'),
      data: { startedAt: new Date(), completedAt: null },
      message: 'Sólo puede iniciarse una tarea pendiente o bloqueada.',
    })
  }

  async block(id: string, actor: SessionUser): Promise<WorkTaskView> {
    return this.transition(id, actor, {
      action: 'task.blocked',
      allowed: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
      status: TaskStatus.BLOCKED,
      authorize: (task) => this.assertAssigneeOrPermission(task, actor, 'tasks.complete'),
      data: { completedAt: null },
      message: 'Sólo puede bloquearse una tarea pendiente o en progreso.',
    })
  }

  async complete(id: string, actor: SessionUser): Promise<WorkTaskView> {
    return this.transition(id, actor, {
      action: 'task.completed',
      allowed: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
      status: TaskStatus.COMPLETED,
      authorize: (task) => this.assertAssigneeOrPermission(task, actor, 'tasks.complete'),
      data: { completedAt: new Date() },
      message: 'Sólo puede completarse una tarea en progreso o bloqueada.',
    })
  }

  async cancel(id: string, actor: SessionUser): Promise<WorkTaskView> {
    this.assertPermission(actor, 'tasks.manage')
    return this.transition(id, actor, {
      action: 'task.cancelled',
      allowed: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.IN_REVIEW],
      status: TaskStatus.CANCELLED,
      authorize: () => undefined,
      data: { completedAt: null },
      message: 'Sólo puede cancelarse una tarea abierta.',
    })
  }

  async submitReview(id: string, actor: SessionUser): Promise<WorkTaskView> {
    return this.transition(id, actor, {
      action: 'task.reviewSubmitted',
      allowed: [TaskStatus.IN_PROGRESS],
      status: TaskStatus.IN_REVIEW,
      authorize: (task) => this.assertAssignee(task, actor.id),
      data: { completedAt: null },
      message: 'Sólo puede enviarse a revisión una tarea en progreso.',
    })
  }

  async approve(id: string, actor: SessionUser): Promise<WorkTaskView> {
    this.assertPermission(actor, 'tasks.approve')
    return this.transition(id, actor, {
      action: 'task.approved',
      allowed: [TaskStatus.IN_REVIEW],
      status: TaskStatus.COMPLETED,
      authorize: (task) => {
        if (task.assigneeId === actor.id) throw new ForbiddenException('La persona asignada no puede aprobar su propia tarea.')
      },
      data: { completedAt: new Date() },
      message: 'Sólo puede aprobarse una tarea en revisión.',
    })
  }

  async reopen(id: string, actor: SessionUser): Promise<WorkTaskView> {
    this.assertPermission(actor, 'tasks.approve')
    return this.transition(id, actor, {
      action: 'task.reopened',
      allowed: [TaskStatus.IN_REVIEW, TaskStatus.COMPLETED],
      status: TaskStatus.IN_PROGRESS,
      authorize: () => undefined,
      data: { completedAt: null, startedAt: new Date() },
      message: 'Sólo puede reabrirse una tarea en revisión o completada.',
    })
  }

  async listChecklist(id: string, actor: SessionUser): Promise<ChecklistItemView[]> {
    const task = await this.getRecord(this.prisma, id)
    this.assertCanAccess(task, actor)
    return task.checklist.map((item) => this.toChecklistView(item))
  }

  async getChecklistItemView(taskId: string, itemId: string, actor: SessionUser): Promise<ChecklistItemView> {
    const task = await this.getRecord(this.prisma, taskId)
    this.assertCanAccess(task, actor)
    return this.toChecklistView(await this.getChecklistItem(this.prisma, taskId, itemId))
  }

  async createChecklistItem(id: string, dto: CreateChecklistItemDto, actor: SessionUser): Promise<ChecklistItemView> {
    const item = await this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, id)
      const task = await this.getRecord(tx, id)
      this.assertCreatorOrManage(task, actor)
      this.assertMutable(task.status)
      const created = await tx.taskChecklistItem.create({ data: { taskId: id, label: dto.label.trim(), position: dto.position } })
      await this.audit(tx, actor.id, 'task.checklist.created', id, { itemId: created.id })
      return created
    })
    return this.toChecklistView(item)
  }

  async updateChecklistItem(taskId: string, itemId: string, dto: UpdateChecklistItemDto, actor: SessionUser): Promise<ChecklistItemView> {
    const item = await this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, taskId)
      const task = await this.getRecord(tx, taskId)
      this.assertCreatorOrManage(task, actor)
      this.assertMutable(task.status)
      await this.getChecklistItem(tx, taskId, itemId)
      const updated = await tx.taskChecklistItem.update({ where: { id: itemId }, data: { label: dto.label?.trim(), position: dto.position } })
      await this.audit(tx, actor.id, 'task.checklist.updated', taskId, { itemId, fields: Object.keys(dto) })
      return updated
    })
    return this.toChecklistView(item)
  }

  async toggleChecklistItem(taskId: string, itemId: string, actor: SessionUser): Promise<ChecklistItemView> {
    const item = await this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, taskId)
      const task = await this.getRecord(tx, taskId)
      this.assertMutable(task.status)
      if (task.assigneeId !== actor.id && task.creatorId !== actor.id && !this.hasPermission(actor, 'tasks.manage')) {
        throw new ForbiddenException('Sólo la persona asignada, la creadora o un gestor puede marcar este elemento.')
      }
      const current = await this.getChecklistItem(tx, taskId, itemId)
      const updated = await tx.taskChecklistItem.update({ where: { id: itemId }, data: { completed: !current.completed } })
      await this.audit(tx, actor.id, 'task.checklist.toggled', taskId, { itemId, completed: updated.completed })
      return updated
    })
    return this.toChecklistView(item)
  }

  async removeChecklistItem(taskId: string, itemId: string, actor: SessionUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, taskId)
      const task = await this.getRecord(tx, taskId)
      this.assertCreatorOrManage(task, actor)
      this.assertMutable(task.status)
      await this.getChecklistItem(tx, taskId, itemId)
      await tx.taskChecklistItem.delete({ where: { id: itemId } })
      await this.audit(tx, actor.id, 'task.checklist.deleted', taskId, { itemId })
    })
  }

  async listComments(id: string, actor: SessionUser): Promise<TaskCommentView[]> {
    const task = await this.getRecord(this.prisma, id)
    this.assertCanAccess(task, actor)
    return task.comments.map((comment) => this.toCommentView(comment))
  }

  async createComment(id: string, dto: CreateTaskCommentDto, actor: SessionUser): Promise<TaskCommentView> {
    const comment = await this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, id)
      const task = await this.getRecord(tx, id)
      this.assertCanAccess(task, actor)
      this.assertCommentable(task.status)
      const created = await tx.taskComment.create({
        data: { taskId: id, authorId: actor.id, content: dto.content.trim() },
        include: { author: { select: { displayName: true } } },
      })
      await this.audit(tx, actor.id, 'task.comment.created', id, { commentId: created.id })
      return created
    })
    return this.toCommentView(comment)
  }

  private async transition(
    id: string,
    actor: SessionUser,
    options: {
      action: string
      allowed: TaskStatus[]
      status: TaskStatus
      authorize: (task: TaskRecord) => void
      data: Prisma.WorkTaskUpdateManyMutationInput
      message: string
    },
  ): Promise<WorkTaskView> {
    const task = await this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, id)
      const current = await this.getRecord(tx, id)
      options.authorize(current)
      this.assertStatus(current.status, options.allowed, options.message)
      const result = await tx.workTask.updateMany({
        where: { id, status: current.status },
        data: { ...options.data, status: options.status },
      })
      if (result.count !== 1) throw new ConflictException('La tarea cambió durante la transición; vuelve a intentarlo.')
      const updated = await this.getRecord(tx, id)
      await this.audit(tx, actor.id, options.action, id, { from: current.status, to: options.status })
      return updated
    })
    return this.toView(task)
  }

  private lockTask(tx: Prisma.TransactionClient, id: string): Promise<number> {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`task:${id}`}, 0))`
  }

  private async getRecord(tx: DbClient, id: string): Promise<TaskRecord> {
    const task = await tx.workTask.findUnique({ where: { id }, include: taskInclude })
    if (!task) throw new NotFoundException('Tarea no encontrada.')
    return task
  }

  private async getChecklistItem(tx: DbClient, taskId: string, itemId: string): Promise<ChecklistRecord> {
    const item = await tx.taskChecklistItem.findFirst({ where: { id: itemId, taskId } })
    if (!item) throw new NotFoundException('Elemento de checklist no encontrado.')
    return item
  }

  private async validateProjectAndUsers(
    tx: DbClient,
    projectId: string | null,
    candidateIds: Array<string | null | undefined>,
    requireActive = true,
  ): Promise<void> {
    const userIds = [...new Set(candidateIds.filter((id): id is string => Boolean(id)))]
    if (userIds.length) {
      const users = await tx.user.count({
        where: {
          id: { in: userIds },
          status: requireActive ? UserStatus.ACTIVE : undefined,
        },
      })
      if (users !== userIds.length) {
        throw new NotFoundException(requireActive
          ? 'Uno o más usuarios no existen o no están activos.'
          : 'Uno o más usuarios no existen.')
      }
    }
    if (!projectId) return

    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) throw new NotFoundException('Proyecto no encontrado.')
    if (userIds.length) {
      const memberships = await tx.projectMember.count({ where: { projectId, userId: { in: userIds } } })
      if (memberships !== userIds.length) throw new ForbiddenException('Todas las personas vinculadas a la tarea deben pertenecer al proyecto.')
    }
  }

  private taskFingerprint(dto: CreateTaskDto): string {
    return this.fingerprint({
      sourcePublicationId: null,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? null,
      projectId: dto.projectId ?? null,
      assigneeId: dto.assigneeId ?? null,
      supervisorId: dto.supervisorId ?? null,
      priority: dto.priority ?? TaskPriority.NORMAL,
      recurrence: dto.recurrence ?? TaskRecurrence.NONE,
      dueAt: dto.dueAt ? new Date(dto.dueAt).toISOString() : null,
      estimatedMinutes: dto.estimatedMinutes ?? null,
    })
  }

  private fingerprint(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  }

  private resolveIdempotency(
    task: TaskRecord,
    dto: CreateTaskDto,
    creatorId: string,
    fingerprint: string,
  ): WorkTaskView {
    if (task.creatorId !== creatorId) throw new ConflictException('La clave de idempotencia ya fue utilizada por otro creador.')
    if (task.idempotencyFingerprint) {
      if (task.idempotencyFingerprint !== fingerprint) {
        throw new ConflictException('La clave de idempotencia ya fue utilizada con un contenido diferente.')
      }
      return this.toView(task)
    }
    const dueAt = dto.dueAt ? new Date(dto.dueAt).getTime() : null
    const matchesPayload = (
      task.sourcePublicationId === null &&
      task.title === dto.title.trim() &&
      task.description === (dto.description?.trim() ?? null) &&
      task.projectId === (dto.projectId ?? null) &&
      task.assigneeId === (dto.assigneeId ?? null) &&
      task.supervisorId === (dto.supervisorId ?? null) &&
      task.priority === (dto.priority ?? TaskPriority.NORMAL) &&
      task.recurrence === (dto.recurrence ?? TaskRecurrence.NONE) &&
      (task.dueAt?.getTime() ?? null) === dueAt &&
      task.estimatedMinutes === (dto.estimatedMinutes ?? null)
    )
    if (!matchesPayload) {
      throw new ConflictException('La clave de idempotencia ya fue utilizada con un contenido diferente.')
    }
    return this.toView(task)
  }

  private assertFutureDueAt(value: string | null | undefined): void {
    if (value && new Date(value) <= new Date()) {
      throw new BadRequestException('La fecha de vencimiento debe estar en el futuro.')
    }
  }

  private assertMutable(status: TaskStatus): void {
    this.assertStatus(
      status,
      [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
      'La tarea debe reabrirse antes de modificar sus datos o checklist.',
    )
  }

  private assertCommentable(status: TaskStatus): void {
    this.assertStatus(
      status,
      [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.IN_REVIEW],
      'No pueden agregarse comentarios a una tarea cerrada.',
    )
  }

  private assertCanAccess(task: TaskRecord, actor: SessionUser): void {
    if (
      !this.hasPermission(actor, 'tasks.manage') &&
      task.creatorId !== actor.id &&
      task.assigneeId !== actor.id &&
      task.supervisorId !== actor.id
    ) throw new ForbiddenException('No tienes acceso a esta tarea.')
  }

  private assertCreatorOrManage(task: TaskRecord, actor: SessionUser): void {
    if (task.creatorId !== actor.id && !this.hasPermission(actor, 'tasks.manage')) {
      throw new ForbiddenException('Sólo la persona creadora o un gestor puede modificar esta tarea.')
    }
  }

  private assertAssigneeOrPermission(task: TaskRecord, actor: SessionUser, permission: PermissionCode): void {
    if (task.assigneeId !== actor.id && !this.hasPermission(actor, permission)) {
      throw new ForbiddenException('Sólo la persona asignada o un usuario autorizado puede cambiar este estado.')
    }
  }

  private assertAssignee(task: TaskRecord, actorId: string): void {
    if (!task.assigneeId || task.assigneeId !== actorId) throw new ForbiddenException('Sólo la persona asignada puede enviar la tarea a revisión.')
  }

  private assertPermission(actor: SessionUser, permission: PermissionCode): void {
    if (!this.hasPermission(actor, permission)) throw new ForbiddenException('No tienes permiso para realizar esta acción.')
  }

  private hasPermission(actor: SessionUser, permission: PermissionCode): boolean {
    return actor.permissions.includes(permission)
  }

  private assertStatus(status: TaskStatus, allowed: TaskStatus[], message: string): void {
    if (!allowed.includes(status)) throw new ConflictException(message)
  }

  private audit(tx: Prisma.TransactionClient, actorId: string, action: string, entityId: string, metadata?: Prisma.InputJsonObject): Promise<unknown> {
    return tx.auditLog.create({ data: { actorId, action, entityType: 'WorkTask', entityId, metadata } })
  }

  private toView(task: TaskRecord): WorkTaskView {
    return {
      id: task.id,
      projectId: task.projectId,
      projectCode: task.project?.code ?? null,
      projectName: task.project?.name ?? null,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      recurrence: task.recurrence,
      creatorId: task.creatorId,
      creatorName: task.creator.displayName,
      assigneeId: task.assigneeId,
      assigneeName: task.assignee?.displayName ?? null,
      supervisorId: task.supervisorId,
      supervisorName: task.supervisor?.displayName ?? null,
      sourcePublicationId: task.sourcePublicationId,
      idempotencyKey: task.idempotencyKey,
      dueAt: iso(task.dueAt),
      startedAt: iso(task.startedAt),
      completedAt: iso(task.completedAt),
      estimatedMinutes: task.estimatedMinutes,
      createdAt: iso(task.createdAt)!,
      updatedAt: iso(task.updatedAt)!,
      checklist: task.checklist.map((item) => this.toChecklistView(item)),
      comments: task.comments.map((comment) => this.toCommentView(comment)),
    }
  }

  private toChecklistView(item: ChecklistRecord): ChecklistItemView {
    return {
      id: item.id,
      taskId: item.taskId,
      label: item.label,
      completed: item.completed,
      position: item.position,
      createdAt: iso(item.createdAt)!,
      updatedAt: iso(item.updatedAt)!,
    }
  }

  private toCommentView(comment: CommentRecord): TaskCommentView {
    return {
      id: comment.id,
      taskId: comment.taskId,
      authorId: comment.authorId,
      authorName: comment.author.displayName,
      content: comment.content,
      createdAt: iso(comment.createdAt)!,
    }
  }
}
