import type { SessionUser } from '@opeconca/contracts'
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators'
import { PageQueryDto, type PageResult } from '../common/page-query.dto'
import { AddProjectMemberDto, CreateProjectDto, ProjectQueryDto, UpdateProjectDto, UpdateProjectMemberDto } from './projects.dto'
import { ProjectsService, type ProjectMemberView, type ProjectView } from './projects.service'

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermissions('projects.read')
  @ApiOperation({ summary: 'Lista proyectos con filtros y paginación' })
  list(@Query() query: ProjectQueryDto): Promise<PageResult<ProjectView>> { return this.projects.list(query) }

  @Get(':id')
  @RequirePermissions('projects.read')
  @ApiOperation({ summary: 'Obtiene un proyecto' })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<ProjectView> { return this.projects.get(id) }

  @Post()
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'Crea un proyecto' })
  @ApiConflictResponse({ description: 'Código de proyecto duplicado.' })
  create(@Body() dto: CreateProjectDto, @CurrentUser() actor: SessionUser): Promise<ProjectView> { return this.projects.create(dto, actor) }

  @Patch(':id')
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'Actualiza un proyecto' })
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateProjectDto, @CurrentUser() actor: SessionUser): Promise<ProjectView> { return this.projects.update(id, dto, actor) }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'Elimina un proyecto sin reportes asociados' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: SessionUser): Promise<void> { return this.projects.remove(id, actor) }

  @Get(':projectId/members')
  @RequirePermissions('projects.read')
  @ApiOperation({ summary: 'Lista miembros de un proyecto' })
  listMembers(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Query() query: PageQueryDto): Promise<PageResult<ProjectMemberView>> { return this.projects.listMembers(projectId, query) }

  @Get(':projectId/members/:userId')
  @RequirePermissions('projects.read')
  @ApiOperation({ summary: 'Obtiene un miembro del proyecto' })
  getMember(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string): Promise<ProjectMemberView> { return this.projects.getMember(projectId, userId) }

  @Post(':projectId/members')
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'Agrega un miembro al proyecto' })
  addMember(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Body() dto: AddProjectMemberDto, @CurrentUser() actor: SessionUser): Promise<ProjectMemberView> { return this.projects.addMember(projectId, dto, actor) }

  @Patch(':projectId/members/:userId')
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'Cambia el rol de un miembro del proyecto' })
  updateMember(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string, @Body() dto: UpdateProjectMemberDto, @CurrentUser() actor: SessionUser): Promise<ProjectMemberView> { return this.projects.updateMember(projectId, userId, dto, actor) }

  @Delete(':projectId/members/:userId')
  @HttpCode(204)
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'Quita un miembro del proyecto' })
  removeMember(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string, @CurrentUser() actor: SessionUser): Promise<void> { return this.projects.removeMember(projectId, userId, actor) }
}
