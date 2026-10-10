import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDataStore } from '../../services/api/src/data/store.js';
import { InMemoryOutboxStore } from '@campusflow/shared';

describe('Transactional Outbox - Resource Lifecycle Atomicity', () => {
  let outboxStore: InMemoryOutboxStore;
  let dataStore: InMemoryDataStore;

  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';

  beforeEach(async () => {
    outboxStore = new InMemoryOutboxStore();
    dataStore = new InMemoryDataStore(outboxStore);

    await dataStore.createUser({
      id: userA,
      clerkId: `clerk_${userA}`,
      email: 'student_a@campusflow.test',
      fullName: 'Student A',
      role: 'student',
    });

    await dataStore.createUser({
      id: userB,
      clerkId: `clerk_${userB}`,
      email: 'student_b@campusflow.test',
      fullName: 'Student B',
      role: 'student',
    });

    await dataStore.createCourse({
      userId: userA,
      code: 'CS101',
      title: 'Introduction to Computer Science',
    });
  });

  it('CREATE SUCCESS: Atomically creates resource row and persists pending outbox job', async () => {
    const { resource, job } = await dataStore.createResourceWithOutbox(
      {
        userId: userA,
        title: 'Lecture 1 Slides.pdf',
        type: 'lecture_notes',
        objectKey: `users/${userA}/resources/lec1.pdf`,
        mimeType: 'application/pdf',
        processingStatus: 'queued',
      },
      {
        queueName: 'resource-processing',
        maxAttempts: 3,
      },
    );

    // 1. Verify resource exists in DataStore
    const fetchedResource = await dataStore.getResource(resource.id, userA);
    expect(fetchedResource.id).toBe(resource.id);
    expect(fetchedResource.processingStatus).toBe('queued');

    // 2. Verify outbox job exists and matches
    const fetchedJob = await outboxStore.getJob(job.id);
    expect(fetchedJob).not.toBeNull();
    expect(fetchedJob?.queueName).toBe('resource-processing');
    expect(fetchedJob?.status).toBe('pending');
    expect(fetchedJob?.payload['resourceId']).toBe(resource.id);
    expect(fetchedJob?.payload['userId']).toBe(userA);
    expect(fetchedJob?.payload['objectKey']).toBe(`users/${userA}/resources/lec1.pdf`);
    expect(fetchedJob?.idempotencyKey).toBe(`process_${resource.id}`);
  });

  it('CREATE ATOMICITY: Failure during outbox persist rolls back domain resource mutation', async () => {
    const attemptedObjectKey = `users/${userA}/resources/fail_create.pdf`;

    await expect(
      dataStore.createResourceWithOutbox(
        {
          userId: userA,
          title: 'Doomed File.pdf',
          type: 'lecture_notes',
          objectKey: attemptedObjectKey,
          mimeType: 'application/pdf',
          processingStatus: 'queued',
        },
        {
          queueName: 'resource-processing',
          simulateFailure: true, // Injects deterministic failure
        },
      ),
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

    // Verify resource was NOT persisted (rolled back)
    const resources = await dataStore.listResources(userA);
    expect(resources.filter((r) => r.objectKey === attemptedObjectKey)).toHaveLength(0);

    // Verify NO outbox job was committed
    const pendingJobs = await outboxStore.listPending();
    expect(pendingJobs.filter((j) => j.payload['objectKey'] === attemptedObjectKey)).toHaveLength(
      0,
    );
  });

  it('RETRY SUCCESS: Atomically marks failed resource as queued and enqueues retry outbox job', async () => {
    const { resource } = await dataStore.createResourceWithOutbox(
      {
        userId: userA,
        title: 'Retryable Lecture.pdf',
        type: 'lecture_notes',
        objectKey: `users/${userA}/resources/retryable.pdf`,
        mimeType: 'application/pdf',
        processingStatus: 'queued',
      },
      {
        queueName: 'resource-processing',
      },
    );

    // Mark as failed
    await dataStore.updateResourceStatus(resource.id, userA, 'failed', {
      errorMessage: 'Extraction timeout error',
    });
    const failedResource = await dataStore.getResource(resource.id, userA);
    expect(failedResource.processingStatus).toBe('failed');

    // Perform atomic retry
    const retryKey = `retry_${resource.id}_1001`;
    const { resource: retriedResource, job: retryJob } = await dataStore.retryResourceWithOutbox(
      resource.id,
      userA,
      {
        queueName: 'resource-processing',
        idempotencyKey: retryKey,
        maxAttempts: 3,
      },
    );

    expect(retriedResource.processingStatus).toBe('queued');
    expect(retryJob.queueName).toBe('resource-processing');
    expect(retryJob.idempotencyKey).toBe(retryKey);

    const reloaded = await dataStore.getResource(resource.id, userA);
    expect(reloaded.processingStatus).toBe('queued');
  });

  it('RETRY ATOMICITY: Failure during retry outbox enqueue rolls back status to failed', async () => {
    const { resource } = await dataStore.createResourceWithOutbox(
      {
        userId: userA,
        title: 'Broken File.pdf',
        type: 'lecture_notes',
        objectKey: `users/${userA}/resources/broken.pdf`,
        mimeType: 'application/pdf',
        processingStatus: 'queued',
      },
      {
        queueName: 'resource-processing',
      },
    );

    await dataStore.updateResourceStatus(resource.id, userA, 'failed', {
      errorMessage: 'Corrupt PDF signature',
    });

    // Attempt retry with simulated outbox failure
    await expect(
      dataStore.retryResourceWithOutbox(resource.id, userA, {
        queueName: 'resource-processing',
        idempotencyKey: `retry_${resource.id}_fail`,
        simulateFailure: true,
      }),
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

    // Status MUST remain 'failed' (rollback)
    const current = await dataStore.getResource(resource.id, userA);
    expect(current.processingStatus).toBe('failed');
    expect(current.errorMessage).toBe('Corrupt PDF signature');

    // No retry job was committed
    const pendingJobs = await outboxStore.listPending();
    expect(
      pendingJobs.filter((j) => j.idempotencyKey === `retry_${resource.id}_fail`),
    ).toHaveLength(0);
  });

  it('DELETE SUCCESS: Atomically removes resource & chunks and enqueues delete_storage_object job', async () => {
    const { resource } = await dataStore.createResourceWithOutbox(
      {
        userId: userA,
        title: 'Temp Slides.pdf',
        type: 'lecture_notes',
        objectKey: `users/${userA}/resources/temp_slides.pdf`,
        mimeType: 'application/pdf',
        processingStatus: 'queued',
      },
      {
        queueName: 'resource-processing',
      },
    );

    await dataStore.createChunks([
      {
        resourceId: resource.id,
        userId: userA,
        courseId: null,
        sequence: 1,
        content: 'Sample chunk text for temp slides.',
        charCount: 35,
        tokenCount: 7,
        extractionVersion: 'v1',
        chunkingVersion: 'v1',
      },
    ]);

    const chunksBefore = await dataStore.listChunks(resource.id, userA);
    expect(chunksBefore).toHaveLength(1);

    // Atomically delete with outbox job
    const { job: deleteJob } = await dataStore.deleteResourceWithOutbox(resource.id, userA, {
      queueName: 'resource-processing',
      idempotencyKey: `delete_storage_${resource.id}`,
    });

    // 1. Resource must no longer exist in dataStore
    await expect(dataStore.getResource(resource.id, userA)).rejects.toThrow();

    // 2. Chunks must be deleted
    await expect(dataStore.listChunks(resource.id, userA)).rejects.toThrow();

    // 3. Storage deletion outbox job must exist
    expect(deleteJob.queueName).toBe('resource-processing');
    expect(deleteJob.payload['action']).toBe('delete_storage_object');
    expect(deleteJob.payload['objectKey']).toBe(`users/${userA}/resources/temp_slides.pdf`);
  });

  it('DELETE ATOMICITY: Failure during delete outbox enqueue restores resource and chunks', async () => {
    const { resource } = await dataStore.createResourceWithOutbox(
      {
        userId: userA,
        title: 'Preserved File.pdf',
        type: 'lecture_notes',
        objectKey: `users/${userA}/resources/preserved.pdf`,
        mimeType: 'application/pdf',
        processingStatus: 'queued',
      },
      {
        queueName: 'resource-processing',
      },
    );

    await dataStore.createChunks([
      {
        resourceId: resource.id,
        userId: userA,
        courseId: null,
        sequence: 1,
        content: 'Chunk to preserve on failed rollback.',
        charCount: 36,
        tokenCount: 8,
        extractionVersion: 'v1',
        chunkingVersion: 'v1',
      },
    ]);

    // Attempt deletion with simulated failure
    await expect(
      dataStore.deleteResourceWithOutbox(resource.id, userA, {
        queueName: 'resource-processing',
        idempotencyKey: `delete_storage_${resource.id}`,
        simulateFailure: true,
      }),
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

    // Resource MUST STILL EXIST (rolled back)
    const fetched = await dataStore.getResource(resource.id, userA);
    expect(fetched.id).toBe(resource.id);

    // Chunks MUST STILL EXIST
    const chunks = await dataStore.listChunks(resource.id, userA);
    expect(chunks).toHaveLength(1);

    // No delete job was committed
    const pendingJobs = await outboxStore.listPending();
    expect(
      pendingJobs.filter((j) => j.idempotencyKey === `delete_storage_${resource.id}`),
    ).toHaveLength(0);
  });
});
