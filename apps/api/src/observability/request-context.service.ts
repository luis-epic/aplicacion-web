import { Injectable } from '@nestjs/common'
import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestTelemetryContext {
  requestId: string
  spanId: string
  traceFlags: string
  traceId: string
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestTelemetryContext>()

  get current(): RequestTelemetryContext | undefined {
    return this.storage.getStore()
  }

  run(context: RequestTelemetryContext, callback: () => void): void {
    this.storage.run(context, callback)
  }
}
