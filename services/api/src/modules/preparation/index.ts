import { Hono } from 'hono';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';

export const preparationRouter = new Hono();

preparationRouter.get('/:assessmentId/state', async (c) => {
  const session = getSession(c);
  const assessmentId = c.req.param('assessmentId');

  const assessment = await defaultStore.getAssessment(assessmentId, session.userId);

  return c.json({
    assessmentId: assessment.id,
    userId: session.userId,
    status: 'not_started',
    coveragePercentage: 0,
    planActive: false,
    evidenceCount: 0,
  });
});
