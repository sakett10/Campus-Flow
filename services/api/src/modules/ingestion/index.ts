import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import { AppError } from '@campusflow/shared';

export const ingestionRouter = new Hono();

const enqueueIngestionSchema = z.object({
  resourceId: z.string().uuid('resourceId must be a valid UUID'),
});

ingestionRouter.post('/enqueue', async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);

  const parsed = enqueueIngestionSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid ingestion payload', parsed.error.format());
  }

  // Verify resource ownership before enqueueing
  const resource = await defaultStore.getResource(parsed.data.resourceId, session.userId);

  // Return job acknowledgment
  return c.json(
    {
      success: true,
      jobId: `job_${Date.now()}_ingest`,
      resourceId: resource.id,
      status: 'queued',
    },
    202,
  );
});
