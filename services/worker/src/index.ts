import { Worker, type Job } from 'bullmq';
import { validateEnv } from '@campusflow/config';
import { createLogger } from '@campusflow/shared';
import { QUEUE_NAMES } from './queues.js';

const logger = createLogger({ module: 'worker' });

export * from './processors/resource-processor.js';

async function processJob(job: Job) {
  const start = Date.now();
  const queueName = job.queueName;
  const jobId = job.id;
  const data = job.data as { userId?: string; resourceId?: string };

  logger.info(`Starting execution of job [${queueName}:${jobId}]`, {
    jobId,
    userId: data?.userId,
    queue: queueName,
  });

  if (queueName === 'resource-processing') {
    // In production, instantiate DB client and S3 client
    // Handled via processResourceJob
    logger.info(`Resource processing execution handler invoked for ${data?.resourceId}`);
  }

  const durationMs = Date.now() - start;
  logger.info(`Completed job [${queueName}:${jobId}] in ${durationMs}ms`, {
    jobId,
    userId: data?.userId,
    durationMs,
  });
}

export function startWorkers() {
  const env = validateEnv();
  const redisUrl = env.REDIS_URL;

  logger.info(`Initializing CampusFlow Worker against Redis...`);

  const workers: Worker[] = [];

  for (const queueName of QUEUE_NAMES) {
    const worker = new Worker(queueName, processJob, {
      connection: { url: redisUrl },
      concurrency: 5,
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job [${queueName}:${job?.id}] failed: ${err.message}`, err, {
        jobId: job?.id,
        queue: queueName,
      });
    });

    workers.push(worker);
  }

  logger.info(`CampusFlow Worker active. Listening on ${workers.length} queues.`);
  return workers;
}

if (process.env['NODE_ENV'] !== 'test') {
  startWorkers();
}
