import { describe, expect, it } from 'vitest'
import { validateEnvironment } from '../../apps/api/src/config/environment'

const validEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/opeconca_test',
  JWT_ACCESS_SECRET: 'access-secret-that-is-longer-than-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-that-is-different-and-long-enough',
  APP_URL: 'http://localhost:3000',
  FIELD_APP_URL: 'http://localhost:5173',
}

describe('validateEnvironment', () => {
  it('applies safe defaults to a valid non-production environment', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      LOG_LEVEL: 'info',
      METRICS_ENABLED: false,
      PORT: 4000,
      SERVICE_VERSION: 'development',
    })
  })

  it('requires HTTPS for both public applications in production', () => {
    expect(() => validateEnvironment({ ...validEnvironment, NODE_ENV: 'production' }))
      .toThrow(/APP_URL debe usar HTTPS.*FIELD_APP_URL debe usar HTTPS/)
  })

  it('accepts distinct HTTPS production origins', () => {
    expect(validateEnvironment({
      ...validEnvironment,
      NODE_ENV: 'production',
      APP_URL: 'https://portal.example.test',
      FIELD_APP_URL: 'https://field.example.test',
    })).toMatchObject({ NODE_ENV: 'production' })
  })

  it('rejects reused JWT secrets', () => {
    expect(() => validateEnvironment({
      ...validEnvironment,
      JWT_REFRESH_SECRET: validEnvironment.JWT_ACCESS_SECRET,
    })).toThrow(/deben ser diferentes/)
  })

  it('requires a dedicated metrics token when metrics are enabled', () => {
    expect(() => validateEnvironment({ ...validEnvironment, METRICS_ENABLED: 'true' }))
      .toThrow(/METRICS_TOKEN es obligatorio/)

    expect(validateEnvironment({
      ...validEnvironment,
      METRICS_ENABLED: 'true',
      METRICS_TOKEN: 'metrics-token-that-is-dedicated-and-long-enough',
    })).toMatchObject({ METRICS_ENABLED: true })
  })

  it('rejects example and short secrets', () => {
    expect(() => validateEnvironment({
      ...validEnvironment,
      JWT_ACCESS_SECRET: 'replace-with-an-example-secret-that-is-long',
    })).toThrow(/No puede usarse un secreto de ejemplo/)
    expect(() => validateEnvironment({ ...validEnvironment, JWT_ACCESS_SECRET: 'short' }))
      .toThrow(/Too small|32/)
  })
})
