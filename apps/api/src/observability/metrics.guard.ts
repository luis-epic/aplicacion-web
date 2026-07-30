import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

function tokenDigest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

function matchesToken(candidate: string, expected: string): boolean {
  return timingSafeEqual(tokenDigest(candidate), tokenDigest(expected))
}

@Injectable()
export class MetricsGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.getOrThrow<boolean>('METRICS_ENABLED')) {
      throw new NotFoundException()
    }
    const expected = this.config.getOrThrow<string>('METRICS_TOKEN')
    const authorization = context.switchToHttp().getRequest<Request>().headers.authorization?.trim()
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    if (!match || !matchesToken(match[1], expected)) {
      throw new UnauthorizedException('Credencial de métricas no válida.')
    }
    return true
  }
}
