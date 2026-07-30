import { Injectable, type NestMiddleware } from '@nestjs/common'
import { randomBytes, randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { MetricsService } from './metrics.service'
import { RequestContextService, type RequestTelemetryContext } from './request-context.service'
import { StructuredLoggerService } from './structured-logger.service'

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i
const ALL_ZERO_TRACE_ID = /^0{32}$/
const ALL_ZERO_SPAN_ID = /^0{16}$/
const KNOWN_METHODS = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'])

interface RequestWithIdentity extends Request {
  authUser?: { id: string }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function createTraceContext(traceparent: string | undefined): RequestTelemetryContext {
  const match = traceparent?.trim().match(TRACEPARENT_PATTERN)
  const incomingIsValid = Boolean(
    match && !ALL_ZERO_TRACE_ID.test(match[1]) && !ALL_ZERO_SPAN_ID.test(match[2]),
  )

  return {
    requestId: '',
    traceId: incomingIsValid && match ? match[1].toLowerCase() : randomBytes(16).toString('hex'),
    spanId: randomBytes(8).toString('hex'),
    traceFlags: incomingIsValid && match ? match[3].toLowerCase() : '01',
  }
}

function routeLabel(request: Request): string {
  const route = request.route as { path?: unknown } | undefined
  return typeof route?.path === 'string' && route.path.length > 0 ? route.path : 'unmatched'
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly contexts: RequestContextService,
    private readonly logger: StructuredLoggerService,
    private readonly metrics: MetricsService,
  ) {}

  use(request: RequestWithIdentity, response: Response, next: NextFunction): void {
    const suppliedRequestId = firstHeader(request.headers['x-request-id'])?.trim()
    const telemetry = createTraceContext(firstHeader(request.headers.traceparent))
    telemetry.requestId = suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId)
      ? suppliedRequestId.toLowerCase()
      : randomUUID()

    response.setHeader('X-Request-ID', telemetry.requestId)
    response.setHeader(
      'traceparent',
      `00-${telemetry.traceId}-${telemetry.spanId}-${telemetry.traceFlags}`,
    )

    const startedAt = process.hrtime.bigint()
    const method = KNOWN_METHODS.has(request.method) ? request.method : 'OTHER'
    let observed = false
    this.metrics.requestStarted()

    const observe = (aborted: boolean): void => {
      if (observed) return
      observed = true
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
      const statusCode = aborted ? 499 : response.statusCode
      const route = routeLabel(request)
      this.metrics.requestCompleted(method, route, statusCode, durationSeconds)
      const event = {
        event: 'http_request_completed',
        method,
        route,
        statusCode,
        aborted,
        durationMs: Math.round(durationSeconds * 100_000) / 100,
        userId: request.authUser?.id,
      }
      this.contexts.run(telemetry, () => {
        if (statusCode >= 500) this.logger.error(event, undefined, 'HttpAccess')
        else if (statusCode >= 400) this.logger.warn(event, 'HttpAccess')
        else this.logger.log(event, 'HttpAccess')
      })
    }

    request.once('aborted', () => observe(true))
    response.once('finish', () => observe(false))
    response.once('close', () => observe(!response.writableEnded))
    this.contexts.run(telemetry, next)
  }
}
