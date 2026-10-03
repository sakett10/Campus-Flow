import { Hono } from 'hono';
import { getSession } from '../../middleware/auth.js';

export const identityRouter = new Hono();

identityRouter.get('/me', async (c) => {
  const session = getSession(c);
  return c.json({
    userId: session.userId,
    clerkUserId: session.clerkUserId,
    email: session.email,
    role: session.role,
  });
});
