import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import { AppError } from '@campusflow/shared';

export const searchRouter = new Hono();

const searchQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  courseId: z.string().uuid().optional().nullable(),
  limit: z.number().int().min(1).max(50).default(20),
});

// GET /api/v1/search?q=...&courseId=...
searchRouter.get('/', async (c) => {
  const session = getSession(c);
  const q = c.req.query('q') || c.req.query('query');
  const courseId = c.req.query('courseId') || null;

  if (!q || !q.trim()) {
    return c.json({
      query: '',
      totalResults: 0,
      results: [],
    });
  }

  const results = await defaultStore.searchChunks(session.userId, q.trim(), courseId);

  return c.json({
    query: q.trim(),
    totalResults: results.length,
    results,
  });
});

// POST /api/v1/search
searchRouter.post('/', async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);

  const parsed = searchQuerySchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid search parameters', parsed.error.format());
  }

  const results = await defaultStore.searchChunks(
    session.userId,
    parsed.data.query.trim(),
    parsed.data.courseId,
  );

  return c.json({
    query: parsed.data.query.trim(),
    totalResults: results.length,
    results: results.slice(0, parsed.data.limit),
  });
});
