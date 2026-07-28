import { config } from 'dotenv'
import type { NextConfig } from 'next'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '../../.env'), quiet: true })

const apiOrigin = new URL(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
).origin

const securityHeaders = [
  { key: 'Content-Security-Policy', value: `default-src 'self'; connect-src 'self' ${apiOrigin}; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; base-uri 'self'` },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  poweredByHeader: false,
  reactStrictMode: true,
}

export default nextConfig
