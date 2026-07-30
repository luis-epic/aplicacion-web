import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { RequestContextService } from './request-context.service'
import { StructuredLoggerService } from './structured-logger.service'

function publicResponse(exception: unknown, statusCode: number): Record<string, unknown> {
  if (!(exception instanceof HttpException)) {
    return {
      statusCode,
      error: 'Internal Server Error',
      message: 'Ocurrió un error interno.',
    }
  }
  const response = exception.getResponse()
  if (typeof response === 'string') {
    return { statusCode, message: response }
  }
  return { ...response as Record<string, unknown> }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly contexts: RequestContextService,
    private readonly logger: StructuredLoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<Request>()
    const response = http.getResponse<Response>()
    const statusCode = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR
    const error = exception instanceof Error ? exception : new Error('Excepción no identificada.')
    const logEvent = {
      event: 'http_exception',
      method: request.method,
      path: request.path,
      statusCode,
      exceptionName: error.name,
      exceptionMessage: error.message,
    }

    if (statusCode >= 500) this.logger.error(logEvent, error.stack, 'AllExceptionsFilter')
    else this.logger.warn(logEvent, 'AllExceptionsFilter')

    response.status(statusCode).json({
      ...publicResponse(exception, statusCode),
      timestamp: new Date().toISOString(),
      path: request.path,
      requestId: this.contexts.current?.requestId,
    })
  }
}
