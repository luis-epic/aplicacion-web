import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger'

import { Public } from '../auth/auth.decorators'
import { PrismaService } from '../database/prisma.service'
import { MetricsService } from '../observability/metrics.service'
import { StructuredLoggerService } from '../observability/structured-logger.service'

interface LiveHealthResponse {
  status: 'ok'
  service: 'opeconca-api'
  timestamp: string
}

interface ReadyHealthResponse extends LiveHealthResponse {
  dependencies: {
    postgresql: 'up'
  }
}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly logger: StructuredLoggerService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Comprueba que el proceso de la API está activo' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        service: 'opeconca-api',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  live(): LiveHealthResponse {
    return this.baseResponse()
  }

  @Get('ready')
  @ApiOperation({ summary: 'Comprueba que la API y PostgreSQL están disponibles' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        service: 'opeconca-api',
        timestamp: '2026-01-01T00:00:00.000Z',
        dependencies: { postgresql: 'up' },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    schema: {
      example: {
        status: 'error',
        service: 'opeconca-api',
        timestamp: '2026-01-01T00:00:00.000Z',
        dependencies: { postgresql: 'down' },
      },
    },
  })
  async ready(): Promise<ReadyHealthResponse> {
    const startedAt = process.hrtime.bigint()
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`SELECT 1`
        },
        { maxWait: 1_000, timeout: 2_000 },
      )
      this.metrics.databaseProbeCompleted(true, this.elapsedSeconds(startedAt))
    } catch (error) {
      const durationSeconds = this.elapsedSeconds(startedAt)
      this.metrics.databaseProbeCompleted(false, durationSeconds)
      this.logger.error({
        event: 'postgres_readiness_failed',
        durationMs: Math.round(durationSeconds * 100_000) / 100,
        error,
      }, undefined, 'HealthController')
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'opeconca-api',
        timestamp: new Date().toISOString(),
        dependencies: { postgresql: 'down' },
      })
    }

    return {
      ...this.baseResponse(),
      dependencies: { postgresql: 'up' },
    }
  }

  private elapsedSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
  }

  private baseResponse(): LiveHealthResponse {
    return {
      status: 'ok',
      service: 'opeconca-api',
      timestamp: new Date().toISOString(),
    }
  }
}
