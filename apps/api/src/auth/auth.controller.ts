import type { AuthSession, SessionUser } from '@opeconca/contracts'
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { CookieOptions, Request, Response } from 'express'
import { CurrentUser, Public } from './auth.decorators'
import { REFRESH_COOKIE_NAME } from './auth.constants'
import { AuthService } from './auth.service'
import type { RequestContext } from './auth.types'
import { LoginDto } from './dto/login.dto'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicia una sesión' })
  @ApiOkResponse({ description: 'Sesión iniciada; refresh token enviado como cookie HttpOnly.' })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas.' })
  async login(
    @Body() dto: LoginDto,
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    this.assertTrustedOrigin(origin)
    const result = await this.auth.login(dto, this.requestContext(request))
    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt)
    return result.body
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({ summary: 'Rota el refresh token y emite un access token nuevo' })
  async refresh(
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    this.assertTrustedOrigin(origin)
    const result = await this.auth.refresh(
      this.refreshTokenFrom(request),
      this.requestContext(request),
    )
    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt)
    return result.body
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({ summary: 'Revoca la sesión actual' })
  async logout(
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.assertTrustedOrigin(origin)
    await this.auth.logout(this.refreshTokenFrom(request))
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions())
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devuelve el usuario autenticado y sus permisos' })
  @ApiOkResponse({ description: 'Identidad y permisos efectivos.' })
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user
  }

  private assertTrustedOrigin(origin: string | undefined): void {
    if (!origin) return
    const allowedOrigins = [
      this.config.getOrThrow<string>('APP_URL'),
      this.config.getOrThrow<string>('FIELD_APP_URL'),
    ].map((url) => new URL(url).origin)
    if (!allowedOrigins.includes(origin)) {
      throw new ForbiddenException('El origen de la solicitud no está autorizado.')
    }
  }

  private requestContext(request: Request): RequestContext {
    const userAgent = request.get('user-agent')?.slice(0, 512)
    return {
      ipAddress: request.ip?.slice(0, 64),
      userAgent,
    }
  }

  private refreshTokenFrom(request: Request): string | undefined {
    const token = request.cookies?.[REFRESH_COOKIE_NAME] as unknown
    return typeof token === 'string' ? token : undefined
  }

  private setRefreshCookie(response: Response, token: string, expires: Date): void {
    response.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      expires,
    })
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      path: '/api/v1/auth',
      sameSite: 'lax',
      secure: this.config.getOrThrow<string>('NODE_ENV') === 'production',
    }
  }
}
