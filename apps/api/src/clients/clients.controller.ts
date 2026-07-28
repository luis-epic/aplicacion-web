import type { SessionUser } from '@opeconca/contracts'
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators'
import { PageQueryDto, type PageResult } from '../common/page-query.dto'
import { ClientsService, type ClientView, type ContactView } from './clients.service'
import { CreateClientDto, CreateContactDto, UpdateClientDto, UpdateContactDto } from './clients.dto'

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermissions('clients.read')
  @ApiOperation({ summary: 'Lista clientes con paginación' })
  list(@Query() query: PageQueryDto): Promise<PageResult<ClientView>> { return this.clients.list(query) }

  @Get(':id')
  @RequirePermissions('clients.read')
  @ApiOperation({ summary: 'Obtiene un cliente' })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<ClientView> { return this.clients.get(id) }

  @Post()
  @RequirePermissions('clients.manage')
  @ApiOperation({ summary: 'Crea un cliente' })
  @ApiConflictResponse({ description: 'Identificador fiscal duplicado.' })
  create(@Body() dto: CreateClientDto, @CurrentUser() actor: SessionUser): Promise<ClientView> { return this.clients.create(dto, actor) }

  @Patch(':id')
  @RequirePermissions('clients.manage')
  @ApiOperation({ summary: 'Actualiza un cliente' })
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateClientDto, @CurrentUser() actor: SessionUser): Promise<ClientView> { return this.clients.update(id, dto, actor) }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('clients.manage')
  @ApiOperation({ summary: 'Elimina un cliente sin proyectos asociados' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: SessionUser): Promise<void> { return this.clients.remove(id, actor) }

  @Get(':clientId/contacts')
  @RequirePermissions('clients.read')
  @ApiOperation({ summary: 'Lista los contactos de un cliente' })
  listContacts(@Param('clientId', new ParseUUIDPipe({ version: '4' })) clientId: string, @Query() query: PageQueryDto): Promise<PageResult<ContactView>> { return this.clients.listContacts(clientId, query) }

  @Get(':clientId/contacts/:contactId')
  @RequirePermissions('clients.read')
  @ApiOperation({ summary: 'Obtiene un contacto del cliente' })
  getContact(@Param('clientId', new ParseUUIDPipe({ version: '4' })) clientId: string, @Param('contactId', new ParseUUIDPipe({ version: '4' })) contactId: string): Promise<ContactView> { return this.clients.getContact(clientId, contactId) }

  @Post(':clientId/contacts')
  @RequirePermissions('clients.manage')
  @ApiOperation({ summary: 'Crea un contacto del cliente' })
  createContact(@Param('clientId', new ParseUUIDPipe({ version: '4' })) clientId: string, @Body() dto: CreateContactDto, @CurrentUser() actor: SessionUser): Promise<ContactView> { return this.clients.createContact(clientId, dto, actor) }

  @Patch(':clientId/contacts/:contactId')
  @RequirePermissions('clients.manage')
  @ApiOperation({ summary: 'Actualiza un contacto del cliente' })
  updateContact(@Param('clientId', new ParseUUIDPipe({ version: '4' })) clientId: string, @Param('contactId', new ParseUUIDPipe({ version: '4' })) contactId: string, @Body() dto: UpdateContactDto, @CurrentUser() actor: SessionUser): Promise<ContactView> { return this.clients.updateContact(clientId, contactId, dto, actor) }

  @Delete(':clientId/contacts/:contactId')
  @HttpCode(204)
  @RequirePermissions('clients.manage')
  @ApiOperation({ summary: 'Elimina un contacto del cliente' })
  removeContact(@Param('clientId', new ParseUUIDPipe({ version: '4' })) clientId: string, @Param('contactId', new ParseUUIDPipe({ version: '4' })) contactId: string, @CurrentUser() actor: SessionUser): Promise<void> { return this.clients.removeContact(clientId, contactId, actor) }
}
