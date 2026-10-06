import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Database
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),

    // Redis / BullMQ
    REDIS_URL: z.string().url('REDIS_URL must be a valid connection URL'),

    // Clerk Identity
    CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
    CLERK_PUBLISHABLE_KEY: z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required'),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),

    // Object Storage (S3 / MinIO / Cloudflare R2)
    STORAGE_ENDPOINT: z.string().url('STORAGE_ENDPOINT must be a valid URL'),
    STORAGE_BUCKET: z.string().min(1, 'STORAGE_BUCKET is required'),
    STORAGE_ACCESS_KEY: z.string().min(1, 'STORAGE_ACCESS_KEY is required'),
    STORAGE_SECRET_KEY: z.string().min(1, 'STORAGE_SECRET_KEY is required'),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_FORCE_PATH_STYLE: z
      .string()
      .default('true')
      .transform((val) => val === 'true'),

    // AI Provider Abstraction
    AI_PROVIDER: z.enum(['stub', 'gemini', 'openai', 'ollama']).default('stub'),
    AI_PROVIDER_KEY: z.string().optional(),
    OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
    AI_MODEL: z.string().min(1, 'AI_MODEL is required'),

    // Cryptography
    ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters for AES-256'),

    // Networking & Service URLs
    API_PORT: z
      .string()
      .default('3001')
      .transform((val) => parseInt(val, 10)),
    WEB_ORIGIN: z.string().default('http://localhost:3000'),
    ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),

    // Test bypass flag: STRICTLY prohibited in production
    AUTH_TEST_BYPASS: z
      .string()
      .default('false')
      .transform((val) => val === 'true'),
  })
  .refine(
    (data) => {
      if (data.NODE_ENV === 'production' && data.AUTH_TEST_BYPASS === true) {
        return false;
      }
      return true;
    },
    {
      message: 'SECURITY VIOLATION: AUTH_TEST_BYPASS cannot be true when NODE_ENV is production',
      path: ['AUTH_TEST_BYPASS'],
    },
  )
  .refine(
    (data) => {
      if (data.AI_PROVIDER === 'gemini') {
        return Boolean(data.AI_PROVIDER_KEY && data.AI_PROVIDER_KEY.trim().length > 0);
      }
      return true;
    },
    {
      message: 'AI_PROVIDER_KEY is required when AI_PROVIDER is "gemini"',
      path: ['AI_PROVIDER_KEY'],
    },
  );

export type EnvConfig = z.infer<typeof envSchema>;

let parsedEnv: EnvConfig | null = null;

export function validateEnv(inputEnv: Record<string, unknown> = process.env): EnvConfig {
  const result = envSchema.safeParse(inputEnv);

  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(
      `[CampusFlow] Environment validation failed. Required configuration missing or invalid:\n${errorDetails}`,
    );
  }

  parsedEnv = result.data;
  return parsedEnv;
}

export function getEnv(): EnvConfig {
  if (!parsedEnv) {
    return validateEnv(process.env);
  }
  return parsedEnv;
}
