import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import { AppError } from '@campusflow/shared';
import type { AcademicNode } from '@campusflow/types';

export const coursesRouter = new Hono();

const createCourseSchema = z.object({
  code: z.string().min(1, 'Course code is required').max(50),
  title: z.string().min(1, 'Course title is required').max(255),
  term: z.string().max(50).optional().nullable(),
});

coursesRouter.get('/', async (c) => {
  const session = getSession(c);
  const courses = await defaultStore.listCourses(session.userId);
  return c.json(courses);
});

coursesRouter.get('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const course = await defaultStore.getCourse(id, session.userId);
  return c.json(course);
});

coursesRouter.post('/', async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);

  const parsed = createCourseSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid course payload', parsed.error.format());
  }

  const course = await defaultStore.createCourse({
    userId: session.userId,
    code: parsed.data.code,
    title: parsed.data.title,
    term: parsed.data.term,
  });

  return c.json(course, 201);
});

coursesRouter.delete('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.deleteCourse(id, session.userId);
  return c.json({ success: true, message: 'Course deleted.' });
});

// Academic Map Endpoints
// GET /api/v1/courses/:id/map
coursesRouter.get('/:id/map', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.getCourse(id, session.userId);
  const nodes = await defaultStore.listAcademicNodesWithResources(id, session.userId);
  return c.json(nodes);
});

// POST /api/v1/courses/:id/map (Bulk create or append nodes)
coursesRouter.post('/:id/map', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.getCourse(id, session.userId);

  const body = await c.req.json().catch(() => null);
  const nodeSchema = z.object({
    parentId: z.string().uuid().optional().nullable(),
    type: z.enum(['module', 'chapter', 'topic']),
    title: z.string().min(1).max(255),
    description: z.string().optional().nullable(),
    orderIndex: z.number().int().default(0),
    origin: z.enum(['model', 'user']).default('user'),
    confidence: z.number().min(0).max(1).optional().nullable(),
    needsReview: z.enum(['yes', 'no']).default('no'),
  });

  const schema = z.object({
    nodes: z.array(nodeSchema),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid nodes payload', parsed.error.format());
  }

  const nodesToInsert = parsed.data.nodes.map((n) => ({
    courseId: id,
    userId: session.userId,
    parentId: n.parentId || null,
    type: n.type,
    title: n.title,
    description: n.description || null,
    orderIndex: n.orderIndex,
    origin: n.origin,
    confidence: n.confidence ?? 1.0,
    needsReview: n.needsReview,
  }));

  const created = await defaultStore.createAcademicNodes(nodesToInsert);
  return c.json(created, 201);
});

// PUT /api/v1/courses/:id/map/nodes/:nodeId (User edit overrides inference)
coursesRouter.put('/:id/map/nodes/:nodeId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const nodeId = c.req.param('nodeId');
  await defaultStore.getCourse(id, session.userId);

  const body = await c.req.json().catch(() => null);
  const editSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional().nullable(),
    needsReview: z.enum(['yes', 'no']).optional(),
    orderIndex: z.number().int().optional(),
    parentId: z.string().uuid().optional().nullable(),
  });

  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid edit node payload', parsed.error.format());
  }

  const updates: Partial<AcademicNode> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.needsReview !== undefined) updates.needsReview = parsed.data.needsReview;
  if (parsed.data.orderIndex !== undefined) updates.orderIndex = parsed.data.orderIndex;
  if (parsed.data.parentId !== undefined) updates.parentId = parsed.data.parentId;

  const updated = await defaultStore.updateAcademicNode(nodeId, session.userId, updates);
  return c.json(updated);
});

// DELETE /api/v1/courses/:id/map/nodes/:nodeId
coursesRouter.delete('/:id/map/nodes/:nodeId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const nodeId = c.req.param('nodeId');
  await defaultStore.getCourse(id, session.userId);
  await defaultStore.deleteAcademicNode(nodeId, session.userId);
  return c.json({ success: true });
});

// POST /api/v1/courses/:id/map/nodes/:nodeId/resources (Link resource to topic)
coursesRouter.post('/:id/map/nodes/:nodeId/resources', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const nodeId = c.req.param('nodeId');
  await defaultStore.getCourse(id, session.userId);

  const body = await c.req.json().catch(() => null);
  const linkSchema = z.object({
    resourceId: z.string().uuid(),
    pageStart: z.number().int().optional().nullable(),
    pageEnd: z.number().int().optional().nullable(),
    relevanceSummary: z.string().optional().nullable(),
  });

  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid link payload', parsed.error.format());
  }

  // Ensure resource exists and belongs to user
  await defaultStore.getResource(parsed.data.resourceId, session.userId);

  const link = await defaultStore.linkResourceToAcademicNode({
    nodeId,
    resourceId: parsed.data.resourceId,
    userId: session.userId,
    courseId: id,
    pageStart: parsed.data.pageStart ?? null,
    pageEnd: parsed.data.pageEnd ?? null,
    relevanceSummary: parsed.data.relevanceSummary ?? null,
    origin: 'user',
  });

  return c.json(link, 201);
});

// DELETE /api/v1/courses/:id/map/links/:linkId (Unlink resource from topic)
coursesRouter.delete('/:id/map/links/:linkId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const linkId = c.req.param('linkId');
  await defaultStore.getCourse(id, session.userId);
  await defaultStore.deleteResourceLink(linkId, session.userId);
  return c.json({ success: true });
});

// Assessment endpoints scoped to course
const assessmentTypeEnum = z.enum(['CAT', 'FAT', 'Quiz', 'Assignment', 'Lab', 'Project', 'Other']);
const assessmentStatusEnum = z.enum(['upcoming', 'completed', 'cancelled']);
const topicSourceEnum = z.enum(['user', 'syllabus', 'question_paper', 'inferred']);

const createCourseAssessmentSchema = z.object({
  title: z.string().min(1, 'Assessment title is required').max(255),
  type: assessmentTypeEnum,
  date: z.string().datetime().optional().nullable(),
  totalMarks: z.number().min(0).optional().nullable(),
  weightage: z.string().max(50).optional().nullable(),
  status: assessmentStatusEnum.optional().nullable(),
});

const updateCourseAssessmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  type: assessmentTypeEnum.optional(),
  date: z.string().datetime().optional().nullable(),
  totalMarks: z.number().min(0).optional().nullable(),
  weightage: z.string().max(50).optional().nullable(),
  status: assessmentStatusEnum.optional(),
});

const linkCourseAssessmentTopicSchema = z.object({
  topicId: z.string().uuid('topicId must be a valid UUID'),
  weight: z.number().min(0).optional().nullable(),
  source: topicSourceEnum.default('user'),
  notes: z.string().max(1000).optional().nullable(),
});

// GET /api/v1/courses/:id/assessments
coursesRouter.get('/:id/assessments', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.getCourse(id, session.userId);
  const assessments = await defaultStore.listAssessments(session.userId, id);
  return c.json(assessments);
});

// POST /api/v1/courses/:id/assessments
coursesRouter.post('/:id/assessments', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.getCourse(id, session.userId);

  const body = await c.req.json().catch(() => null);
  const parsed = createCourseAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid assessment payload', parsed.error.format());
  }

  const assessment = await defaultStore.createAssessment({
    userId: session.userId,
    courseId: id,
    title: parsed.data.title,
    type: parsed.data.type,
    date: parsed.data.date ? new Date(parsed.data.date) : null,
    totalMarks: parsed.data.totalMarks ?? null,
    weightage: parsed.data.weightage ?? null,
    status: parsed.data.status ?? 'upcoming',
  });

  return c.json(assessment, 201);
});

// GET /api/v1/courses/:id/assessments/:assessmentId
coursesRouter.get('/:id/assessments/:assessmentId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessmentId = c.req.param('assessmentId');
  await defaultStore.getCourse(id, session.userId);

  const assessment = await defaultStore.getAssessment(assessmentId, session.userId);
  if (assessment.courseId !== id) {
    throw AppError.notFound('Assessment does not belong to this course.');
  }

  return c.json(assessment);
});

// PUT /api/v1/courses/:id/assessments/:assessmentId
coursesRouter.put('/:id/assessments/:assessmentId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessmentId = c.req.param('assessmentId');
  await defaultStore.getCourse(id, session.userId);

  const existing = await defaultStore.getAssessment(assessmentId, session.userId);
  if (existing.courseId !== id) {
    throw AppError.notFound('Assessment does not belong to this course.');
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateCourseAssessmentSchema.safeParse(body);
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

  const updated = await defaultStore.updateAssessment(assessmentId, session.userId, updates);
  return c.json(updated);
});

// DELETE /api/v1/courses/:id/assessments/:assessmentId
coursesRouter.delete('/:id/assessments/:assessmentId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessmentId = c.req.param('assessmentId');
  await defaultStore.getCourse(id, session.userId);

  const existing = await defaultStore.getAssessment(assessmentId, session.userId);
  if (existing.courseId !== id) {
    throw AppError.notFound('Assessment does not belong to this course.');
  }

  await defaultStore.deleteAssessment(assessmentId, session.userId);
  return c.json({ success: true, message: 'Assessment deleted.' });
});

// POST /api/v1/courses/:id/assessments/:assessmentId/topics
coursesRouter.post('/:id/assessments/:assessmentId/topics', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessmentId = c.req.param('assessmentId');
  await defaultStore.getCourse(id, session.userId);

  const assessment = await defaultStore.getAssessment(assessmentId, session.userId);
  if (assessment.courseId !== id) {
    throw AppError.notFound('Assessment does not belong to this course.');
  }

  const body = await c.req.json().catch(() => null);
  const parsed = linkCourseAssessmentTopicSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid link topic payload', parsed.error.format());
  }

  const link = await defaultStore.linkTopicToAssessment({
    assessmentId,
    topicId: parsed.data.topicId,
    userId: session.userId,
    courseId: id,
    weight: parsed.data.weight ?? null,
    source: parsed.data.source,
    notes: parsed.data.notes ?? null,
  });

  return c.json(link, 201);
});

// DELETE /api/v1/courses/:id/assessments/:assessmentId/topics/:topicId
coursesRouter.delete('/:id/assessments/:assessmentId/topics/:topicId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessmentId = c.req.param('assessmentId');
  const topicId = c.req.param('topicId');
  await defaultStore.getCourse(id, session.userId);

  const assessment = await defaultStore.getAssessment(assessmentId, session.userId);
  if (assessment.courseId !== id) {
    throw AppError.notFound('Assessment does not belong to this course.');
  }

  await defaultStore.unlinkTopicFromAssessment(assessmentId, topicId, session.userId);
  return c.json({ success: true, message: 'Topic unlinked from assessment.' });
});

// ==========================================
// Study State & Study Events Endpoints
// ==========================================

const updateStudyStateSchema = z.object({
  state: z.enum(['not_started', 'learning', 'needs_review', 'reviewed']),
  eventType: z
    .enum(['study_started', 'study_completed', 'reviewed', 'marked_needs_review', 'state_changed'])
    .optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const createStudyEventSchema = z.object({
  type: z.enum([
    'study_started',
    'study_completed',
    'reviewed',
    'marked_needs_review',
    'state_changed',
  ]),
  metadata: z.record(z.unknown()).optional().nullable(),
});

// GET /api/v1/courses/:id/study-state
coursesRouter.get('/:id/study-state', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const states = await defaultStore.listCourseStudyStates(id, session.userId);
  return c.json(states);
});

// GET /api/v1/courses/:id/topics/:topicId/study-state
coursesRouter.get('/:id/topics/:topicId/study-state', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  const state = await defaultStore.getTopicStudyState(id, topicId, session.userId);
  return c.json(state);
});

// PUT /api/v1/courses/:id/topics/:topicId/study-state
coursesRouter.put('/:id/topics/:topicId/study-state', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  const body = await c.req.json().catch(() => null);

  const parsed = updateStudyStateSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid study state payload', parsed.error.format());
  }

  const result = await defaultStore.setTopicStudyState(
    id,
    topicId,
    session.userId,
    parsed.data.state,
    parsed.data.eventType,
    parsed.data.metadata,
  );

  return c.json(result);
});

// GET /api/v1/courses/:id/topics/:topicId/study-events
coursesRouter.get('/:id/topics/:topicId/study-events', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  const events = await defaultStore.listStudyEvents(id, topicId, session.userId);
  return c.json(events);
});

// POST /api/v1/courses/:id/topics/:topicId/study-events
coursesRouter.post('/:id/topics/:topicId/study-events', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  const body = await c.req.json().catch(() => null);

  const parsed = createStudyEventSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid study event payload', parsed.error.format());
  }

  const result = await defaultStore.recordStudyEvent(
    id,
    topicId,
    session.userId,
    parsed.data.type,
    parsed.data.metadata,
  );

  return c.json(result, 201);
});
