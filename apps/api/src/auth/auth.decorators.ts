import type { PermissionCode, SessionUser } from '@opeconca/contracts'
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'
import { IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY } from './auth.constants'
import type { AuthenticatedRequest } from './auth.types'

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

export const RequirePermissions = (...permissions: PermissionCode[]) => (
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions)
)

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser => (
    context.switchToHttp().getRequest<AuthenticatedRequest>().authUser
  ),
)
