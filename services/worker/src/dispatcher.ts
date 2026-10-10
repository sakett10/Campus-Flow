import { Queue } from 'bullmq';
import type { JobQueueName, JobOutboxRecord } from '@campusflow/types';
import { createLogger, TransactionalOutboxManager, type OutboxStore } from '@campusflow/shared';

const logger = createLogger({ module: 'dispatcher' });

export interface OutboxDispatcherOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  staleThresholdMs?: number;
}

export class OutboxDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly outboxManager: TransactionalOutboxManager;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly staleThresholdMs: number;

  constructor(
    private readonly outboxStore: OutboxStore,
    private readonly queues: Map<JobQueueName, Queue>,
    options: OutboxDispatcherOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.batchSize = options.batchSize ?? 50;
    this.staleThresholdMs = options.staleThresholdMs ?? 300000; // 5 minutes

    this.outboxManager = new TransactionalOutboxManager(
      this.outboxStore,
      async (queueName: JobQueueName, job: JobOutboxRecord) => {
        const queue = this.queues.get(queueName);
        if (!queue) {
          throw new Error(`BullMQ Queue not configured for '${queueName}'`);
        }
        await queue.add(queueName, job.payload, {
          jobId: job.idempotencyKey,
          attempts: job.maxAttempts,
        });
      },
    );
  }

  get manager(): TransactionalOutboxManager {
    return this.outboxManager;
  }

  async dispatchOnce(): Promise<number> {
    const dispatched = await this.outboxManager.dispatchPending(this.batchSize);
    if (dispatched > 0) {
      logger.info(`Dispatched ${dispatched} pending outbox jobs to BullMQ transport`);
    }
    return dispatched;
  }

  async recoverStale(): Promise<number> {
    const recovered = await this.outboxManager.recoverStaleRunningJobs(this.staleThresholdMs);
    if (recovered > 0) {
      logger.warn(`Recovered ${recovered} stale running jobs back to pending status`);
    }
    return recovered;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Outbox Dispatcher background loop started', {
      pollIntervalMs: this.pollIntervalMs,
    });

    const tick = async () => {
      if (!this.isRunning) return;
      try {
        await this.dispatchOnce();
        await this.recoverStale();
      } catch (err) {
        logger.error('Error during outbox dispatcher tick', err as Error);
      }
      if (this.isRunning) {
        this.timer = setTimeout(tick, this.pollIntervalMs);
      }
    };

    this.timer = setTimeout(tick, this.pollIntervalMs);
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('Outbox Dispatcher background loop stopped');
  }
}
