import { Hono } from 'hono';
import { getSession } from '../../middleware/auth.js';
import { InMemoryAuditLogger } from '@campusflow/shared';

export const auditRouter = new Hono();
export const globalAuditLogger = new InMemoryAuditLogger();

auditRouter.get('/', async (c) => {
  const session = getSession(c);
  const events = await globalAuditLogger.queryUserAuditEvents(session.userId);
  return c.json({
    userId: session.userId,
    events,
  });
});
