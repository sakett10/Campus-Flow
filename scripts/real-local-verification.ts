import { createApiApp } from '../services/api/src/app.js';
import { PostgresDataStore } from '../packages/database/src/store.js';
import { S3ObjectStorage } from '../packages/shared/src/storage.js';
import { processResourceJob } from '../services/worker/src/processors/resource-processor.js';
import { getEnv } from '../packages/config/src/index.js';

interface HealthCheckResponse {
  status: string;
  application: { status: string };
  services: {
    postgres: { status: string; latencyMs: number };
    redis: { status: string; latencyMs: number };
    storage: { status: string; latencyMs: number };
    ollama: { status: string; latencyMs: number; model: string };
  };
}

interface UserProfileResponse {
  id: string;
}

interface CourseResponse {
  id: string;
  code: string;
  title: string;
}

interface UploadUrlResponse {
  uploadUrl: string;
  objectKey: string;
}

interface ResourceResponse {
  id: string;
  title: string;
  processingStatus: string;
}

// Simple PDF generator generating valid PDF syntax
function createSamplePdfBuffer(): Buffer {
  const content = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    '4 0 obj << /Length 280 >> stream',
    'BT',
    '/F1 14 Tf',
    '50 720 Td',
    '(Module 1: Distributed Mutual Exclusion Algorithms) Tj',
    '0 -30 Td',
    '/F1 11 Tf',
    '(The Ricart-Agrawala algorithm provides mutual exclusion in distributed systems using Lamport timestamps.) Tj',
    '0 -20 Td',
    '(Vector clocks guarantee causal consistency across distributed nodes without global clock synchronization.) Tj',
    'ET',
    'endstream',
    'endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'xref',
    '0 6',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000266 00000 n ',
    '0000000600 00000 n ',
    'trailer << /Size 6 /Root 1 0 R >>',
    'startxref',
    '672',
    '%%EOF',
  ].join('\n');

  return Buffer.from(content, 'utf-8');
}

async function runEndToEndVerification() {
  console.log('====================================================');
  console.log(' CampusFlow Real Infrastructure E2E Verification');
  console.log('====================================================\n');

  const env = getEnv();
  const testUserId = '11111111-1111-4111-a111-111111111111';
  const authHeaders = {
    'content-type': 'application/json',
    authorization: `Bearer test_user_${testUserId}`,
    'x-test-user-id': testUserId,
  };

  const app = createApiApp();

  // 1. HEALTH CHECKS
  console.log('STEP 1: Verifying Health Checks for all active services...');
  const healthRes = await app.request('/health');
  if (!healthRes.ok) {
    throw new Error(`Health check returned HTTP ${healthRes.status}: ${await healthRes.text()}`);
  }
  const healthData = (await healthRes.json()) as HealthCheckResponse;
  console.log('  - Overall Status:', healthData.status);
  console.log('  - Application:', healthData.application.status);
  console.log(
    '  - PostgreSQL:',
    healthData.services.postgres.status,
    `(${healthData.services.postgres.latencyMs}ms)`,
  );
  console.log(
    '  - Redis:',
    healthData.services.redis.status,
    `(${healthData.services.redis.latencyMs}ms)`,
  );
  console.log(
    '  - Object Storage:',
    healthData.services.storage.status,
    `(${healthData.services.storage.latencyMs}ms)`,
  );
  console.log(
    '  - Ollama:',
    healthData.services.ollama.status,
    `(${healthData.services.ollama.latencyMs}ms, model: ${healthData.services.ollama.model})`,
  );

  if (healthData.services.postgres.status !== 'healthy')
    throw new Error('PostgreSQL is not healthy');
  if (healthData.services.redis.status !== 'healthy') throw new Error('Redis is not healthy');
  if (healthData.services.storage.status !== 'healthy')
    throw new Error('Object storage is not healthy');
  if (healthData.services.ollama.status !== 'healthy') throw new Error('Ollama is not healthy');

  // 2. AUTHENTICATION & USER SETUP
  console.log('\nSTEP 2: Verifying Server-Side User & Authentication...');
  const userProfileRes = await app.request('/api/v1/users/profile', {
    method: 'GET',
    headers: authHeaders,
  });
  if (!userProfileRes.ok) {
    throw new Error(
      `Failed to query user profile: ${userProfileRes.status} ${await userProfileRes.text()}`,
    );
  }
  const userProfile = (await userProfileRes.json()) as UserProfileResponse;
  console.log('  - User authenticated & verified in database:', userProfile.id);

  // 3. CREATE COURSE
  console.log('\nSTEP 3: Creating real Course...');
  const courseCode = `CS${Math.floor(1000 + Math.random() * 9000)}`;
  const courseRes = await app.request('/api/v1/courses', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      code: courseCode,
      title: 'Distributed Systems & Cloud Computing',
      term: 'Fall 2026',
    }),
  });
  if (!courseRes.ok) {
    throw new Error(`Failed to create course: ${courseRes.status} ${await courseRes.text()}`);
  }
  const course = (await courseRes.json()) as CourseResponse;
  console.log(`  - Course created: [${course.code}] ${course.title} (ID: ${course.id})`);

  // 4. OBJECT STORAGE & SIGNED ACCESS
  console.log('\nSTEP 4: Minting Signed Upload URL & Uploading Real PDF...');
  const storage = new S3ObjectStorage({
    endpoint: env.STORAGE_ENDPOINT,
    bucket: env.STORAGE_BUCKET,
    accessKeyId: env.STORAGE_ACCESS_KEY,
    secretAccessKey: env.STORAGE_SECRET_KEY,
    region: env.STORAGE_REGION,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
  });

  const uploadIntentRes = await app.request('/api/v1/resources/upload-url', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fileName: 'distributed-mutual-exclusion.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    }),
  });
  if (!uploadIntentRes.ok) {
    throw new Error(
      `Failed to get upload url: ${uploadIntentRes.status} ${await uploadIntentRes.text()}`,
    );
  }
  const uploadIntent = (await uploadIntentRes.json()) as UploadUrlResponse;
  console.log(`  - Object Key minted: ${uploadIntent.objectKey}`);
  console.log(
    `  - Presigned upload URL generated: ${uploadIntent.uploadUrl.split('?')[0]}?[signature hidden]`,
  );

  // Upload real PDF bytes to S3/R2 storage
  const pdfBuffer = createSamplePdfBuffer();
  await storage.putObject(uploadIntent.objectKey, pdfBuffer, 'application/pdf');
  console.log('  - PDF bytes written to S3 object storage successfully.');

  // Verify file exists in object storage
  const existsInStorage = await storage.exists(uploadIntent.objectKey);
  if (!existsInStorage) {
    throw new Error('Object not found in storage after upload!');
  }
  console.log('  - Verified object exists in object storage: true');

  // Register uploaded resource with API
  console.log('\nSTEP 5: Registering Resource with API...');
  const registerRes = await app.request('/api/v1/resources', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      courseId: course.id,
      title: 'Distributed Mutual Exclusion Lecture Notes',
      type: 'lecture_notes',
      objectKey: uploadIntent.objectKey,
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
    }),
  });
  if (!registerRes.ok) {
    throw new Error(
      `Failed to register resource: ${registerRes.status} ${await registerRes.text()}`,
    );
  }
  const resource = (await registerRes.json()) as ResourceResponse;
  console.log(`  - Resource registered: ${resource.title} (ID: ${resource.id})`);
  console.log(`  - Initial processing status: ${resource.processingStatus}`);

  // 6. WORKER INGESTION & PROCESSING
  console.log('\nSTEP 6: Executing Worker Ingestion Pipeline...');
  const store = new PostgresDataStore(env.DATABASE_URL);

  const processingResult = await processResourceJob(
    {
      resourceId: resource.id,
      userId: testUserId,
      courseId: course.id,
      objectKey: uploadIntent.objectKey,
      mimeType: 'application/pdf',
    },
    store,
    storage,
  );

  console.log(
    `  - Ingestion pipeline result: status=${processingResult.status}, chunks=${processingResult.chunkCount}`,
  );
  if (processingResult.status !== 'ready') {
    throw new Error(`Ingestion failed: ${processingResult.error}`);
  }

  // 7. VERIFY RESOURCE STATE & CHUNKS
  console.log('\nSTEP 7: Verifying Extracted Chunks & State Transition...');
  const updatedResource = await store.getResource(resource.id, testUserId);
  console.log(`  - Resource transition verified: ${updatedResource.processingStatus}`);
  console.log(`  - Page count: ${updatedResource.pageCount}`);

  const chunks = await store.listChunks(resource.id, testUserId);
  console.log(`  - Stored chunks in database: ${chunks.length}`);
  if (chunks.length === 0) {
    throw new Error('No chunks found for processed resource!');
  }
  console.log(`  - Sample chunk preview: "${chunks[0]?.content.slice(0, 80)}..."`);

  // 8. FULL-TEXT SEARCH (FTS) & SOURCE CITATION
  console.log('\nSTEP 8: Verifying Full-Text Search (FTS) & Citations...');
  const searchResults = await store.searchChunks(testUserId, 'Ricart-Agrawala');
  console.log(`  - Search results for "Ricart-Agrawala": ${searchResults.length} match(es)`);
  if (searchResults.length === 0) {
    throw new Error('Full-Text Search failed to return matching chunks for "Ricart-Agrawala"!');
  }
  const topResult = searchResults[0]!;
  console.log(`  - Top match score: ${topResult.score}`);
  console.log(`  - Citation string: "${topResult.citation}"`);
  console.log(`  - Matched snippet: "${topResult.matchedText}"`);

  // 9. CLEANUP & DELETION
  console.log('\nSTEP 9: Deleting Resource and Verifying Cleanup...');
  await store.deleteResource(resource.id, testUserId);
  await storage.delete(uploadIntent.objectKey);

  const resourceExistsAfter = await store.listResources(testUserId, course.id);
  const resourceCleaned = !resourceExistsAfter.some((r) => r.id === resource.id);
  const storageCleaned = !(await storage.exists(uploadIntent.objectKey));
  const chunksAfter = await store.listChunks(resource.id, testUserId);

  console.log(`  - Resource deleted from database: ${resourceCleaned}`);
  console.log(`  - Storage object deleted from S3: ${storageCleaned}`);
  console.log(`  - Chunks purged from database: ${chunksAfter.length === 0}`);

  if (!resourceCleaned || !storageCleaned || chunksAfter.length !== 0) {
    throw new Error('Cleanup verification failed!');
  }

  // Cleanup course
  await store.deleteCourse(course.id, testUserId);
  await store.close();

  console.log('\n====================================================');
  console.log(' ALL VERIFICATIONS PASSED: 100% REAL INFRASTRUCTURE');
  console.log('====================================================\n');
  process.exit(0);
}

runEndToEndVerification().catch((err) => {
  console.error('\nE2E VERIFICATION FAILED:', err);
  process.exit(1);
});
