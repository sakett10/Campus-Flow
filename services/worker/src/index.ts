import { Worker, type Job } from 'bullmq';
import { validateEnv, type EnvConfig } from '@campusflow/config';
import { createLogger, S3ObjectStorage } from '@campusflow/shared';
import { PostgresDataStore, PostgresOutboxStore } from '@campusflow/database';
import { QUEUE_NAMES, createQueues } from './queues.js';
import { processResourceJob, type ResourceJobPayload } from './processors/resource-processor.js';
import { OutboxDispatcher } from './dispatcher.js';

const logger = createLogger({ module: 'worker' });

export * from './processors/resource-processor.js';
export * from './dispatcher.js';
export * from './queues.js';

let sharedStore: PostgresDataStore | null = null;
let sharedStorage: S3ObjectStorage | null = null;

function getStoreAndStorage(env: EnvConfig) {
  if (!sharedStore) {
    sharedStore = new PostgresDataStore(env.DATABASE_URL);
  }
  if (!sharedStorage) {
    sharedStorage = new S3ObjectStorage({
      endpoint: env.STORAGE_ENDPOINT,
      bucket: env.STORAGE_BUCKET,
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
      region: env.STORAGE_REGION,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    });
  }
  return { store: sharedStore, storage: sharedStorage };
}

async function processJob(job: Job) {
  const start = Date.now();
  const queueName = job.queueName;
  const jobId = job.id;
  const data = job.data as ResourceJobPayload;

  logger.info(`Starting execution of job [${queueName}:${jobId}]`, {
    jobId,
    userId: data?.userId,
    queue: queueName,
  });

  if (queueName === 'resource-processing') {
    const env = validateEnv();
    const { store, storage } = getStoreAndStorage(env);
    logger.info(`Resource processing execution handler invoked for ${data?.resourceId}`);
    await processResourceJob(data, store, storage);
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

  logger.info(`Initializing CampusFlow Worker & Outbox Dispatcher against Redis...`);

  const queues = createQueues(redisUrl);
  const outboxStore = new PostgresOutboxStore(env.DATABASE_URL);
  const dispatcher = new OutboxDispatcher(outboxStore, queues);
  dispatcher.start();

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

  logger.info(
    `CampusFlow Worker active. Listening on ${workers.length} queues. Outbox dispatcher running.`,
  );
  return { workers, dispatcher, queues };
}

if (process.env['NODE_ENV'] !== 'test') {
  startWorkers();
}
