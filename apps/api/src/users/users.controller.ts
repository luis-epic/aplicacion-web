import type { SessionUser } from '@opeconca/contracts'
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators'
import { PageQueryDto, type PageResult } from '../common/page-query.dto'
import { CreateUserDto, UpdateUserDto } from './users.dto'
import { UsersService, type RoleView, type UserView } from './users.service'

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Lista usuarios de la organización activa con paginación' })
  list(@Query() query: PageQueryDto, @CurrentUser() actor: SessionUser): Promise<PageResult<UserView>> { return this.users.list(query, actor) }

  @Get('roles')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Lista los roles asignables de la organización activa' })
  listRoles(@CurrentUser() actor: SessionUser): Promise<RoleView[]> { return this.users.listRoles(actor) }

  @Get(':id')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Obtiene un usuario de la organización activa' })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: SessionUser): Promise<UserView> { return this.users.get(id, actor) }

  @Post()
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Crea un usuario y asigna roles' })
  @ApiConflictResponse({ description: 'Correo duplicado.' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: SessionUser): Promise<UserView> { return this.users.create(dto, actor) }

  @Patch(':id')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Actualiza un usuario; cambios de credenciales revocan sesiones' })
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: SessionUser): Promise<UserView> { return this.users.update(id, dto, actor) }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Elimina un usuario sin registros dependientes' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: SessionUser): Promise<void> { return this.users.remove(id, actor) }
}
