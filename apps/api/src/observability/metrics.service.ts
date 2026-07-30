import { Injectable } from '@nestjs/common'

interface HttpHistogram {
  buckets: number[]
  count: number
  sum: number
}

interface DatabaseProbe {
  durationSeconds: number
  up: 0 | 1
}

const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"')
}

function labels(values: Record<string, string>): string {
  const entries = Object.entries(values)
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(',')
  return `{${entries}}`
}

@Injectable()
export class MetricsService {
  private readonly startedAtSeconds = Date.now() / 1_000
  private readonly requestCounters = new Map<string, number>()
  private readonly requestDurations = new Map<string, HttpHistogram>()
  private databaseProbe: DatabaseProbe = { durationSeconds: 0, up: 0 }
  private requestsInFlight = 0

  requestStarted(): void {
    this.requestsInFlight += 1
  }

  requestCompleted(method: string, route: string, statusCode: number, durationSeconds: number): void {
    this.requestsInFlight = Math.max(0, this.requestsInFlight - 1)
    const metricLabels = labels({ method, route, status_code: String(statusCode) })
    this.requestCounters.set(metricLabels, (this.requestCounters.get(metricLabels) ?? 0) + 1)

    const histogram = this.requestDurations.get(metricLabels) ?? {
      buckets: DURATION_BUCKETS.map(() => 0),
      count: 0,
      sum: 0,
    }
    histogram.count += 1
    histogram.sum += durationSeconds
    DURATION_BUCKETS.forEach((bucket, index) => {
      if (durationSeconds <= bucket) histogram.buckets[index] += 1
    })
    this.requestDurations.set(metricLabels, histogram)
  }

  databaseProbeCompleted(up: boolean, durationSeconds: number): void {
    this.databaseProbe = { up: up ? 1 : 0, durationSeconds }
  }

  render(): string {
    const memory = process.memoryUsage()
    const lines = [
      '# HELP opeconca_process_start_time_seconds Start time of the API process.',
      '# TYPE opeconca_process_start_time_seconds gauge',
      `opeconca_process_start_time_seconds ${this.startedAtSeconds}`,
      '# HELP opeconca_process_uptime_seconds Uptime of the API process.',
      '# TYPE opeconca_process_uptime_seconds gauge',
      `opeconca_process_uptime_seconds ${process.uptime()}`,
      '# HELP opeconca_process_resident_memory_bytes Resident memory used by the API process.',
      '# TYPE opeconca_process_resident_memory_bytes gauge',
      `opeconca_process_resident_memory_bytes ${memory.rss}`,
      '# HELP opeconca_process_heap_used_bytes Heap memory used by the API process.',
      '# TYPE opeconca_process_heap_used_bytes gauge',
      `opeconca_process_heap_used_bytes ${memory.heapUsed}`,
      '# HELP opeconca_http_requests_in_flight Current HTTP requests being processed.',
      '# TYPE opeconca_http_requests_in_flight gauge',
      `opeconca_http_requests_in_flight ${this.requestsInFlight}`,
      '# HELP opeconca_postgresql_up Result of the latest readiness database probe.',
      '# TYPE opeconca_postgresql_up gauge',
      `opeconca_postgresql_up ${this.databaseProbe.up}`,
      '# HELP opeconca_postgresql_probe_duration_seconds Duration of the latest readiness database probe.',
      '# TYPE opeconca_postgresql_probe_duration_seconds gauge',
      `opeconca_postgresql_probe_duration_seconds ${this.databaseProbe.durationSeconds}`,
      '# HELP opeconca_http_requests_total Total completed HTTP requests.',
      '# TYPE opeconca_http_requests_total counter',
    ]

    for (const [metricLabels, count] of this.requestCounters) {
      lines.push(`opeconca_http_requests_total${metricLabels} ${count}`)
    }
    lines.push(
      '# HELP opeconca_http_request_duration_seconds HTTP request duration.',
      '# TYPE opeconca_http_request_duration_seconds histogram',
    )
    for (const [metricLabels, histogram] of this.requestDurations) {
      DURATION_BUCKETS.forEach((bucket, index) => {
        const bucketLabels = metricLabels.replace(/}$/, `,le="${bucket}"}`)
        lines.push(`opeconca_http_request_duration_seconds_bucket${bucketLabels} ${histogram.buckets[index]}`)
      })
      lines.push(
        `opeconca_http_request_duration_seconds_bucket${metricLabels.replace(/}$/, ',le="+Inf"}')} ${histogram.count}`,
        `opeconca_http_request_duration_seconds_sum${metricLabels} ${histogram.sum}`,
        `opeconca_http_request_duration_seconds_count${metricLabels} ${histogram.count}`,
      )
    }
    return `${lines.join('\n')}\n`
  }
}
