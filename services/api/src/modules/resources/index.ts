import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import {
  AppError,
  type ObjectStorage,
  type OutboxStore,
  createObjectStorageFromEnv,
  normalizeFileName,
  validateFileBytes,
  INGESTION_LIMITS,
  TransactionalOutboxManager,
  InMemoryOutboxStore,
} from '@campusflow/shared';
import { PostgresOutboxStore } from '@campusflow/database';

export function createOutboxStore(): OutboxStore {
  if (process.env['NODE_ENV'] !== 'test' && process.env['DATABASE_URL']) {
    return new PostgresOutboxStore(process.env['DATABASE_URL']);
  }
  return new InMemoryOutboxStore();
}

export const resourcesRouter = new Hono();
export const sharedStorage: ObjectStorage = createObjectStorageFromEnv();
export const sharedOutboxStore: OutboxStore = createOutboxStore();
export const sharedOutboxManager = new TransactionalOutboxManager(sharedOutboxStore);

const uploadUrlSchema = z.object({
  fileName: z.string().min(1, 'fileName is required'),
  mimeType: z.enum(['application/pdf', 'text/plain', 'text/markdown']),
  sizeBytes: z.number().int().positive().max(INGESTION_LIMITS.MAX_FILE_SIZE_BYTES).optional(),
});

const createResourceSchema = z.object({
  courseId: z.string().uuid('courseId must be a valid UUID').optional().nullable(),
  title: z.string().min(1, 'Resource title is required').max(255),
  type: z.enum(['syllabus', 'lecture_notes', 'question_bank', 'reference_material']),
  objectKey: z.string().min(1, 'objectKey is required').max(512),
  mimeType: z.string().min(1, 'mimeType is required').max(100),
  sizeBytes: z.number().int().positive().optional().nullable(),
  contentHash: z.string().length(64).optional().nullable(),
  duplicateAction: z.enum(['reject', 'replace', 'keep_both']).default('reject'),
});

// GET /api/v1/resources
resourcesRouter.get('/', async (c) => {
  const session = getSession(c);
  const courseId = c.req.query('courseId');
  const resources = await defaultStore.listResources(session.userId, courseId);
  return c.json(resources);
});

// GET /api/v1/resources/:id
resourcesRouter.get('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const resource = await defaultStore.getResource(id, session.userId);
  const chunks = await defaultStore.listChunks(resource.id, session.userId);

  return c.json({
    ...resource,
    chunkCount: chunks.length,
  });
});

// GET /api/v1/resources/:id/chunks
resourcesRouter.get('/:id/chunks', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const chunks = await defaultStore.listChunks(id, session.userId);
  return c.json(chunks);
});

// GET /api/v1/resources/:id/download-url
resourcesRouter.get('/:id/download-url', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const resource = await defaultStore.getResource(id, session.userId);
  const downloadUrl = await sharedStorage.getSignedDownloadUrl(resource.objectKey);
  return c.json({ downloadUrl });
});

// POST /api/v1/resources/upload-url
resourcesRouter.post('/upload-url', async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);

  const parsed = uploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid upload-url request', parsed.error.format());
  }

  const safeName = normalizeFileName(parsed.data.fileName);
  const objectKey = `users/${session.userId}/resources/${Date.now()}_${encodeURIComponent(safeName)}`;
  const uploadUrl = await sharedStorage.getSignedUploadUrl(objectKey, parsed.data.mimeType);

  return c.json({ uploadUrl, objectKey, normalizedFileName: safeName });
});

// POST /api/v1/resources (Register uploaded file)
resourcesRouter.post('/', async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);

  const parsed = createResourceSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid resource payload', parsed.error.format());
  }

  // 1. Verify objectKey ownership
  if (!parsed.data.objectKey.startsWith(`users/${session.userId}/`)) {
    throw AppError.forbidden('Object key does not belong to the authenticated user.');
  }

  // 2. Verify course ownership if courseId is supplied
  if (parsed.data.courseId) {
    await defaultStore.getCourse(parsed.data.courseId, session.userId);
  }

  // 3. Duplicate detection within user's scope
  if (parsed.data.contentHash) {
    const existing = await defaultStore.findResourceByHash(session.userId, parsed.data.contentHash);
    if (existing) {
      if (parsed.data.duplicateAction === 'reject') {
        return c.json(
          {
            code: 'CONFLICT',
            message:
              'Duplicate document detected. An identical file already exists in your library.',
            existingResource: {
              id: existing.id,
              title: existing.title,
              courseId: existing.courseId,
              createdAt: existing.createdAt,
            },
          },
          409,
        );
      }

      if (parsed.data.duplicateAction === 'replace') {
        // Delete old resource and its chunks
        await defaultStore.deleteResource(existing.id, session.userId);
      }
    }
  }

  // 4. Atomically create resource record and enqueue durable outbox job
  const { resource } = await defaultStore.createResourceWithOutbox(
    {
      userId: session.userId,
      courseId: parsed.data.courseId,
      title: parsed.data.title,
      type: parsed.data.type,
      objectKey: parsed.data.objectKey,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      contentHash: parsed.data.contentHash,
      processingStatus: 'queued',
    },
    {
      queueName: 'resource-processing',
      maxAttempts: 3,
    },
  );

  return c.json(resource, 201);
});

// POST /api/v1/resources/direct (Convenient direct upload for web UI / test workflows)
resourcesRouter.post('/direct', async (c) => {
  const session = getSession(c);
  const formData = await c.req.parseBody().catch(() => null);

  if (!formData || !formData['file']) {
    throw AppError.badRequest('File is required in multipart body.');
  }

  const file = formData['file'];
  const rawTitle = formData['title'];
  const fileObjName =
    typeof file === 'object' && file && 'name' in file && typeof file.name === 'string'
      ? file.name
      : 'Untitled Document';
  const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : fileObjName;
  const rawType = formData['type'];
  const type = (
    typeof rawType === 'string' &&
    ['syllabus', 'lecture_notes', 'question_bank', 'reference_material'].includes(rawType)
      ? rawType
      : 'lecture_notes'
  ) as 'syllabus' | 'lecture_notes' | 'question_bank' | 'reference_material';
  const rawCourseId = formData['courseId'];
  const courseId =
    typeof rawCourseId === 'string' && rawCourseId.trim() ? rawCourseId.trim() : null;
  const duplicateAction = (
    typeof formData['duplicateAction'] === 'string' ? formData['duplicateAction'] : 'reject'
  ) as 'reject' | 'replace' | 'keep_both';

  // Verify course ownership before accepting upload
  if (courseId) {
    await defaultStore.getCourse(courseId, session.userId);
  }

  let buffer: Buffer;
  let fileName = 'document.pdf';

  if (file instanceof Blob) {
    const arrayBuf = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuf);
    if ('name' in file && typeof file.name === 'string') {
      fileName = file.name;
    }
  } else {
    throw AppError.badRequest('Invalid file upload payload.');
  }

  // Validate file signature and limits
  const validation = validateFileBytes(buffer, fileName);
  if (!validation.isValid) {
    throw AppError.badRequest(validation.error || 'Invalid file format.');
  }

  // Duplicate check
  const existing = await defaultStore.findResourceByHash(session.userId, validation.contentHash);
  if (existing) {
    if (duplicateAction === 'reject') {
      return c.json(
        {
          code: 'CONFLICT',
          message: 'Duplicate document detected. An identical file already exists in your library.',
          existingResource: {
            id: existing.id,
            title: existing.title,
            courseId: existing.courseId,
            createdAt: existing.createdAt,
          },
        },
        409,
      );
    }
    if (duplicateAction === 'replace') {
      await defaultStore.deleteResource(existing.id, session.userId);
    }
  }

  // Upload to object storage
  const objectKey = `users/${session.userId}/resources/${Date.now()}_${encodeURIComponent(validation.normalizedFileName)}`;
  await sharedStorage.upload(objectKey, buffer, validation.detectedMimeType);

  // Atomically create resource record and enqueue outbox job
  const { resource } = await defaultStore.createResourceWithOutbox(
    {
      userId: session.userId,
      courseId,
      title: title || validation.normalizedFileName,
      type,
      objectKey,
      mimeType: validation.detectedMimeType,
      sizeBytes: validation.sizeBytes,
      contentHash: validation.contentHash,
      processingStatus: 'queued',
    },
    {
      queueName: 'resource-processing',
      maxAttempts: 3,
    },
  );

  return c.json(resource, 201);
});

// POST /api/v1/resources/:id/retry
resourcesRouter.post('/:id/retry', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');

  const { resource: updated } = await defaultStore.retryResourceWithOutbox(id, session.userId, {
    queueName: 'resource-processing',
    idempotencyKey: `retry_${id}_${Date.now()}`,
    maxAttempts: 3,
  });

  return c.json(updated);
});

// DELETE /api/v1/resources/:id
resourcesRouter.delete('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');

  await defaultStore.deleteResourceWithOutbox(id, session.userId, {
    queueName: 'resource-processing',
    idempotencyKey: `delete_storage_${id}`,
    maxAttempts: 3,
  });

  return c.json({ success: true, deletedResourceId: id });
});
