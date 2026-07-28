import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { AccessTokenGuard } from './access-token.guard'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { PermissionsGuard } from './permissions.guard'

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AuthModule {}
