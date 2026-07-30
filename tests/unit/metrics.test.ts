import { describe, expect, it } from 'vitest'
import { MetricsService } from '../../apps/api/src/observability/metrics.service'

describe('MetricsService', () => {
  it('tracks RED counters, cumulative histograms and in-flight requests', () => {
    const metrics = new MetricsService()
    metrics.requestStarted()
    metrics.requestStarted()
    metrics.requestCompleted('GET', '/api/v1/projects', 200, 0.02)
    metrics.requestCompleted('POST', '/api/v1/projects', 409, 0.3)

    const rendered = metrics.render()
    expect(rendered).toContain('opeconca_http_requests_in_flight 0')
    expect(rendered).toContain('opeconca_http_requests_total{method="GET",route="/api/v1/projects",status_code="200"} 1')
    expect(rendered).toContain('opeconca_http_requests_total{method="POST",route="/api/v1/projects",status_code="409"} 1')
    expect(rendered).toContain('opeconca_http_request_duration_seconds_bucket{method="GET",route="/api/v1/projects",status_code="200",le="0.025"} 1')
    expect(rendered).toContain('opeconca_http_request_duration_seconds_count{method="POST",route="/api/v1/projects",status_code="409"} 1')
  })

  it('never lets the in-flight gauge become negative', () => {
    const metrics = new MetricsService()
    metrics.requestCompleted('GET', '/health/live', 200, 0.001)
    expect(metrics.render()).toContain('opeconca_http_requests_in_flight 0')
  })

  it('publishes the latest PostgreSQL readiness probe', () => {
    const metrics = new MetricsService()
    metrics.databaseProbeCompleted(true, 0.012)
    expect(metrics.render()).toContain('opeconca_postgresql_up 1')
    expect(metrics.render()).toContain('opeconca_postgresql_probe_duration_seconds 0.012')

    metrics.databaseProbeCompleted(false, 1.25)
    expect(metrics.render()).toContain('opeconca_postgresql_up 0')
    expect(metrics.render()).toContain('opeconca_postgresql_probe_duration_seconds 1.25')
  })

  it('escapes label values before rendering Prometheus text', () => {
    const metrics = new MetricsService()
    metrics.requestStarted()
    metrics.requestCompleted('GET', '/line\n"quoted"', 500, 12)
    const rendered = metrics.render()
    expect(rendered).toContain('route="/line\\n\\"quoted\\""')
    expect(rendered).toContain('le="+Inf"} 1')
  })
})
