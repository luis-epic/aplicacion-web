import type { SessionUser } from '@opeconca/contracts'
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators'
import type { PageResult } from '../common/page-query.dto'
import { CreateFieldReportDto, FieldReportQueryDto, UpdateFieldReportDto } from './field-reports.dto'
import { FieldReportsService, type FieldReportView } from './field-reports.service'

@ApiTags('field-reports')
@ApiBearerAuth()
@Controller('field-reports')
export class FieldReportsController {
  constructor(private readonly reports: FieldReportsService) {}

  @Get()
  @RequirePermissions('fieldReports.read')
  @ApiOperation({ summary: 'Lista reportes de campo de la organización activa con filtros y paginación' })
  list(@Query() query: FieldReportQueryDto, @CurrentUser() actor: SessionUser): Promise<PageResult<FieldReportView>> { return this.reports.list(query, actor) }

  @Get(':id')
  @RequirePermissions('fieldReports.read')
  @ApiOperation({ summary: 'Obtiene un reporte de campo de la organización activa' })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: SessionUser): Promise<FieldReportView> { return this.reports.get(id, actor) }

  @Post()
  @RequirePermissions('fieldReports.create')
  @ApiOperation({ summary: 'Crea un borrador; requiere pertenecer al proyecto y admite idempotencia' })
  @ApiForbiddenResponse({ description: 'El autor no pertenece al proyecto.' })
  create(@Body() dto: CreateFieldReportDto, @CurrentUser() actor: SessionUser): Promise<FieldReportView> { return this.reports.create(dto, actor) }

  @Patch(':id')
  @RequirePermissions('fieldReports.create')
  @ApiOperation({ summary: 'Actualiza un borrador propio' })
  @ApiConflictResponse({ description: 'El reporte ya no está en borrador.' })
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateFieldReportDto, @CurrentUser() actor: SessionUser): Promise<FieldReportView> { return this.reports.update(id, dto, actor) }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('fieldReports.create')
  @ApiOperation({ summary: 'Elimina un borrador propio' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: SessionUser): Promise<void> { return this.reports.remove(id, actor) }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions('fieldReports.create')
  @ApiOperation({ summary: 'Envía un borrador propio a aprobación' })
  submit(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: SessionUser): Promise<FieldReportView> { return this.reports.submit(id, actor) }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('fieldReports.approve')
  @ApiOperation({ summary: 'Aprueba un reporte enviado; el autor no puede autoaprobarse' })
  approve(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: SessionUser): Promise<FieldReportView> { return this.reports.approve(id, actor) }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions('fieldReports.approve')
  @ApiOperation({ summary: 'Rechaza un reporte enviado' })
  reject(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: SessionUser): Promise<FieldReportView> { return this.reports.reject(id, actor) }
}
