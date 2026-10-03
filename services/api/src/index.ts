import { serve } from '@hono/node-server';
import { validateEnv } from '@campusflow/config';
import { createLogger } from '@campusflow/shared';
import { createApiApp } from './app.js';

const logger = createLogger({ module: 'server' });

async function startServer() {
  // 1. Strict environment validation at startup
  const env = validateEnv();

  // 2. Instantiate API modular monolith
  const app = createApiApp();

  const port = env.API_PORT;
  logger.info(`Starting CampusFlow API on port ${port}...`);

  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      logger.info(`CampusFlow API successfully listening on http://localhost:${info.port}`);
    },
  );
}

if (process.env['NODE_ENV'] !== 'test') {
  startServer().catch((err) => {
    logger.error('Failed to start CampusFlow API:', err);
    process.exit(1);
  });
}

export { startServer };
