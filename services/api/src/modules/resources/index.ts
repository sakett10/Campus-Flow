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
  validateBatchUploadLimits,
  INGESTION_LIMITS,
  TransactionalOutboxManager,
  InMemoryOutboxStore,
} from '@campusflow/shared';
import type { BatchUploadItemResult, BatchUploadResponse } from '@campusflow/types';
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
    // For 'replace', do NOT delete the existing resource yet. Wait until new storage upload succeeds!
  }

  // Upload to object storage
  const objectKey = `users/${session.userId}/resources/${Date.now()}_${encodeURIComponent(validation.normalizedFileName)}`;
  await sharedStorage.upload(objectKey, buffer, validation.detectedMimeType);

  try {
    if (existing && duplicateAction === 'replace') {
      await defaultStore.deleteResource(existing.id, session.userId);
    }

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
  } catch (dbErr) {
    // Compensating cleanup: if database persistence fails, delete newly uploaded object from storage
    await sharedStorage.delete(objectKey).catch(() => {});
    throw dbErr;
  }
});

// POST /api/v1/resources/batch (Multi-file upload with atomic checks and independent per-file processing)
resourcesRouter.post('/batch', async (c) => {
  const session = getSession(c);
  const formData = await c.req.parseBody({ all: true }).catch(() => null);

  if (!formData) {
    throw AppError.badRequest('Multipart form data is required for batch upload.');
  }

  // Extract all files from formData ('files' or 'file')
  const rawFiles = formData['files'] ?? formData['file'];
  const filesList: File[] = [];
  if (Array.isArray(rawFiles)) {
    for (const f of rawFiles) {
      if (f && typeof f === 'object' && 'arrayBuffer' in f) {
        filesList.push(f as unknown as File);
      }
    }
  } else if (rawFiles && typeof rawFiles === 'object' && 'arrayBuffer' in rawFiles) {
    filesList.push(rawFiles as unknown as File);
  }

  if (filesList.length === 0) {
    throw AppError.badRequest('At least one file is required in multipart batch upload.');
  }

  // Validate batch limits (count and aggregate size)
  const batchLimitsValidation = validateBatchUploadLimits(
    filesList.map((f) => ({ size: f.size || 0, name: f.name })),
  );
  if (!batchLimitsValidation.isValid) {
    throw AppError.badRequest(batchLimitsValidation.error || 'Batch upload limits exceeded.');
  }

  // Course authorization check
  const rawCourseId = formData['courseId'];
  const courseId =
    typeof rawCourseId === 'string' && rawCourseId.trim() ? rawCourseId.trim() : null;
  if (courseId) {
    await defaultStore.getCourse(courseId, session.userId);
  }

  const rawType = formData['type'];
  const defaultType = (
    typeof rawType === 'string' &&
    ['syllabus', 'lecture_notes', 'question_bank', 'reference_material'].includes(rawType)
      ? rawType
      : 'lecture_notes'
  ) as 'syllabus' | 'lecture_notes' | 'question_bank' | 'reference_material';

  const duplicateAction = (
    typeof formData['duplicateAction'] === 'string' ? formData['duplicateAction'] : 'reject'
  ) as 'reject' | 'replace' | 'keep_both';

  const results: BatchUploadItemResult[] = [];

  for (const file of filesList) {
    const originalName = file.name || 'document.pdf';
    const fileName = normalizeFileName(originalName);

    try {
      if (file.size > INGESTION_LIMITS.MAX_FILE_SIZE_BYTES) {
        results.push({
          originalName,
          fileName,
          sizeBytes: file.size,
          status: 'rejected',
          error: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed size of 50 MB.`,
        });
        continue;
      }

      const arrayBuf = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      // Validate file signature, extension, and individual size
      const validation = validateFileBytes(buffer, fileName);
      if (!validation.isValid) {
        results.push({
          originalName,
          fileName,
          sizeBytes: file.size,
          status: 'rejected',
          error: validation.error || 'Invalid file format or signature.',
        });
        continue;
      }

      // Check duplicates within user's library
      const existing = await defaultStore.findResourceByHash(
        session.userId,
        validation.contentHash,
      );
      if (existing) {
        if (duplicateAction === 'reject') {
          results.push({
            originalName,
            fileName: validation.normalizedFileName,
            sizeBytes: validation.sizeBytes,
            status: 'conflict',
            error: 'Duplicate document detected. An identical file already exists in your library.',
            duplicateResource: {
              id: existing.id,
              title: existing.title,
              courseId: existing.courseId,
              createdAt: existing.createdAt,
            },
          });
          continue;
        }
        // For 'replace', do not delete existing document until new upload succeeds!
      }

      // Store in object storage
      const objectKey = `users/${session.userId}/resources/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${encodeURIComponent(validation.normalizedFileName)}`;
      await sharedStorage.upload(objectKey, buffer, validation.detectedMimeType);

      try {
        if (existing && duplicateAction === 'replace') {
          await defaultStore.deleteResource(existing.id, session.userId);
        }

        // Atomically create resource record and enqueue outbox job
        const { resource } = await defaultStore.createResourceWithOutbox(
          {
            userId: session.userId,
            courseId,
            title: validation.normalizedFileName,
            type: defaultType,
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

        results.push({
          originalName,
          fileName: validation.normalizedFileName,
          sizeBytes: validation.sizeBytes,
          status: 'uploaded',
          processingStatus: 'queued',
          resourceId: resource.id,
        });
      } catch (dbErr) {
        // Compensating cleanup: if database persistence fails, delete newly uploaded object from storage
        await sharedStorage.delete(objectKey).catch(() => {});
        throw dbErr;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      results.push({
        originalName,
        fileName,
        sizeBytes: file.size,
        status: 'error',
        error: msg,
      });
    }
  }

  const succeeded = results.filter((r) => r.status === 'uploaded').length;
  const conflicts = results.filter((r) => r.status === 'conflict').length;
  const failed = results.filter((r) => r.status === 'rejected' || r.status === 'error').length;

  const response: BatchUploadResponse = {
    summary: {
      total: filesList.length,
      succeeded,
      failed,
      conflicts,
    },
    results,
  };

  return c.json(response, 200);
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
