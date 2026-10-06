import { Hono } from 'hono';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';

export const usersRouter = new Hono();

usersRouter.get('/profile', async (c) => {
  const session = getSession(c);
  let user = await defaultStore.getUser(session.userId);

  if (!user) {
    user = await defaultStore.createUser({
      id: session.userId,
      clerkId: session.clerkUserId,
      email: session.email,
      fullName: null,
      role: session.role,
    });
  }

  return c.json(user);
});
