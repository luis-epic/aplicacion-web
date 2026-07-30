import { performance } from 'node:perf_hooks'

const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4400/api/v1'
const totalRequests = Number.parseInt(process.env.LOAD_REQUESTS ?? '60', 10)
const concurrency = Number.parseInt(process.env.LOAD_CONCURRENCY ?? '6', 10)
const maxErrorRate = Number.parseFloat(process.env.LOAD_MAX_ERROR_RATE ?? '0.01')
const maxP95Ms = Number.parseFloat(process.env.LOAD_MAX_P95_MS ?? '750')

if (!Number.isInteger(totalRequests) || totalRequests < 1) throw new Error('LOAD_REQUESTS debe ser un entero positivo.')
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > totalRequests) throw new Error('LOAD_CONCURRENCY está fuera de rango.')

const warmup = await fetch(`${baseUrl}/health/ready`)
if (!warmup.ok) throw new Error(`Readiness previo falló con ${warmup.status}.`)

const durations = []
let failures = 0
let cursor = 0
async function worker() {
  while (cursor < totalRequests) {
    const index = cursor++
    const path = index % 3 === 0 ? '/health/ready' : '/health/live'
    const started = performance.now()
    try {
      const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5_000) })
      if (!response.ok) failures += 1
      await response.arrayBuffer()
    } catch {
      failures += 1
    } finally {
      durations.push(performance.now() - started)
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()))

durations.sort((left, right) => left - right)
const percentile = (value) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)]
const result = {
  requests: totalRequests,
  concurrency,
  failures,
  errorRate: failures / totalRequests,
  p50Ms: Math.round(percentile(0.5) * 100) / 100,
  p95Ms: Math.round(percentile(0.95) * 100) / 100,
  maxMs: Math.round(durations.at(-1) * 100) / 100,
  thresholds: { maxErrorRate, maxP95Ms },
}
console.log(JSON.stringify(result, null, 2))
if (result.errorRate > maxErrorRate) throw new Error(`Error rate ${result.errorRate} supera ${maxErrorRate}.`)
if (result.p95Ms > maxP95Ms) throw new Error(`p95 ${result.p95Ms} ms supera ${maxP95Ms} ms.`)
