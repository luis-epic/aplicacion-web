import { z } from 'zod'

const secretSchema = z.string()
  .min(32)
  .refine((value) => !value.startsWith('replace-with-'), 'No puede usarse un secreto de ejemplo.')

const booleanSchema = z.preprocess((value) => {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false' || value === undefined) return false
  return value
}, z.boolean())

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  JWT_ACCESS_SECRET: secretSchema,
  JWT_REFRESH_SECRET: secretSchema,
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(300).max(3_600).default(900),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  APP_URL: z.string().url().default('http://localhost:3000'),
  FIELD_APP_URL: z.string().url().default('http://localhost:5173'),
  PUBLICATION_MEDIA_ROOT: z.string().trim().min(1).default('/app/media/publications'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SERVICE_VERSION: z.string().trim().min(1).max(128).default('development'),
  METRICS_ENABLED: booleanSchema.default(false),
  METRICS_TOKEN: z.preprocess(
    (value) => value === '' ? undefined : value,
    secretSchema.optional(),
  ),
}).superRefine((environment, context) => {
  if (environment.JWT_ACCESS_SECRET === environment.JWT_REFRESH_SECRET) {
    context.addIssue({
      code: 'custom',
      message: 'JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser diferentes.',
      path: ['JWT_REFRESH_SECRET'],
    })
  }
  if (environment.METRICS_ENABLED && !environment.METRICS_TOKEN) {
    context.addIssue({
      code: 'custom',
      message: 'METRICS_TOKEN es obligatorio cuando las métricas están habilitadas.',
      path: ['METRICS_TOKEN'],
    })
  }
  if (environment.NODE_ENV === 'production') {
    for (const key of ['APP_URL', 'FIELD_APP_URL'] as const) {
      if (new URL(environment[key]).protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          message: `${key} debe usar HTTPS en producción.`,
          path: [key],
        })
      }
    }
  }
})

export function validateEnvironment(input: Record<string, unknown>): Record<string, unknown> {
  const parsed = environmentSchema.safeParse(input)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'entorno'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Configuración de entorno inválida: ${details}`)
  }

  return { ...input, ...parsed.data }
}
