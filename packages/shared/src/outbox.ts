import type { JobQueueName, JobOutboxRecord, JobOutboxStatus } from '@campusflow/types';
import { AppError } from './errors.js';
import { createLogger } from './logger.js';

const logger = createLogger({ module: 'outbox' });

export interface EnqueueJobOptions {
  queueName: JobQueueName;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  maxAttempts?: number;
  scheduledAt?: Date;
  simulateFailure?: boolean;
}

export interface OutboxStore {
  createJob(job: Omit<JobOutboxRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<JobOutboxRecord>;
  getJob(id: string): Promise<JobOutboxRecord | null>;
  getJobByIdempotencyKey(
    queueName: JobQueueName,
    idempotencyKey: string,
  ): Promise<JobOutboxRecord | null>;
  updateJobStatus(
    id: string,
    status: JobOutboxStatus,
    extra?: Partial<JobOutboxRecord>,
  ): Promise<JobOutboxRecord>;
  listPending(limit?: number): Promise<JobOutboxRecord[]>;
  listStaleRunning(staleBefore: Date): Promise<JobOutboxRecord[]>;
  deleteJob?(id: string): Promise<void>;
}

export class InMemoryOutboxStore implements OutboxStore {
  private jobs: Map<string, JobOutboxRecord> = new Map();

  async createJob(
    data: Omit<JobOutboxRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<JobOutboxRecord> {
    // Enforce unique (queueName, idempotencyKey)
    for (const j of this.jobs.values()) {
      if (j.queueName === data.queueName && j.idempotencyKey === data.idempotencyKey) {
        throw new AppError(
          'CONFLICT',
          `Duplicate job: idempotency key '${data.idempotencyKey}' already exists on queue '${data.queueName}'.`,
          409,
        );
      }
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const job: JobOutboxRecord = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    return job;
  }

  async getJob(id: string): Promise<JobOutboxRecord | null> {
    return this.jobs.get(id) || null;
  }

  async getJobByIdempotencyKey(
    queueName: JobQueueName,
    idempotencyKey: string,
  ): Promise<JobOutboxRecord | null> {
    for (const j of this.jobs.values()) {
      if (j.queueName === queueName && j.idempotencyKey === idempotencyKey) {
        return j;
      }
    }
    return null;
  }

  async updateJobStatus(
    id: string,
    status: JobOutboxStatus,
    extra: Partial<JobOutboxRecord> = {},
  ): Promise<JobOutboxRecord> {
    const job = this.jobs.get(id);
    if (!job) {
      throw AppError.notFound(`Outbox job not found: ${id}`);
    }

    const updated: JobOutboxRecord = {
      ...job,
      ...extra,
      status,
      updatedAt: new Date(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async listPending(limit = 50): Promise<JobOutboxRecord[]> {
    const now = new Date();
    return Array.from(this.jobs.values())
      .filter((j) => j.status === 'pending' && j.scheduledAt <= now)
      .slice(0, limit);
  }

  async listStaleRunning(staleBefore: Date): Promise<JobOutboxRecord[]> {
    return Array.from(this.jobs.values()).filter(
      (j) => j.status === 'running' && j.lockedAt && j.lockedAt <= staleBefore,
    );
  }

  async deleteJob(id: string): Promise<void> {
    this.jobs.delete(id);
  }

  clear(): void {
    this.jobs.clear();
  }
}

export class TransactionalOutboxManager {
  constructor(
    private readonly store: OutboxStore,
    private readonly transportDispatcher?: (
      queueName: JobQueueName,
      job: JobOutboxRecord,
    ) => Promise<void>,
  ) {}

  getStore(): OutboxStore {
    return this.store;
  }

  /**
   * Enqueues a job record into the durable PostgreSQL outbox table.
   * Must be called within the same database transaction as the domain operation.
   */
  async enqueue(options: EnqueueJobOptions): Promise<JobOutboxRecord> {
    const idempotencyKey = options.idempotencyKey || crypto.randomUUID();
    const existing = await this.store.getJobByIdempotencyKey(options.queueName, idempotencyKey);
    if (existing) {
      // Idempotent return: do not insert duplicate
      logger.info('Idempotent job enqueue request deduplicated', {
        jobId: existing.id,
        queue: options.queueName,
        idempotencyKey,
      });
      return existing;
    }

    const job = await this.store.createJob({
      queueName: options.queueName,
      payload: options.payload || {},
      idempotencyKey,
      status: 'pending',
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      scheduledAt: options.scheduledAt ?? new Date(),
    });

    if (options.simulateFailure) {
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    }

    logger.info('Durable job recorded in outbox', {
      jobId: job.id,
      queue: job.queueName,
      idempotencyKey: job.idempotencyKey,
    });

    return job;
  }

  /**
   * Dispatches pending outbox records to BullMQ execution transport.
   */
  async dispatchPending(limit = 50): Promise<number> {
    const pendingJobs = await this.store.listPending(limit);
    let count = 0;

    for (const job of pendingJobs) {
      try {
        if (this.transportDispatcher) {
          await this.transportDispatcher(job.queueName, job);
        }
        await this.store.updateJobStatus(job.id, 'dispatched');
        count++;
      } catch (err) {
        logger.warn(`Failed to dispatch job ${job.id} to transport: ${(err as Error).message}`, {
          jobId: job.id,
          queue: job.queueName,
          error: (err as Error).message,
        });
      }
    }

    return count;
  }

  /**
   * Leases a job for execution by a worker.
   */
  async leaseJob(jobId: string, workerId: string): Promise<JobOutboxRecord> {
    const job = await this.store.getJob(jobId);
    if (!job) {
      throw AppError.notFound(`Job ${jobId} not found`);
    }

    if (job.status === 'completed') {
      throw new AppError('CONFLICT', `Job ${jobId} is already completed.`, 409);
    }

    const updated = await this.store.updateJobStatus(jobId, 'running', {
      lockedAt: new Date(),
      lockedBy: workerId,
      attempts: job.attempts + 1,
    });

    return updated;
  }

  /**
   * Marks a job as completed in PostgreSQL after successful worker execution.
   */
  async markCompleted(jobId: string): Promise<JobOutboxRecord> {
    return this.store.updateJobStatus(jobId, 'completed', {
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    });
  }

  /**
   * Records a worker failure with backoff retry or terminal dead-lettering.
   */
  async recordFailure(jobId: string, error: Error): Promise<JobOutboxRecord> {
    const job = await this.store.getJob(jobId);
    if (!job) {
      throw AppError.notFound(`Job ${jobId} not found`);
    }

    const hasRetriesRemaining = job.attempts < job.maxAttempts;
    const nextStatus: JobOutboxStatus = hasRetriesRemaining ? 'pending' : 'failed';
    const nextSchedule = hasRetriesRemaining
      ? new Date(Date.now() + Math.pow(2, job.attempts) * 1000)
      : job.scheduledAt;

    const updated = await this.store.updateJobStatus(jobId, nextStatus, {
      lastError: error.message,
      scheduledAt: nextSchedule,
      lockedAt: null,
      lockedBy: null,
    });

    logger.warn(`Job ${jobId} failure recorded`, {
      jobId,
      attempts: updated.attempts,
      maxAttempts: updated.maxAttempts,
      nextStatus,
      error: error.message,
    });

    return updated;
  }

  /**
   * Sweeps and recovers stale running jobs abandoned by crashed workers.
   */
  async recoverStaleRunningJobs(staleThresholdMs = 300000): Promise<number> {
    const cutoff = new Date(Date.now() - staleThresholdMs);
    const staleJobs = await this.store.listStaleRunning(cutoff);

    for (const job of staleJobs) {
      logger.warn(`Recovering stale job ${job.id} locked by ${job.lockedBy}`, {
        jobId: job.id,
        lockedAt: job.lockedAt?.toISOString(),
      });
      await this.store.updateJobStatus(job.id, 'pending', {
        lockedAt: null,
        lockedBy: null,
      });
    }

    return staleJobs.length;
  }
}
