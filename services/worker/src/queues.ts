import { Queue, type QueueOptions } from 'bullmq';
import type { JobQueueName } from '@campusflow/types';

export const QUEUE_NAMES: JobQueueName[] = [
  'ingestion',
  'extraction',
  'chunking',
  'embedding',
  'document-processing',
  'resource-processing',
  'mock-generation',
  'replanning',
  'reminders',
];

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export function createQueues(redisUrl: string): Map<JobQueueName, Queue> {
  const options: QueueOptions = {
    connection: { url: redisUrl },
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  };

  const queues = new Map<JobQueueName, Queue>();
  for (const name of QUEUE_NAMES) {
    queues.set(name, new Queue(name, options));
  }
  return queues;
}
