import { Hono } from 'hono';
import { getEnv } from '@campusflow/config';
import { S3ObjectStorage } from '@campusflow/shared';
import postgres from 'postgres';
import { Redis } from 'ioredis';

export const healthRouter = new Hono();

interface ServiceHealth {
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  message?: string;
  [key: string]: unknown;
}

// Global cached singletons for health checks to prevent socket exhaustion
let sqlClient: ReturnType<typeof postgres> | null = null;
let redisClient: Redis | null = null;

function getHealthSqlClient(dbUrl: string) {
  if (!sqlClient) {
    sqlClient = postgres(dbUrl, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }
  return sqlClient;
}

function getHealthRedisClient(redisUrl: string) {
  if (!redisClient) {
    const isTls = redisUrl.startsWith('rediss://');
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 15000,
      tls: isTls ? { rejectUnauthorized: false } : undefined,
    });
  }
  return redisClient;
}

healthRouter.get('/', async (c) => {
  const env = getEnv();

  // 1. Application Health
  const appHealth: ServiceHealth = {
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    version: '0.1.0',
  };

  // 2. PostgreSQL Health
  let postgresHealth: ServiceHealth;
  const pgStart = Date.now();
  try {
    const sql = getHealthSqlClient(env.DATABASE_URL);
    await sql`SELECT 1 as health_check;`;
    postgresHealth = {
      status: 'healthy',
      latencyMs: Date.now() - pgStart,
    };
  } catch (err) {
    postgresHealth = {
      status: 'unhealthy',
      latencyMs: Date.now() - pgStart,
      message: (err as Error).message,
    };
  }

  // 3. Redis Health
  let redisHealth: ServiceHealth;
  const redisStart = Date.now();
  try {
    const redis = getHealthRedisClient(env.REDIS_URL);
    if (redis.status !== 'ready') {
      await redis.connect();
    }
    const pong = await redis.ping();
    redisHealth = {
      status: pong === 'PONG' ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - redisStart,
    };
  } catch (err) {
    redisHealth = {
      status: 'unhealthy',
      latencyMs: Date.now() - redisStart,
      message: (err as Error).message,
    };
  }

  // 4. Object Storage Health
  let storageHealth: ServiceHealth;
  const storageStart = Date.now();
  try {
    const storage = new S3ObjectStorage({
      endpoint: env.STORAGE_ENDPOINT,
      bucket: env.STORAGE_BUCKET,
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
      region: env.STORAGE_REGION,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    });
    const check = await storage.checkHealth();
    storageHealth = {
      status: check.ok ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - storageStart,
      type: 's3_compatible',
      ...(check.message ? { message: check.message } : {}),
    };
  } catch (err) {
    storageHealth = {
      status: 'unhealthy',
      latencyMs: Date.now() - storageStart,
      message: (err as Error).message,
    };
  }

  // 5. Ollama Health
  let ollamaHealth: ServiceHealth;
  const ollamaStart = Date.now();
  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL.replace(/\/+$/, '')}/api/version`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = (await res.json()) as { version?: string };
      ollamaHealth = {
        status: 'healthy',
        latencyMs: Date.now() - ollamaStart,
        model: env.AI_MODEL,
        serverVersion: data.version,
      };
    } else {
      ollamaHealth = {
        status: 'unhealthy',
        latencyMs: Date.now() - ollamaStart,
        message: `HTTP ${res.status}`,
      };
    }
  } catch (err) {
    ollamaHealth = {
      status: 'unhealthy',
      latencyMs: Date.now() - ollamaStart,
      message: (err as Error).message,
    };
  }

  const allHealthy =
    postgresHealth.status === 'healthy' &&
    redisHealth.status === 'healthy' &&
    storageHealth.status === 'healthy' &&
    ollamaHealth.status === 'healthy';

  const responsePayload = {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    application: appHealth,
    services: {
      postgres: postgresHealth,
      redis: redisHealth,
      storage: storageHealth,
      ollama: ollamaHealth,
    },
  };

  return c.json(responsePayload, allHealthy ? 200 : 503);
});
