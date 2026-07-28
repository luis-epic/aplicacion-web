import type { SessionUser } from '@opeconca/contracts'
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators'
import type { PageResult } from '../common/page-query.dto'
import {
  CreatePublicationDto,
  GeneratePublicationTasksDto,
  PublicationAcknowledgementQueryDto,
  PublicationFeedQueryDto,
  PublicationQueryDto,
  PublishPublicationDto,
  UpdatePublicationDto,
} from './publications.dto'
import {
  type AcknowledgementView,
  type GeneratedTaskView,
  type PublicationView,
  PublicationsService,
} from './publications.service'

@ApiTags('publications')
@ApiBearerAuth()
@Controller('publications')
export class PublicationsController {
  constructor(private readonly publications: PublicationsService) {}

  @Get('feed')
  @RequirePermissions('publications.read')
  @ApiOperation({ summary: 'Lista publicaciones vigentes visibles para el usuario' })
  feed(
    @Query() query: PublicationFeedQueryDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<PageResult<PublicationView>> {
    return this.publications.feed(query, actor)
  }

  @Get()
  @RequirePermissions('publications.manage')
  @ApiOperation({ summary: 'Lista administrativa paginada y filtrada de publicaciones' })
  list(@Query() query: PublicationQueryDto): Promise<PageResult<PublicationView>> {
    return this.publications.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene una publicación visible o permite acceso administrativo' })
  @ApiForbiddenResponse({ description: 'La publicación no pertenece a la audiencia del usuario.' })
  get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<PublicationView> {
    return this.publications.get(id, actor)
  }

  @Post()
  @RequirePermissions('publications.create')
  @ApiOperation({ summary: 'Crea una publicación en borrador' })
  @ApiConflictResponse({ description: 'El slug ya está en uso.' })
  create(@Body() dto: CreatePublicationDto, @CurrentUser() actor: SessionUser): Promise<PublicationView> {
    return this.publications.create(dto, actor)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza una publicación editable por su autor o un administrador' })
  @ApiConflictResponse({ description: 'El slug está en uso o el estado no permite edición.' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePublicationDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<PublicationView> {
    return this.publications.update(id, dto, actor)
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envía una publicación DRAFT a IN_REVIEW' })
  submit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<PublicationView> {
    return this.publications.submit(id, actor)
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions('publications.publish')
  @ApiOperation({ summary: 'Publica inmediatamente o programa una publicación en revisión' })
  publish(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PublishPublicationDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<PublicationView> {
    return this.publications.publish(id, dto, actor)
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('publications.manage')
  @ApiOperation({ summary: 'Archiva una publicación' })
  archive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<PublicationView> {
    return this.publications.archive(id, actor)
  }

  @Post(':id/acknowledge')
  @HttpCode(200)
  @RequirePermissions('publications.read')
  @ApiOperation({ summary: 'Registra la lectura de una publicación visible' })
  acknowledge(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<AcknowledgementView> {
    return this.publications.acknowledge(id, actor)
  }

  @Get(':id/acknowledgements')
  @RequirePermissions('publications.manage')
  @ApiOperation({ summary: 'Lista las confirmaciones de lectura de una publicación' })
  acknowledgements(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: PublicationAcknowledgementQueryDto,
  ): Promise<PageResult<AcknowledgementView>> {
    return this.publications.acknowledgements(id, query)
  }

  @Post(':id/tasks')
  @RequirePermissions('tasks.create')
  @ApiOperation({ summary: 'Genera una o más tareas vinculadas a una publicación' })
  generateTasks(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: GeneratePublicationTasksDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<GeneratedTaskView[]> {
    return this.publications.generateTasks(id, dto, actor)
  }
}
