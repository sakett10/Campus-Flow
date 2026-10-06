import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import { AppError } from '@campusflow/shared';
import type { ApplicationStatus } from '@campusflow/types';

export const applicationsRouter = new Hono();

const createApplicationSchema = z.object({
  opportunityId: z.string().uuid('opportunityId must be a valid UUID'),
  notes: z.string().optional().nullable(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    'applied',
    'assessment',
    'interview',
    'final_interview',
    'offer',
    'rejection',
    'withdrawn',
  ]),
  notes: z.string().optional().nullable(),
});

// GET /api/v1/applications - list all applications for the authenticated user
applicationsRouter.get('/', async (c) => {
  const session = getSession(c);
  const applications = await defaultStore.listApplicationRecords(session.userId);
  return c.json(applications);
});

// GET /api/v1/applications/:id - get an application record
applicationsRouter.get('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const record = await defaultStore.getApplicationRecord(id, session.userId);

  if (!record) {
    throw new AppError('NOT_FOUND', `Application ${id} not found`, 404);
  }

  return c.json(record);
});

// POST /api/v1/applications - start tracking an application
applicationsRouter.post('/', async (c) => {
  const session = getSession(c);
  const body = await c.req.json();
  const parsed = createApplicationSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid application data', 400, parsed.error.errors);
  }

  // Ensure target opportunity exists
  const opportunity = await defaultStore.getOpportunity(parsed.data.opportunityId);
  if (!opportunity) {
    throw new AppError('NOT_FOUND', `Opportunity ${parsed.data.opportunityId} not found`, 404);
  }

  const record = await defaultStore.createApplicationRecord(
    session.userId,
    parsed.data.opportunityId,
    parsed.data.notes,
  );

  return c.json(record, 201);
});

// PATCH /api/v1/applications/:id - update application outcome status
// State transition model: applied -> assessment -> interview -> final_interview -> offer/rejection/withdrawn
applicationsRouter.patch('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateStatusSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid status update', 400, parsed.error.errors);
  }

  // Verify ownership and existence
  const existing = await defaultStore.getApplicationRecord(id, session.userId);
  if (!existing) {
    throw new AppError('NOT_FOUND', `Application ${id} not found`, 404);
  }

  const updated = await defaultStore.updateApplicationStatus(
    id,
    session.userId,
    parsed.data.status as ApplicationStatus,
    parsed.data.notes,
  );

  return c.json(updated);
});
