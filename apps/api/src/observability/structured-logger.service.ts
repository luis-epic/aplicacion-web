import { Injectable, type LoggerService } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RequestContextService } from './request-context.service'

type LogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'warn'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
}
const SENSITIVE_KEY = /authorization|cookie|credential|database.?url|password|secret|token|api.?key/i
const BEARER_VALUE = /bearer\s+[a-z0-9._~+/=-]+/gi
const JWT_VALUE = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g
const URL_CREDENTIALS = /(\w+:\/\/)[^\s/@:]+:[^\s/@]+@/g
const KEY_VALUE_SECRET = /\b(password|passwd|token|secret|api[_-]?key|authorization|cookie)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi

function sanitizeString(value: string): string {
  return value
    .replace(BEARER_VALUE, 'Bearer [REDACTED]')
    .replace(JWT_VALUE, '[REDACTED_JWT]')
    .replace(URL_CREDENTIALS, '$1[REDACTED]@')
    .replace(KEY_VALUE_SECRET, '$1=[REDACTED]')
}

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'bigint') return value.toString()
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : undefined,
    }
  }
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, seen))

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitize(entry, seen),
    ]),
  )
}

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly minimumLevel: LogLevel
  private readonly serviceVersion: string

  constructor(
    config: ConfigService,
    private readonly contexts: RequestContextService,
  ) {
    this.minimumLevel = config.getOrThrow<LogLevel>('LOG_LEVEL')
    this.serviceVersion = config.getOrThrow<string>('SERVICE_VERSION')
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context)
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context)
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context)
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace)
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context)
  }

  private write(level: LogLevel, message: unknown, source?: string, trace?: string): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minimumLevel]) return
    const requestContext = this.contexts.current
    const record = sanitize({
      timestamp: new Date().toISOString(),
      level,
      service: 'opeconca-api',
      serviceVersion: this.serviceVersion,
      source,
      requestId: requestContext?.requestId,
      traceId: requestContext?.traceId,
      spanId: requestContext?.spanId,
      message,
      stack: trace,
    })
    const line = `${JSON.stringify(record)}\n`
    const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout
    stream.write(line)
  }
}
