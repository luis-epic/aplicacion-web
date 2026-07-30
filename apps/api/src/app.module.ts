import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module'
import { ClientsModule } from './clients/clients.module'
import { validateEnvironment } from './config/environment'
import { DatabaseModule } from './database/database.module'
import { FieldReportsModule } from './field-reports/field-reports.module'
import { HealthController } from './health/health.controller'
import { ObservabilityModule } from './observability/observability.module'
import { ProjectsModule } from './projects/projects.module'
import { PublicationsModule } from './publications/publications.module'
import { TasksModule } from './tasks/tasks.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../../.env', '.env'],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ObservabilityModule,
    ThrottlerModule.forRoot([{ limit: 60, ttl: 60_000 }]),
    DatabaseModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ProjectsModule,
    FieldReportsModule,
    PublicationsModule,
    TasksModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
