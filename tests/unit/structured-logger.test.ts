import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestContextService } from '../../apps/api/src/observability/request-context.service'
import { StructuredLoggerService } from '../../apps/api/src/observability/structured-logger.service'

type LoggerConfig = ConstructorParameters<typeof StructuredLoggerService>[0]

function config(level = 'debug'): LoggerConfig {
  const values: Record<string, string> = { LOG_LEVEL: level, SERVICE_VERSION: 'test-sha' }
  return { getOrThrow: (key: string) => values[key] } as unknown as LoggerConfig
}

afterEach(() => vi.restoreAllMocks())

describe('StructuredLoggerService', () => {
  it('emits contextual JSON while redacting keys, bearer values, JWTs, URLs and key-value secrets', () => {
    const chunks: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(String(chunk))
      return true
    })
    const contexts = new RequestContextService()
    const logger = new StructuredLoggerService(config(), contexts)

    contexts.run({
      requestId: 'e246ce52-31b2-4b76-9e54-219d59f19d9f',
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: '01',
    }, () => logger.log({
      authorization: 'Bearer raw-token-value',
      password: 'unsafe-password',
      detail: 'Bearer abc.def URL postgresql://admin:db-password@db/opeconca token=plain-value eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
    }, 'LoggerTest'))

    const output = chunks.join('')
    expect(() => JSON.parse(output)).not.toThrow()
    expect(output).toContain('"requestId":"e246ce52-31b2-4b76-9e54-219d59f19d9f"')
    expect(output).toContain('"serviceVersion":"test-sha"')
    expect(output).toContain('[REDACTED]')
    expect(output).toContain('[REDACTED_JWT]')
    for (const secret of ['raw-token-value', 'unsafe-password', 'db-password', 'plain-value', 'eyJhbGciOiJIUzI1NiJ9']) {
      expect(output).not.toContain(secret)
    }
  })

  it('respects the configured minimum log level', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const logger = new StructuredLoggerService(config('warn'), new RequestContextService())
    logger.debug('hidden')
    logger.log('hidden')
    expect(write).not.toHaveBeenCalled()
    logger.warn('visible')
    expect(write).toHaveBeenCalledOnce()
  })

  it('serializes errors, bigint and circular values safely', () => {
    const chunks: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      chunks.push(String(chunk))
      return true
    })
    const logger = new StructuredLoggerService(config(), new RequestContextService())
    const circular: Record<string, unknown> = { count: 1n }
    circular.self = circular
    logger.error({ circular, error: new Error('password=unsafe') })
    const output = chunks.join('')
    expect(output).toContain('"count":"1"')
    expect(output).toContain('[CIRCULAR]')
    expect(output).not.toContain('unsafe')
  })
})
