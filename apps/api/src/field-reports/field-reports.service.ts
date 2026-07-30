import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, ReportStatus } from '@prisma/client'
import type { SessionUser } from '@opeconca/contracts'
import { requireActiveOrganizationId } from '../common/organization-context'
import { PrismaService } from '../database/prisma.service'
import { type PageResult, pageArgs } from '../common/page-query.dto'
import { iso, isoDate } from '../common/prisma-errors'
import { CreateFieldReportDto, FieldReportQueryDto, UpdateFieldReportDto } from './field-reports.dto'

const reportInclude = Prisma.validator<Prisma.FieldReportInclude>()({
  project: { select: { code: true, name: true } },
  author: { select: { displayName: true } },
  approver: { select: { displayName: true } },
})
type ReportRecord = Prisma.FieldReportGetPayload<{ include: typeof reportInclude }>

export interface FieldReportView {
  id: string
  projectId: string
  projectCode: string
  projectName: string
  authorId: string
  authorName: string
  approverId: string | null
  approverName: string | null
  reportDate: string
  summary: string
  personnelCount: number
  weatherNotes: string | null
  weatherSnapshot: Prisma.JsonValue
  incidentNotes: string | null
  status: ReportStatus
  submittedAt: string | null
  approvedAt: string | null
  clientUpdatedAt: string
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

@Injectable()
export class FieldReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: FieldReportQueryDto): Promise<PageResult<FieldReportView>> {
    const search = query.search?.trim()
    const where: Prisma.FieldReportWhereInput = {
      projectId: query.projectId,
      authorId: query.authorId,
      status: query.status,
      OR: search ? [
        { summary: { contains: search, mode: 'insensitive' } },
        { project: { name: { contains: search, mode: 'insensitive' } } },
        { project: { code: { contains: search, mode: 'insensitive' } } },
      ] : undefined,
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fieldReport.findMany({ ...pageArgs(query), where, include: reportInclude, orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.fieldReport.count({ where }),
    ])
    return { items: items.map((item) => this.toView(item)), page: query.page, pageSize: query.pageSize, total }
  }

  async get(id: string): Promise<FieldReportView> {
    return this.toView(await this.getRecord(this.prisma, id))
  }

  async create(dto: CreateFieldReportDto, actor: SessionUser): Promise<FieldReportView> {
    const organizationId = await requireActiveOrganizationId(this.prisma, actor)
    const prior = await this.prisma.fieldReport.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: reportInclude })
    if (prior) return this.resolveIdempotency(prior, actor.id)

    try {
      const report = await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: dto.projectId, organizationId },
          select: { id: true },
        })
        if (!project) throw new NotFoundException('Proyecto no encontrado.')
        const membership = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: dto.projectId, userId: actor.id } } })
        if (!membership) throw new ForbiddenException('Debes pertenecer al proyecto para crear reportes.')
        const created = await tx.fieldReport.create({
          data: {
            organizationId,
            projectId: dto.projectId,
            authorId: actor.id,
            reportDate: this.reportDate(dto.reportDate),
            summary: dto.summary.trim(),
            personnelCount: dto.personnelCount,
            weatherNotes: dto.weatherNotes?.trim(),
            weatherSnapshot: dto.weatherSnapshot as Prisma.InputJsonValue | undefined,
            incidentNotes: dto.incidentNotes?.trim(),
            clientUpdatedAt: new Date(dto.clientUpdatedAt),
            idempotencyKey: dto.idempotencyKey,
          },
          include: reportInclude,
        })
        await tx.auditLog.create({ data: { action: 'fieldReport.created', actorId: actor.id, entityId: created.id, entityType: 'FieldReport', metadata: { projectId: dto.projectId, idempotencyKey: dto.idempotencyKey } } })
        return this.getRecord(tx, created.id)
      })
      return this.toView(report)
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) throw error
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.fieldReport.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: reportInclude })
        if (existing) return this.resolveIdempotency(existing, actor.id)
      }
      throw error
    }
  }

  async update(id: string, dto: UpdateFieldReportDto, actor: SessionUser): Promise<FieldReportView> {
    const report = await this.prisma.$transaction(async (tx) => {
      const current = await this.getRecord(tx, id)
      this.assertAuthor(current, actor.id)
      this.assertStatus(current.status, [ReportStatus.DRAFT], 'Sólo puede editarse un reporte en borrador.')
      const updated = await tx.fieldReport.update({ where: { id }, data: {
        reportDate: dto.reportDate ? this.reportDate(dto.reportDate) : undefined,
        summary: dto.summary?.trim(),
        personnelCount: dto.personnelCount,
        weatherNotes: dto.weatherNotes === null ? null : dto.weatherNotes?.trim(),
        weatherSnapshot: dto.weatherSnapshot === null ? Prisma.DbNull : dto.weatherSnapshot as Prisma.InputJsonValue | undefined,
        incidentNotes: dto.incidentNotes === null ? null : dto.incidentNotes?.trim(),
        clientUpdatedAt: new Date(dto.clientUpdatedAt),
      }, include: reportInclude })
      await tx.auditLog.create({ data: { action: 'fieldReport.updated', actorId: actor.id, entityId: id, entityType: 'FieldReport', metadata: { fields: Object.keys(dto) } } })
      return updated
    })
    return this.toView(report)
  }

  async remove(id: string, actor: SessionUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const report = await this.getRecord(tx, id)
      this.assertAuthor(report, actor.id)
      this.assertStatus(report.status, [ReportStatus.DRAFT], 'Sólo puede eliminarse un reporte en borrador.')
      await tx.fieldReport.delete({ where: { id } })
      await tx.auditLog.create({ data: { action: 'fieldReport.deleted', actorId: actor.id, entityId: id, entityType: 'FieldReport', metadata: { projectId: report.projectId } } })
    })
  }

  async submit(id: string, actor: SessionUser): Promise<FieldReportView> {
    const report = await this.prisma.$transaction(async (tx) => {
      const current = await this.getRecord(tx, id)
      this.assertAuthor(current, actor.id)
      this.assertStatus(current.status, [ReportStatus.DRAFT], 'Sólo puede enviarse un reporte en borrador.')
      const updated = await tx.fieldReport.update({ where: { id }, data: { status: ReportStatus.SUBMITTED, submittedAt: new Date(), approverId: null, approvedAt: null }, include: reportInclude })
      await tx.auditLog.create({ data: { action: 'fieldReport.submitted', actorId: actor.id, entityId: id, entityType: 'FieldReport' } })
      return updated
    })
    return this.toView(report)
  }

  async approve(id: string, actor: SessionUser): Promise<FieldReportView> {
    const report = await this.prisma.$transaction(async (tx) => {
      const current = await this.getRecord(tx, id)
      if (current.authorId === actor.id) throw new ForbiddenException('No puedes aprobar tu propio reporte.')
      this.assertStatus(current.status, [ReportStatus.SUBMITTED], 'Sólo puede aprobarse un reporte enviado.')
      const updated = await tx.fieldReport.update({ where: { id }, data: { status: ReportStatus.APPROVED, approverId: actor.id, approvedAt: new Date() }, include: reportInclude })
      await tx.auditLog.create({ data: { action: 'fieldReport.approved', actorId: actor.id, entityId: id, entityType: 'FieldReport' } })
      return updated
    })
    return this.toView(report)
  }

  async reject(id: string, actor: SessionUser): Promise<FieldReportView> {
    const report = await this.prisma.$transaction(async (tx) => {
      const current = await this.getRecord(tx, id)
      this.assertStatus(current.status, [ReportStatus.SUBMITTED], 'Sólo puede rechazarse un reporte enviado.')
      const updated = await tx.fieldReport.update({ where: { id }, data: { status: ReportStatus.REJECTED, approverId: actor.id, approvedAt: null }, include: reportInclude })
      await tx.auditLog.create({ data: { action: 'fieldReport.rejected', actorId: actor.id, entityId: id, entityType: 'FieldReport' } })
      return updated
    })
    return this.toView(report)
  }

  private async getRecord(tx: Prisma.TransactionClient | PrismaService, id: string): Promise<ReportRecord> {
    const report = await tx.fieldReport.findUnique({ where: { id }, include: reportInclude })
    if (!report) throw new NotFoundException('Reporte de campo no encontrado.')
    return report
  }

  private resolveIdempotency(report: ReportRecord, authorId: string): FieldReportView {
    if (report.authorId !== authorId) throw new ConflictException('La clave de idempotencia ya fue utilizada por otro autor.')
    return this.toView(report)
  }

  private assertAuthor(report: ReportRecord, userId: string): void {
    if (report.authorId !== userId) throw new ForbiddenException('Sólo el autor puede modificar este reporte.')
  }

  private assertStatus(status: ReportStatus, allowed: ReportStatus[], message: string): void {
    if (!allowed.includes(status)) throw new ConflictException(message)
  }

  private reportDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`)
  }

  private toView(report: ReportRecord): FieldReportView {
    return {
      id: report.id, projectId: report.projectId, projectCode: report.project.code, projectName: report.project.name,
      authorId: report.authorId, authorName: report.author.displayName,
      approverId: report.approverId, approverName: report.approver?.displayName ?? null,
      reportDate: isoDate(report.reportDate), summary: report.summary, personnelCount: report.personnelCount,
      weatherNotes: report.weatherNotes, weatherSnapshot: report.weatherSnapshot,
      incidentNotes: report.incidentNotes, status: report.status,
      submittedAt: iso(report.submittedAt), approvedAt: iso(report.approvedAt), clientUpdatedAt: iso(report.clientUpdatedAt)!,
      idempotencyKey: report.idempotencyKey, createdAt: iso(report.createdAt)!, updatedAt: iso(report.updatedAt)!,
    }
  }
}
