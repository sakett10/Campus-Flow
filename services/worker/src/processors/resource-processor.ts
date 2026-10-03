import type {
  ResourceProcessingStatus,
  Resource,
  ResourceChunk,
  AcademicNode,
} from '@campusflow/types';
import {
  createLogger,
  validateFileBytes,
  extractDocumentText,
  chunkExtractedPages,
  inferAcademicMapNodes,
  type ObjectStorage,
} from '@campusflow/shared';

const logger = createLogger({ module: 'resource_processor' });

export interface ResourceProcessorStore {
  getResource(id: string, userId: string): Promise<Resource>;
  updateResourceStatus(
    id: string,
    userId: string,
    status: ResourceProcessingStatus,
    extra?: { errorMessage?: string | null; pageCount?: number | null },
  ): Promise<Resource>;
  updateResource(id: string, userId: string, updates: Partial<Resource>): Promise<Resource>;
  deleteChunksByResource(resourceId: string): Promise<void>;
  createChunks(chunks: Array<Omit<ResourceChunk, 'id' | 'createdAt'>>): Promise<ResourceChunk[]>;
  listAcademicNodes(courseId: string, userId: string): Promise<AcademicNode[]>;
  createAcademicNodes(
    nodes: Array<Omit<AcademicNode, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<AcademicNode[]>;
}

export interface ResourceJobPayload {
  resourceId?: string;
  userId?: string;
  courseId?: string | null;
  objectKey?: string;
  mimeType?: string;
  action?: string;
}

/**
 * Core idempotent document ingestion processor:
 *
 * 1. Validates file bytes and magic signatures.
 * 2. Extracts page-by-page text via unpdf (PDF) or UTF-8.
 * 3. Handles non-extractable / scanned PDFs honestly (fails with OCR required note).
 * 4. Normalizes and chunks text using paragraph/heading-aware boundaries.
 * 5. Replaces any existing chunks idempotently (no duplicates on repeated delivery).
 * 6. Deduces academic modules and topics into the course map.
 * 7. Transitions state from processing -> ready (or failed).
 * 8. Emits structured observability logs.
 */
export type ResourceProcessorDeps = {
  dataStore?: ResourceProcessorStore;
  store?: ResourceProcessorStore;
  objectStorage?: ObjectStorage;
  storage?: ObjectStorage;
};

export async function processResourceJob(
  payload: ResourceJobPayload,
  storeOrDeps: ResourceProcessorStore | ResourceProcessorDeps,
  maybeStorage?: ObjectStorage,
): Promise<{
  success: boolean;
  status: ResourceProcessingStatus;
  chunkCount?: number;
  error?: string;
}> {
  let store: ResourceProcessorStore;
  let storage: ObjectStorage;

  if (maybeStorage) {
    store = storeOrDeps as ResourceProcessorStore;
    storage = maybeStorage;
  } else {
    const deps = storeOrDeps as ResourceProcessorDeps;
    store = (deps.dataStore || deps.store)!;
    storage = (deps.objectStorage || deps.storage)!;
  }

  // 1. Handle asynchronous object deletion
  if (payload.action === 'delete_storage_object') {
    if (payload.objectKey) {
      await storage.delete(payload.objectKey);
      logger.info('Asynchronous object storage deletion completed', {
        action: 'resource_deleted',
        objectKey: payload.objectKey,
        userId: payload.userId,
      });
    }
    return { success: true, status: 'ready' };
  }

  const { resourceId, userId, courseId, objectKey } = payload;
  if (!resourceId || !userId || !objectKey) {
    throw new Error('Missing required job parameters: resourceId, userId, objectKey');
  }

  logger.info('Starting document processing', {
    action: 'resource_processing_started',
    resourceId,
    userId,
    courseId,
    objectKey,
  });

  // Transition to processing state
  await store.updateResourceStatus(resourceId, userId, 'processing');

  try {
    // 2. Fetch object bytes from storage
    const storageItem = await storage.getObject(objectKey);
    if (!storageItem) {
      throw new Error(`File object not found in storage at key: ${objectKey}`);
    }

    const buffer = storageItem.data;

    // 3. Validate file signature and limits
    const validation = validateFileBytes(buffer, objectKey);
    if (!validation.isValid) {
      const errorMsg = validation.error || 'File validation failed.';
      await store.updateResourceStatus(resourceId, userId, 'failed', { errorMessage: errorMsg });
      logger.warn('Document processing failed validation', {
        action: 'resource_processing_failed',
        resourceId,
        userId,
        error: errorMsg,
      });
      return { success: false, status: 'failed', error: errorMsg };
    }

    // 4. Extract text
    const extraction = await extractDocumentText(buffer, validation.detectedMimeType);

    // 5. Verify text is extractable
    if (!extraction.hasExtractableText) {
      const errorMsg =
        'Document contains no extractable text. Scanned or image-only PDFs require OCR, which is not supported in MVP.';
      await store.updateResourceStatus(resourceId, userId, 'failed', { errorMessage: errorMsg });
      logger.warn('Document contains no extractable text (OCR required)', {
        action: 'resource_processing_failed',
        resourceId,
        userId,
        error: errorMsg,
      });
      return { success: false, status: 'failed', error: errorMsg };
    }

    // 6. Chunk extracted pages
    const generatedChunks = chunkExtractedPages(extraction.pages, extraction.extractionVersion);

    // 7. Store chunks idempotently (delete existing, then insert)
    await store.deleteChunksByResource(resourceId);

    const chunksToInsert = generatedChunks.map((c) => ({
      resourceId,
      userId,
      courseId: courseId || null,
      sequence: c.sequence,
      content: c.content,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      charCount: c.charCount,
      tokenCount: c.tokenCount,
      extractionVersion: c.extractionVersion,
      chunkingVersion: c.chunkingVersion,
    }));

    await store.createChunks(chunksToInsert);

    // 8. Deduce academic map if courseId is present
    if (courseId) {
      try {
        const existingNodes = await store.listAcademicNodes(courseId, userId);
        if (existingNodes.length === 0) {
          const inferredNodes = inferAcademicMapNodes(extraction.text);
          const nodesToCreate: Array<Omit<AcademicNode, 'id' | 'createdAt' | 'updatedAt'>> = [];

          for (const mod of inferredNodes) {
            nodesToCreate.push({
              courseId,
              userId,
              parentId: null,
              type: mod.type,
              title: mod.title,
              description: null,
              orderIndex: mod.orderIndex,
              origin: mod.origin,
              confidence: mod.confidence,
              needsReview: mod.needsReview,
            });
          }

          if (nodesToCreate.length > 0) {
            await store.createAcademicNodes(nodesToCreate);
          }
        }
      } catch (err) {
        logger.warn('Failed to deduce academic nodes; continuing ingestion', {
          resourceId,
          error: (err as Error).message,
        });
      }
    }

    // 9. Update resource status to ready
    await store.updateResourceStatus(resourceId, userId, 'ready', {
      pageCount: extraction.pageCount,
      errorMessage: null,
    });

    await store.updateResource(resourceId, userId, {
      contentHash: validation.contentHash,
      pageCount: extraction.pageCount,
      processedAt: new Date(),
    });

    logger.info('Document processing succeeded', {
      action: 'resource_processing_succeeded',
      resourceId,
      userId,
      pageCount: extraction.pageCount,
      chunkCount: chunksToInsert.length,
    });

    return {
      success: true,
      status: 'ready',
      chunkCount: chunksToInsert.length,
    };
  } catch (err) {
    const errorMsg = (err as Error).message || 'Unexpected processing error occurred.';
    await store.updateResourceStatus(resourceId, userId, 'failed', { errorMessage: errorMsg });

    logger.error('Document processing encountered fatal error', err as Error, {
      action: 'resource_processing_failed',
      resourceId,
      userId,
      error: errorMsg,
    });

    return { success: false, status: 'failed', error: errorMsg };
  }
}
