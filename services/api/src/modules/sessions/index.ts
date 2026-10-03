import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { AppError } from '@campusflow/shared';

export const sessionsRouter = new Hono();

const startSessionSchema = z.object({
  topicId: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(180).default(25),
});

sessionsRouter.post('/start', async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);

  const parsed = startSessionSchema.safeParse(body || {});
  if (!parsed.success) {
    throw AppError.badRequest('Invalid session parameters', parsed.error.format());
  }

  return c.json(
    {
      sessionId: `session_${Date.now()}`,
      userId: session.userId,
      status: 'active',
      durationMinutes: parsed.data.durationMinutes,
      startedAt: new Date().toISOString(),
    },
    201,
  );
});
