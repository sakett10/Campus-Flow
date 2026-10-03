import { Hono } from 'hono';
import { getSession } from '../../middleware/auth.js';
import type { NotificationIntent } from '@campusflow/types';

export const notificationsRouter = new Hono();

notificationsRouter.get('/', async (c) => {
  const session = getSession(c);
  // MVP notification intent feed
  const intents: NotificationIntent[] = [];
  return c.json({
    userId: session.userId,
    intents,
  });
});
