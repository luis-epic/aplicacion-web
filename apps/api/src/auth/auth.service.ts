import type { AuthSession } from '@opeconca/contracts'
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Prisma, UserStatus } from '@prisma/client'
import { argon2id, hash, verify } from 'argon2'
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../database/prisma.service'
import { toSessionUser, userAccessArgs, type UserWithAccess } from './auth.mapper'
import type { RequestContext } from './auth.types'
import type { LoginDto } from './dto/login.dto'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILED_LOGINS = 5
const PASSWORD_HASH_OPTIONS = {
  memoryCost: 19_456,
  parallelism: 1,
  timeCost: 2,
  type: argon2id,
} as const

interface IssuedSession {
  body: AuthSession
  refreshExpiresAt: Date
  refreshToken: string
}

@Injectable()
export class AuthService {
  private readonly fallbackHash = hash(
    randomBytes(32).toString('hex'),
    PASSWORD_HASH_OPTIONS,
  )

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginDto, context: RequestContext): Promise<IssuedSession> {
    const now = new Date()
    const secret = randomBytes(32).toString('base64url')
    const familyId = randomUUID()
    const refreshExpiresAt = new Date(
      now.getTime() + this.config.getOrThrow<number>('JWT_REFRESH_TTL_DAYS') * 86_400_000,
    )

    const result = await this.prisma.$transaction(async (transaction) => {
      await this.lock(transaction, `login:${dto.email}`)
      const throttle = await transaction.loginThrottle.findUnique({
        where: { email: dto.email },
      })
      if (throttle?.blockedUntil && throttle.blockedUntil > now) {
        return { status: 'blocked' as const }
      }

      let user = await transaction.user.findUnique({
        where: { email: dto.email },
        ...userAccessArgs,
      })
      if (user) {
        await this.lock(transaction, `user:${user.id}`)
        user = await transaction.user.findUnique({
          where: { id: user.id },
          ...userAccessArgs,
        })
      }

      const passwordHash = user?.passwordHash ?? await this.fallbackHash
      const passwordMatches = await verify(passwordHash, dto.password).catch(() => false)
      const succeeded = Boolean(
        user && user.status === UserStatus.ACTIVE && passwordMatches,
      )
      await transaction.loginAttempt.create({
        data: {
          email: dto.email,
          ipAddress: context.ipAddress,
          succeeded,
          userAgent: context.userAgent,
        },
      })

      if (!user || user.status !== UserStatus.ACTIVE || !passwordMatches) {
        const windowExpired = !throttle ||
          throttle.windowStartedAt.getTime() <= now.getTime() - LOGIN_WINDOW_MS
        const failedCount = (windowExpired ? 0 : throttle.failedCount) + 1
        await transaction.loginThrottle.upsert({
          where: { email: dto.email },
          update: {
            blockedUntil: failedCount >= MAX_FAILED_LOGINS
              ? new Date(now.getTime() + LOGIN_WINDOW_MS)
              : null,
            failedCount,
            windowStartedAt: windowExpired ? now : throttle.windowStartedAt,
          },
          create: {
            blockedUntil: failedCount >= MAX_FAILED_LOGINS
              ? new Date(now.getTime() + LOGIN_WINDOW_MS)
              : null,
            email: dto.email,
            failedCount,
            windowStartedAt: now,
          },
        })
        return { status: 'invalid' as const }
      }

      await transaction.loginThrottle.deleteMany({ where: { email: dto.email } })
      const session = await transaction.refreshSession.create({
        data: {
          expiresAt: refreshExpiresAt,
          familyId,
          ipAddress: context.ipAddress,
          tokenHash: this.hashRefreshToken(secret),
          tokenVersion: user.tokenVersion,
          userAgent: context.userAgent,
          userId: user.id,
        },
      })
      await transaction.auditLog.create({
        data: {
          action: 'auth.login.succeeded',
          actorId: user.id,
          entityId: session.id,
          entityType: 'RefreshSession',
          ipAddress: context.ipAddress,
        },
      })
      return { session, status: 'success' as const, user }
    }, { timeout: 15_000 })

    if (result.status === 'blocked') {
      throw new HttpException(
        'Demasiados intentos. Espera 15 minutos antes de volver a intentar.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    if (result.status === 'invalid') {
      throw new UnauthorizedException('Correo o contraseña incorrectos.')
    }

    return {
      body: await this.createAuthBody(result.user, result.session.id),
      refreshExpiresAt,
      refreshToken: `${result.session.id}.${secret}`,
    }
  }

  async refresh(rawToken: string | undefined, context: RequestContext): Promise<IssuedSession> {
    const parsed = this.parseRefreshToken(rawToken)
    if (!parsed) throw new UnauthorizedException('La sesión de renovación no es válida.')

    const initial = await this.prisma.refreshSession.findUnique({
      where: { id: parsed.sessionId },
    })
    if (!initial || !this.matchesRefreshToken(parsed.secret, initial.tokenHash)) {
      throw new UnauthorizedException('La sesión venció o fue revocada.')
    }

    const nextSecret = randomBytes(32).toString('base64url')
    const now = new Date()
    const rotation = await this.prisma.$transaction(async (transaction) => {
      await this.lock(transaction, `session-family:${initial.familyId}`)
      await this.lock(transaction, `user:${initial.userId}`)
      const current = await transaction.refreshSession.findUnique({
        where: { id: parsed.sessionId },
        include: { user: userAccessArgs },
      })
      if (!current || !this.matchesRefreshToken(parsed.secret, current.tokenHash)) {
        return { status: 'invalid' as const }
      }

      const revokeCompromisedFamily = async () => {
        await transaction.refreshSession.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now },
        })
        await transaction.auditLog.create({
          data: {
            action: 'auth.refresh.reuse_detected',
            actorId: current.userId,
            entityId: current.familyId,
            entityType: 'RefreshSessionFamily',
            ipAddress: context.ipAddress,
          },
        })
      }

      if (current.revokedAt) {
        await revokeCompromisedFamily()
        return { status: 'compromised' as const }
      }
      if (
        current.expiresAt <= now ||
        current.user.status !== UserStatus.ACTIVE ||
        current.tokenVersion !== current.user.tokenVersion
      ) {
        return { status: 'invalid' as const }
      }

      const revoked = await transaction.refreshSession.updateMany({
        where: {
          id: current.id,
          revokedAt: null,
          tokenHash: current.tokenHash,
        },
        data: { lastUsedAt: now, revokedAt: now },
      })
      if (revoked.count !== 1) {
        await revokeCompromisedFamily()
        return { status: 'compromised' as const }
      }

      const successor = await transaction.refreshSession.create({
        data: {
          expiresAt: current.expiresAt,
          familyId: current.familyId,
          ipAddress: context.ipAddress,
          tokenHash: this.hashRefreshToken(nextSecret),
          tokenVersion: current.tokenVersion,
          userAgent: context.userAgent,
          userId: current.userId,
        },
      })
      return { session: successor, status: 'success' as const, user: current.user }
    })

    if (rotation.status !== 'success') {
      throw new UnauthorizedException('La sesión venció o fue revocada.')
    }
    return {
      body: await this.createAuthBody(rotation.user, rotation.session.id),
      refreshExpiresAt: rotation.session.expiresAt,
      refreshToken: `${rotation.session.id}.${nextSecret}`,
    }
  }

  async logout(rawToken: string | undefined): Promise<void> {
    const parsed = this.parseRefreshToken(rawToken)
    if (!parsed) return

    const initial = await this.prisma.refreshSession.findUnique({
      where: { id: parsed.sessionId },
    })
    if (!initial || !this.matchesRefreshToken(parsed.secret, initial.tokenHash)) return

    await this.prisma.$transaction(async (transaction) => {
      await this.lock(transaction, `session-family:${initial.familyId}`)
      const presented = await transaction.refreshSession.findUnique({
        where: { id: parsed.sessionId },
      })
      if (!presented || !this.matchesRefreshToken(parsed.secret, presented.tokenHash)) return

      const revoked = await transaction.refreshSession.updateMany({
        where: { familyId: presented.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      if (revoked.count > 0) {
        await transaction.auditLog.create({
          data: {
            action: 'auth.logout',
            actorId: presented.userId,
            entityId: presented.familyId,
            entityType: 'RefreshSessionFamily',
          },
        })
      }
    })
  }

  private async createAuthBody(user: UserWithAccess, sessionId: string): Promise<AuthSession> {
    const expiresIn = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS')
    const accessToken = await this.jwt.signAsync(
      { sid: sessionId, sub: user.id, tokenVersion: user.tokenVersion },
      {
        expiresIn,
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      },
    )

    return { accessToken, expiresIn, user: toSessionUser(user) }
  }

  private async lock(transaction: Prisma.TransactionClient, key: string): Promise<void> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
  }

  private hashRefreshToken(secret: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    ).update(secret).digest('hex')
  }

  private matchesRefreshToken(secret: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashRefreshToken(secret), 'hex')
    const expected = Buffer.from(expectedHash, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }

  private parseRefreshToken(rawToken: string | undefined): {
    sessionId: string
    secret: string
  } | null {
    if (!rawToken) return null
    const [sessionId, secret, extra] = rawToken.split('.')
    if (extra || !sessionId || !secret || !UUID_PATTERN.test(sessionId) || secret.length < 32) {
      return null
    }
    return { sessionId, secret }
  }
}
