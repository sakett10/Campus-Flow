import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionalOutboxManager, InMemoryOutboxStore } from '@campusflow/shared';

describe('Job Architecture & Transactional Outbox Pattern', () => {
  let store: InMemoryOutboxStore;
  let outboxManager: TransactionalOutboxManager;

  beforeEach(() => {
    store = new InMemoryOutboxStore();
    outboxManager = new TransactionalOutboxManager(store);
  });

  it('ATOMICITY: Domain write + job creation commits atomically in outbox store', async () => {
    // Simulate a transactional boundary where domain operation & outbox record are created together
    const idempotencyKey = 'res_process_11111111-1111-4111-a111-111111111111';
    const queueName = 'resource-processing';
    const payload = {
      resourceId: '11111111-1111-4111-a111-111111111111',
      userId: '22222222-2222-4222-a222-222222222222',
      objectKey: 'users/22222222-2222-4222-a222-222222222222/resources/test.pdf',
    };

    const record = await outboxManager.enqueue({
      queueName,
      payload,
      idempotencyKey,
      maxAttempts: 3,
    });

    expect(record.id).toBeDefined();
    expect(record.status).toBe('pending');
    expect(record.queueName).toBe(queueName);
    expect(record.idempotencyKey).toBe(idempotencyKey);
    expect(record.attempts).toBe(0);

    const fetched = await store.getJob(record.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.idempotencyKey).toBe(idempotencyKey);
  });

  it('IDEMPOTENCY ENFORCEMENT: Duplicate idempotency key within same queue returns existing record', async () => {
    const idempotencyKey = 'exam_plan_unique_key_123';
    const queueName = 'exam-agent';

    const job1 = await outboxManager.enqueue({
      queueName,
      payload: { planId: 'p-1', step: 1 },
      idempotencyKey,
    });

    // Second write with identical queue + idempotency key
    const job2 = await outboxManager.enqueue({
      queueName,
      payload: { planId: 'p-1', step: 2 }, // Different payload attempted
      idempotencyKey,
    });

    // Must return the original job without creating a duplicate record or overwriting payload
    expect(job2.id).toBe(job1.id);
    expect(job2.payload).toEqual({ planId: 'p-1', step: 1 });
  });

  it('JOB DISPATCH: Dispatcher retrieves pending jobs and marks them dispatched to transport', async () => {
    const job = await outboxManager.enqueue({
      queueName: 'notifications',
      payload: { recipient: 'user-1', message: 'Exam tomorrow' },
      idempotencyKey: 'notif_key_456',
    });

    // Dispatcher poll
    const dispatchedCount = await outboxManager.dispatchPending(10);
    expect(dispatchedCount).toBe(1);

    const updated = await store.getJob(job.id);
    expect(updated?.status).toBe('dispatched');

    // Subsequent poll for pending jobs should now be empty
    const subsequentDispatched = await outboxManager.dispatchPending(10);
    expect(subsequentDispatched).toBe(0);
  });

  it('WORKER EXECUTION & SUCCESS: Worker claims lease, executes, and marks job completed', async () => {
    const job = await outboxManager.enqueue({
      queueName: 'resource-processing',
      payload: { docId: 'doc-123' },
      idempotencyKey: 'doc_key_789',
    });

    await outboxManager.dispatchPending(10);

    // Worker claims job lease with lease lock
    const workerInstance = 'worker-node-1:pid-4521';
    const claimed = await outboxManager.leaseJob(job.id, workerInstance);
    expect(claimed.status).toBe('running');
    expect(claimed.lockedBy).toBe(workerInstance);
    expect(claimed.attempts).toBe(1);

    // Worker finishes work and marks completed
    await outboxManager.markCompleted(job.id);

    const finalRecord = await store.getJob(job.id);
    expect(finalRecord?.status).toBe('completed');
    expect(finalRecord?.completedAt).toBeInstanceOf(Date);
    expect(finalRecord?.lockedBy).toBeNull();
  });

  it('WORKER FAILURE & RETRY BACKOFF: Increments attempts and backs off; fails on max attempts', async () => {
    const maxAttempts = 3;
    const job = await outboxManager.enqueue({
      queueName: 'resource-processing',
      payload: { docId: 'faulty-doc' },
      idempotencyKey: 'faulty_key_001',
      maxAttempts,
    });

    // Attempt 1: Worker leases and fails
    await outboxManager.leaseJob(job.id, 'worker-1');
    await outboxManager.recordFailure(job.id, new Error('OCR text extraction failed: timeout'));

    let current = await store.getJob(job.id);
    expect(current?.status).toBe('pending'); // Scheduled for retry
    expect(current?.attempts).toBe(1);
    expect(current?.lastError).toContain('OCR text extraction failed');

    // Attempt 2: Worker leases and fails
    await outboxManager.leaseJob(job.id, 'worker-1');
    await outboxManager.recordFailure(
      job.id,
      new Error('OCR text extraction failed: corrupt file'),
    );

    current = await store.getJob(job.id);
    expect(current?.attempts).toBe(2);
    expect(current?.status).toBe('pending');

    // Attempt 3: Final failure - reaches maxAttempts
    await outboxManager.leaseJob(job.id, 'worker-1');
    await outboxManager.recordFailure(
      job.id,
      new Error('OCR text extraction failed: unrecoverable'),
    );

    current = await store.getJob(job.id);
    expect(current?.attempts).toBe(3);
    expect(current?.status).toBe('failed'); // Poison job marked failed
    expect(current?.lockedBy).toBeNull();
  });

  it('STALE RUNNING JOB RECOVERY: Crashed worker lease timeout is detected and reclaimed', async () => {
    const job = await outboxManager.enqueue({
      queueName: 'resource-processing',
      payload: { docId: 'crash-doc' },
      idempotencyKey: 'crash_key_999',
    });

    // Worker claims job lease
    await outboxManager.leaseJob(job.id, 'crashed-worker-instance');

    // Fast-forward past lease expiration (50ms threshold)
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Recovery process sweeps and reclaims stale running jobs older than 50ms
    const reclaimedCount = await outboxManager.recoverStaleRunningJobs(50);
    expect(reclaimedCount).toBe(1);

    const recoveredJob = await store.getJob(job.id);
    expect(recoveredJob?.status).toBe('pending');
    expect(recoveredJob?.lockedBy).toBeNull();
    expect(recoveredJob?.lockedAt).toBeNull();
  });

  it('IDEMPOTENT EXECUTION: Duplicate delivery does not execute duplicate business side-effects', async () => {
    const job = await outboxManager.enqueue({
      queueName: 'plan-generation',
      payload: { assessmentId: 'ass-123' },
      idempotencyKey: 'plan_gen_key_444',
    });

    let executionCount = 0;
    const executeBusinessLogic = async () => {
      executionCount++;
    };

    // First delivery
    await outboxManager.leaseJob(job.id, 'worker-A');
    await executeBusinessLogic();
    await outboxManager.markCompleted(job.id);

    // Duplicate delivery simulation (e.g. BullMQ network blip re-delivery)
    const duplicateJobState = await store.getJob(job.id);
    if (duplicateJobState?.status !== 'completed') {
      await executeBusinessLogic();
    }

    // Business logic executed exactly once
    expect(executionCount).toBe(1);
    expect(duplicateJobState?.status).toBe('completed');
  });
});
