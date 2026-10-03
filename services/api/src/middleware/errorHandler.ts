import type { ErrorHandler } from 'hono';
import { formatErrorResponse, AppError, createLogger } from '@campusflow/shared';

const logger = createLogger({ module: 'api_error' });

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = (c.get('requestId') as string) || 'unknown';
  const path = c.req.path;

  logger.error(`API Error caught at ${path}: ${err.message}`, err, {
    requestId,
    path,
  });

  const formatted = formatErrorResponse(err, path);
  const status = err instanceof AppError ? err.status : 500;

  c.header('x-request-id', requestId);
  return c.json(formatted, status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
};
