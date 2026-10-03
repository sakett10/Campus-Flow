import type { MiddlewareHandler } from 'hono';
import { createLogger } from '@campusflow/shared';

const logger = createLogger({ module: 'http' });

export const loggingMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const requestId = (c.get('requestId') as string) || 'unknown';
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const durationMs = Date.now() - start;
  const status = c.res.status;
  const authUser = c.get('authUser') as { userId?: string } | undefined;

  logger.info(`${method} ${path} -> ${status} (${durationMs}ms)`, {
    requestId,
    userId: authUser?.userId,
    method,
    path,
    status,
    durationMs,
  });
};
