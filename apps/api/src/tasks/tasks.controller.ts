import type { SessionUser } from '@opeconca/contracts'
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators'
import type { PageResult } from '../common/page-query.dto'
import {
  AssignTaskDto,
  CreateChecklistItemDto,
  CreateTaskCommentDto,
  CreateTaskDto,
  TaskQueryDto,
  UpdateChecklistItemDto,
  UpdateTaskDto,
} from './tasks.dto'
import { type ChecklistItemView, type TaskCommentView, TasksService, type WorkTaskView } from './tasks.service'

const uuid = () => new ParseUUIDPipe({ version: '4' })

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequirePermissions('tasks.read')
  @ApiOperation({ summary: 'Lista tareas paginadas con filtros y alcance por usuario' })
  list(@Query() query: TaskQueryDto, @CurrentUser() actor: SessionUser): Promise<PageResult<WorkTaskView>> {
    return this.tasks.list(query, actor)
  }

  @Get(':id')
  @RequirePermissions('tasks.read')
  @ApiOperation({ summary: 'Obtiene una tarea con proyecto, personas, checklist y comentarios' })
  get(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.get(id, actor)
  }

  @Post()
  @RequirePermissions('tasks.create')
  @ApiOperation({ summary: 'Crea una tarea mediante una clave de idempotencia' })
  @ApiForbiddenResponse({ description: 'Una persona vinculada no pertenece al proyecto.' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.create(dto, actor)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza metadatos; requiere ser creador o tener tasks.manage' })
  update(@Param('id', uuid()) id: string, @Body() dto: UpdateTaskDto, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.update(id, dto, actor)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('tasks.manage')
  @ApiConflictResponse({ description: 'La tarea no está pendiente.' })
  @ApiOperation({ summary: 'Elimina una tarea pendiente' })
  remove(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<void> {
    return this.tasks.remove(id, actor)
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermissions('tasks.assign')
  @ApiOperation({ summary: 'Asigna la tarea y opcionalmente su supervisor' })
  assign(@Param('id', uuid()) id: string, @Body() dto: AssignTaskDto, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.assign(id, dto, actor)
  }

  @Post(':id/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Inicia la tarea; requiere ser asignado o tener tasks.complete' })
  start(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.start(id, actor)
  }

  @Post(':id/block')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bloquea la tarea; requiere ser asignado o tener tasks.complete' })
  block(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.block(id, actor)
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Completa la tarea; requiere ser asignado o tener tasks.complete' })
  complete(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.complete(id, actor)
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('tasks.manage')
  @ApiOperation({ summary: 'Cancela una tarea abierta' })
  cancel(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.cancel(id, actor)
  }

  @Post(':id/submit-review')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envía a revisión una tarea asignada sin autoaprobarla' })
  submitReview(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.submitReview(id, actor)
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('tasks.approve')
  @ApiOperation({ summary: 'Aprueba una tarea en revisión' })
  approve(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.approve(id, actor)
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @RequirePermissions('tasks.approve')
  @ApiOperation({ summary: 'Reabre una tarea en revisión o completada' })
  reopen(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<WorkTaskView> {
    return this.tasks.reopen(id, actor)
  }

  @Get(':id/checklist')
  @RequirePermissions('tasks.read')
  @ApiOperation({ summary: 'Lista el checklist de una tarea accesible' })
  listChecklist(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<ChecklistItemView[]> {
    return this.tasks.listChecklist(id, actor)
  }

  @Get(':id/checklist/:itemId')
  @RequirePermissions('tasks.read')
  @ApiOperation({ summary: 'Obtiene un elemento del checklist' })
  getChecklistItem(
    @Param('id', uuid()) id: string,
    @Param('itemId', uuid()) itemId: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<ChecklistItemView> {
    return this.tasks.getChecklistItemView(id, itemId, actor)
  }

  @Post(':id/checklist')
  @ApiOperation({ summary: 'Agrega un elemento; requiere ser creador o tener tasks.manage' })
  createChecklistItem(
    @Param('id', uuid()) id: string,
    @Body() dto: CreateChecklistItemDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<ChecklistItemView> {
    return this.tasks.createChecklistItem(id, dto, actor)
  }

  @Patch(':id/checklist/:itemId')
  @ApiOperation({ summary: 'Actualiza un elemento; requiere ser creador o tener tasks.manage' })
  updateChecklistItem(
    @Param('id', uuid()) id: string,
    @Param('itemId', uuid()) itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<ChecklistItemView> {
    return this.tasks.updateChecklistItem(id, itemId, dto, actor)
  }

  @Post(':id/checklist/:itemId/toggle')
  @HttpCode(200)
  @ApiOperation({ summary: 'Alterna el estado completado de un elemento' })
  toggleChecklistItem(
    @Param('id', uuid()) id: string,
    @Param('itemId', uuid()) itemId: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<ChecklistItemView> {
    return this.tasks.toggleChecklistItem(id, itemId, actor)
  }

  @Delete(':id/checklist/:itemId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina un elemento; requiere ser creador o tener tasks.manage' })
  removeChecklistItem(
    @Param('id', uuid()) id: string,
    @Param('itemId', uuid()) itemId: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<void> {
    return this.tasks.removeChecklistItem(id, itemId, actor)
  }

  @Get(':id/comments')
  @RequirePermissions('tasks.read')
  @ApiOperation({ summary: 'Lista los comentarios de una tarea accesible' })
  listComments(@Param('id', uuid()) id: string, @CurrentUser() actor: SessionUser): Promise<TaskCommentView[]> {
    return this.tasks.listComments(id, actor)
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Agrega un comentario a una tarea accesible' })
  createComment(
    @Param('id', uuid()) id: string,
    @Body() dto: CreateTaskCommentDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<TaskCommentView> {
    return this.tasks.createComment(id, dto, actor)
  }
}
