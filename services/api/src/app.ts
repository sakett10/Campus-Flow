import { Hono } from 'hono';
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
import { ingestionRouter } from './modules/ingestion/index.js';
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

export function createApiApp() {
  const app = new Hono();

  // 1. Global Pre-Routing Middleware
  app.use('*', requestIdMiddleware);
  app.use('*', loggingMiddleware);
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
  api.route('/ingestion', ingestionRouter);
  api.route('/search', searchRouter);
  api.route('/preparation', preparationRouter);
  api.route('/sessions', sessionsRouter);
  api.route('/agents', agentsRouter);
  api.route('/notifications', notificationsRouter);
  api.route('/audit', auditRouter);
  api.route('/opportunities', opportunitiesRouter);
  api.route('/career', careerRouter);
  api.route('/applications', applicationsRouter);

  app.route('/api/v1', api);

  return app;
}
