import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import { AppError } from '@campusflow/shared';

export const assessmentsRouter = new Hono();

const assessmentTypeEnum = z.enum(['CAT', 'FAT', 'Quiz', 'Assignment', 'Lab', 'Project', 'Other']);
const assessmentStatusEnum = z.enum(['upcoming', 'completed', 'cancelled']);
const topicSourceEnum = z.enum(['user', 'syllabus', 'question_paper', 'inferred']);

const createAssessmentSchema = z.object({
  courseId: z.string().uuid('courseId must be a valid UUID'),
  title: z.string().min(1, 'Assessment title is required').max(255),
  type: assessmentTypeEnum,
  date: z.string().datetime().optional().nullable(),
  totalMarks: z.number().min(0).optional().nullable(),
  weightage: z.string().max(50).optional().nullable(),
  status: assessmentStatusEnum.optional().nullable(),
});

const updateAssessmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  type: assessmentTypeEnum.optional(),
  date: z.string().datetime().optional().nullable(),
  totalMarks: z.number().min(0).optional().nullable(),
  weightage: z.string().max(50).optional().nullable(),
  status: assessmentStatusEnum.optional(),
});

const linkTopicSchema = z.object({
  topicId: z.string().uuid('topicId must be a valid UUID'),
  weight: z.number().min(0).optional().nullable(),
  source: topicSourceEnum.default('user'),
  notes: z.string().max(1000).optional().nullable(),
});

// GET /api/v1/assessments
assessmentsRouter.get('/', async (c) => {
  const session = getSession(c);
  const courseId = c.req.query('courseId');
  const assessments = await defaultStore.listAssessments(session.userId, courseId);
  return c.json(assessments);
});

// GET /api/v1/assessments/:id
assessmentsRouter.get('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessment = await defaultStore.getAssessment(id, session.userId);
  return c.json(assessment);
});

// POST /api/v1/assessments
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
    totalMarks: parsed.data.totalMarks ?? null,
    weightage: parsed.data.weightage ?? null,
    status: parsed.data.status ?? 'upcoming',
  });

  return c.json(assessment, 201);
});

// PUT /api/v1/assessments/:id
assessmentsRouter.put('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);

  const parsed = updateAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid update assessment payload', parsed.error.format());
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates['title'] = parsed.data.title;
  if (parsed.data.type !== undefined) updates['type'] = parsed.data.type;
  if (parsed.data.date !== undefined)
    updates['date'] = parsed.data.date ? new Date(parsed.data.date) : null;
  if (parsed.data.totalMarks !== undefined) updates['totalMarks'] = parsed.data.totalMarks;
  if (parsed.data.weightage !== undefined) updates['weightage'] = parsed.data.weightage;
  if (parsed.data.status !== undefined) updates['status'] = parsed.data.status;

  const updated = await defaultStore.updateAssessment(id, session.userId, updates);
  return c.json(updated);
});

// DELETE /api/v1/assessments/:id
assessmentsRouter.delete('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.deleteAssessment(id, session.userId);
  return c.json({ success: true, message: 'Assessment deleted.' });
});

// POST /api/v1/assessments/:id/topics
assessmentsRouter.post('/:id/topics', async (c) => {
  const session = getSession(c);
  const assessmentId = c.req.param('id');
  const body = await c.req.json().catch(() => null);

  const parsed = linkTopicSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid link topic payload', parsed.error.format());
  }

  const assessment = await defaultStore.getAssessment(assessmentId, session.userId);

  const link = await defaultStore.linkTopicToAssessment({
    assessmentId,
    topicId: parsed.data.topicId,
    userId: session.userId,
    courseId: assessment.courseId,
    weight: parsed.data.weight ?? null,
    source: parsed.data.source,
    notes: parsed.data.notes ?? null,
  });

  return c.json(link, 201);
});

// GET /api/v1/assessments/:id/topics
assessmentsRouter.get('/:id/topics', async (c) => {
  const session = getSession(c);
  const assessmentId = c.req.param('id');
  const topics = await defaultStore.listTopicsForAssessment(assessmentId, session.userId);
  return c.json(topics);
});

// DELETE /api/v1/assessments/:id/topics/:topicId
assessmentsRouter.delete('/:id/topics/:topicId', async (c) => {
  const session = getSession(c);
  const assessmentId = c.req.param('id');
  const topicId = c.req.param('topicId');
  await defaultStore.unlinkTopicFromAssessment(assessmentId, topicId, session.userId);
  return c.json({ success: true, message: 'Topic unlinked from assessment.' });
});
