import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryOutboxStore, TransactionalOutboxManager } from '@campusflow/shared';
import { OutboxDispatcher } from '../../services/worker/src/dispatcher.js';
import type { JobQueueName } from '@campusflow/types';
import type { Queue } from 'bullmq';

describe('Outbox Dispatcher & Durable Job Pipeline', () => {
  let outboxStore: InMemoryOutboxStore;
  let mockQueue: { add: ReturnType<typeof vi.fn> };
  let queues: Map<JobQueueName, Queue>;

  beforeEach(() => {
    outboxStore = new InMemoryOutboxStore();
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'mock-bullmq-id' }),
    };
    queues = new Map<JobQueueName, Queue>();
    queues.set('resource-processing', mockQueue as unknown as Queue);
    queues.set('notifications', mockQueue as unknown as Queue);
  });

  it('1. PERSISTENCE & DISPATCH: Enqueued resource-processing job is dispatched to BullMQ', async () => {
    const manager = new TransactionalOutboxManager(outboxStore);
    const resourceId = '11111111-1111-4111-a111-111111111111';
    const userId = '22222222-2222-4222-a222-222222222222';

    // 1. Enqueue job into outbox
    const job = await manager.enqueue({
      queueName: 'resource-processing',
      payload: {
        resourceId,
        userId,
        objectKey: `users/${userId}/resources/syllabus.pdf`,
        mimeType: 'application/pdf',
      },
      idempotencyKey: `process_${resourceId}`,
      maxAttempts: 3,
    });

    expect(job.id).toBeDefined();
    expect(job.status).toBe('pending');

    // 2. Dispatcher processes pending job
    const dispatcher = new OutboxDispatcher(outboxStore, queues, { pollIntervalMs: 5000 });
    const dispatchedCount = await dispatcher.dispatchOnce();

    expect(dispatchedCount).toBe(1);
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'resource-processing',
      expect.objectContaining({ resourceId, userId }),
      expect.objectContaining({ jobId: `process_${resourceId}`, attempts: 3 }),
    );

    // 3. Verify status updated to dispatched in outbox store
    const updated = await outboxStore.getJob(job.id);
    expect(updated?.status).toBe('dispatched');
  });

  it('2. FAILURE RESILIENCE: Failed transport publication leaves job in pending status for retry', async () => {
    const manager = new TransactionalOutboxManager(outboxStore);
    const failingQueue = {
      add: vi.fn().mockRejectedValue(new Error('Redis connection refused: ECONNREFUSED')),
    };
    queues.set('resource-processing', failingQueue as unknown as Queue);

    const job = await manager.enqueue({
      queueName: 'resource-processing',
      payload: { docId: 'doc-fail-test' },
      idempotencyKey: 'fail_job_key',
    });

    const dispatcher = new OutboxDispatcher(outboxStore, queues);
    const dispatchedCount = await dispatcher.dispatchOnce();

    // Publication failed, so 0 jobs marked dispatched
    expect(dispatchedCount).toBe(0);

    // Job MUST remain pending for subsequent retry when Redis recovers
    const current = await outboxStore.getJob(job.id);
    expect(current?.status).toBe('pending');
  });

  it('3. IDEMPOTENCY: Duplicate enqueue returns existing outbox record without duplicating', async () => {
    const manager = new TransactionalOutboxManager(outboxStore);
    const idempotencyKey = 'unique_dedupe_key_101';

    const job1 = await manager.enqueue({
      queueName: 'resource-processing',
      payload: { version: 1 },
      idempotencyKey,
    });

    const job2 = await manager.enqueue({
      queueName: 'resource-processing',
      payload: { version: 2 },
      idempotencyKey,
    });

    expect(job2.id).toBe(job1.id);
    expect(job2.payload).toEqual({ version: 1 });

    const allPending = await outboxStore.listPending(10);
    expect(allPending.length).toBe(1);
  });

  it('4. DELETE STORAGE OBJECT JOB: Asynchronous storage deletion jobs are correctly dispatched', async () => {
    const manager = new TransactionalOutboxManager(outboxStore);
    const resourceId = '33333333-3333-4333-a333-333333333333';
    const userId = '44444444-4444-4444-a444-444444444444';
    const objectKey = `users/${userId}/resources/old_file.pdf`;

    const deleteJob = await manager.enqueue({
      queueName: 'resource-processing',
      payload: {
        action: 'delete_storage_object',
        objectKey,
        userId,
      },
      idempotencyKey: `delete_storage_${resourceId}`,
      maxAttempts: 3,
    });

    const dispatcher = new OutboxDispatcher(outboxStore, queues);
    const count = await dispatcher.dispatchOnce();

    expect(count).toBe(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'resource-processing',
      expect.objectContaining({
        action: 'delete_storage_object',
        objectKey,
        userId,
      }),
      expect.objectContaining({ jobId: `delete_storage_${resourceId}` }),
    );

    const updated = await outboxStore.getJob(deleteJob.id);
    expect(updated?.status).toBe('dispatched');
  });

  it('5. STALE RUNNING RECOVERY: Abandoned jobs are swept and reset to pending', async () => {
    const manager = new TransactionalOutboxManager(outboxStore);
    const job = await manager.enqueue({
      queueName: 'resource-processing',
      payload: { doc: 'stale-doc' },
      idempotencyKey: 'stale_test_key',
    });

    // Simulate worker crashing while job is running
    await manager.leaseJob(job.id, 'crashed-worker-node');

    // Wait past stale threshold
    await new Promise((resolve) => setTimeout(resolve, 50));

    const dispatcher = new OutboxDispatcher(outboxStore, queues, { staleThresholdMs: 40 });
    const recoveredCount = await dispatcher.recoverStale();

    expect(recoveredCount).toBe(1);

    const resetJob = await outboxStore.getJob(job.id);
    expect(resetJob?.status).toBe('pending');
    expect(resetJob?.lockedBy).toBeNull();
  });
});
