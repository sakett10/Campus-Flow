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
  const nodes = await defaultStore.listAcademicNodes(id, session.userId);
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
  const nodeId = c.req.param('nodeId');
  const body = await c.req.json().catch(() => null);

  const editSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional().nullable(),
    needsReview: z.enum(['yes', 'no']).optional(),
  });

  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid edit node payload', parsed.error.format());
  }

  const updates: Partial<AcademicNode> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.needsReview !== undefined) updates.needsReview = parsed.data.needsReview;

  const updated = await defaultStore.updateAcademicNode(nodeId, session.userId, updates);
  return c.json(updated);
});

// DELETE /api/v1/courses/:id/map/nodes/:nodeId
coursesRouter.delete('/:id/map/nodes/:nodeId', async (c) => {
  const session = getSession(c);
  const nodeId = c.req.param('nodeId');
  await defaultStore.deleteAcademicNode(nodeId, session.userId);
  return c.json({ success: true });
});
