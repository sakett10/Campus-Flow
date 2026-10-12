import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestIdMiddleware } from './middleware/requestId.js';
import { loggingMiddleware } from './middleware/logging.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

// Import modules
import { identityRouter } from './modules/identity/index.js';
import { usersRouter } from './modules/users/index.js';
import { coursesRouter } from './modules/courses/index.js';
import { assessmentsRouter } from './modules/assessments/index.js';
import { resourcesRouter } from './modules/resources/index.js';
import { searchRouter } from './modules/search/index.js';
import { preparationRouter } from './modules/preparation/index.js';
import { sessionsRouter } from './modules/sessions/index.js';
import { agentsRouter } from './modules/agents/index.js';
import { notificationsRouter } from './modules/notifications/index.js';
import { auditRouter } from './modules/audit/index.js';
import { healthRouter } from './modules/health/index.js';
import { opportunitiesRouter } from './modules/opportunities/index.js';
import { careerRouter } from './modules/career/index.js';
import { applicationsRouter } from './modules/applications/index.js';
import { todayRouter } from './modules/today/index.js';
import { examinationRouter } from './modules/examination/index.js';

export function createApiApp() {
  const app = new Hono();

  // 1. Global Pre-Routing Middleware & CORS
  app.use('*', requestIdMiddleware);
  app.use('*', loggingMiddleware);
  app.use(
    '*',
    cors({
      origin: (origin) => {
        const configuredOrigin = process.env['WEB_ORIGIN'] || 'http://localhost:3000';
        if (!origin || origin === configuredOrigin || configuredOrigin === '*') {
          return origin || configuredOrigin;
        }
        if (process.env['NODE_ENV'] !== 'production' && origin.startsWith('http://localhost:')) {
          return origin;
        }
        return configuredOrigin;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'x-test-user-id',
        'x-test-user-role',
        'x-request-id',
      ],
      exposeHeaders: ['x-request-id'],
      credentials: true,
      maxAge: 86400,
    }),
  );
  app.onError(errorHandler);

  // 2. Health & Diagnostic Check (unauthenticated, safe diagnostics)
  app.route('/health', healthRouter);

  // 3. Authenticated Business Modules (Modular Monolith)
  const api = new Hono();
  api.use('*', authMiddleware);

  api.route('/identity', identityRouter);
  api.route('/users', usersRouter);
  api.route('/courses', coursesRouter);
  api.route('/assessments', assessmentsRouter);
  api.route('/resources', resourcesRouter);
  api.route('/search', searchRouter);
  api.route('/preparation', preparationRouter);
  api.route('/sessions', sessionsRouter);
  api.route('/agents', agentsRouter);
  api.route('/notifications', notificationsRouter);
  api.route('/audit', auditRouter);
  api.route('/opportunities', opportunitiesRouter);
  api.route('/career', careerRouter);
  api.route('/applications', applicationsRouter);
  api.route('/today', todayRouter);
  api.route('/examination', examinationRouter);

  app.route('/api/v1', api);

  return app;
}
