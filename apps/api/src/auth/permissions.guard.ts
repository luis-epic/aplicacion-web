import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { PermissionCode } from '@opeconca/contracts'
import { REQUIRED_PERMISSIONS_KEY } from './auth.constants'
import type { AuthenticatedRequest } from './auth.types'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!required?.length) return true

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().authUser
    const allowed = required.every((permission) => user.permissions.includes(permission))
    if (!allowed) throw new ForbiddenException('No tienes permiso para realizar esta acción.')
    return true
  }
}
