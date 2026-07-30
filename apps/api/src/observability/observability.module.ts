import { Global, Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { AllExceptionsFilter } from './all-exceptions.filter'
import { MetricsController } from './metrics.controller'
import { MetricsGuard } from './metrics.guard'
import { MetricsService } from './metrics.service'
import { RequestContextMiddleware } from './request-context.middleware'
import { RequestContextService } from './request-context.service'
import { StructuredLoggerService } from './structured-logger.service'

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    RequestContextService,
    RequestContextMiddleware,
    StructuredLoggerService,
    MetricsService,
    MetricsGuard,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
  exports: [MetricsService, RequestContextMiddleware, RequestContextService, StructuredLoggerService],
})
export class ObservabilityModule {}
