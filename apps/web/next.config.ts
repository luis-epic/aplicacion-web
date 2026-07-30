import { config } from 'dotenv'
import type { NextConfig } from 'next'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '../../.env'), quiet: true })

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1'
const apiConnectSource = configuredApiUrl.startsWith('/') ? '' : new URL(configuredApiUrl).origin

const securityHeaders = [
  { key: 'Content-Security-Policy', value: `default-src 'self'; connect-src 'self'${apiConnectSource ? ` ${apiConnectSource}` : ''}; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; base-uri 'self'` },
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
