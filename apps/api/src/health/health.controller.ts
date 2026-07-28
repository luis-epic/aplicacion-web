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
  constructor(private readonly prisma: PrismaService) {}

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
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`SELECT 1`
        },
        { maxWait: 1_000, timeout: 2_000 },
      )
    } catch {
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

  private baseResponse(): LiveHealthResponse {
    return {
      status: 'ok',
      service: 'opeconca-api',
      timestamp: new Date().toISOString(),
    }
  }
}
