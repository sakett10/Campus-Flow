import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import { AppError } from '@campusflow/shared';

export const agentsRouter = new Hono();

const runExamAgentSchema = z.object({
  assessmentId: z.string().uuid('assessmentId must be a valid UUID'),
  action: z.enum(['plan', 'mock', 'replan']),
});

agentsRouter.post('/exam-agent/run', async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);

  const parsed = runExamAgentSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid agent run request', parsed.error.format());
  }

  // Validate assessment ownership
  const assessment = await defaultStore.getAssessment(parsed.data.assessmentId, session.userId);

  const runId = `run_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  return c.json(
    {
      runId,
      packageId: 'exam-agent',
      version: '1.0.0',
      userId: session.userId,
      assessmentId: assessment.id,
      action: parsed.data.action,
      state: 'queued',
      createdAt: new Date().toISOString(),
    },
    202,
  );
});
