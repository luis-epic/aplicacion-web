import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { UserStatus } from '@prisma/client'
import { PrismaService } from '../database/prisma.service'
import { IS_PUBLIC_KEY } from './auth.constants'
import { toSessionUser, userAccessArgs } from './auth.mapper'
import type { AccessTokenPayload, AuthenticatedRequest } from './auth.types'

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const authorization = request.headers.authorization
    const [scheme, token] = authorization?.split(' ') ?? []
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Sesión no válida.')

    let payload: AccessTokenPayload
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('La sesión venció o no es válida.')
    }
    if (!payload.sid || !payload.sub) throw new UnauthorizedException('Sesión no válida.')

    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      include: { user: userAccessArgs },
    })
    const now = new Date()
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.tokenVersion !== payload.tokenVersion ||
      session.user.status !== UserStatus.ACTIVE ||
      session.user.tokenVersion !== payload.tokenVersion
    ) {
      throw new UnauthorizedException('La sesión ya no está activa.')
    }

    request.authUser = toSessionUser(session.user)
    return true
  }
}
