import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import { AppError } from '@campusflow/shared';

export const assessmentsRouter = new Hono();

const createAssessmentSchema = z.object({
  courseId: z.string().uuid('courseId must be a valid UUID'),
  title: z.string().min(1, 'Assessment title is required').max(255),
  type: z.enum(['CAT', 'FAT', 'Quiz', 'Assignment', 'Lab', 'Other']),
  date: z.string().datetime().optional().nullable(),
  weightage: z.string().max(10).optional().nullable(),
});

assessmentsRouter.get('/', async (c) => {
  const session = getSession(c);
  const courseId = c.req.query('courseId');
  const assessments = await defaultStore.listAssessments(session.userId, courseId);
  return c.json(assessments);
});

assessmentsRouter.get('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessment = await defaultStore.getAssessment(id, session.userId);
  return c.json(assessment);
});

assessmentsRouter.post('/', async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);

  const parsed = createAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid assessment payload', parsed.error.format());
  }

  const assessment = await defaultStore.createAssessment({
    userId: session.userId,
    courseId: parsed.data.courseId,
    title: parsed.data.title,
    type: parsed.data.type,
    date: parsed.data.date ? new Date(parsed.data.date) : null,
    weightage: parsed.data.weightage,
  });

  return c.json(assessment, 201);
});
