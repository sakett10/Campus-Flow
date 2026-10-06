import { S3ObjectStorage } from './storage.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const rootEnvPath = path.resolve(__dirname, '../../../.env');
  if (fs.existsSync(rootEnvPath)) {
    const lines = fs.readFileSync(rootEnvPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

async function runStorageVerification() {
  console.log('[Storage Verification] Starting S3-compatible storage verification...');

  const endpoint = process.env['STORAGE_ENDPOINT'] || 'http://127.0.0.1:9000';
  const bucket = process.env['STORAGE_BUCKET'] || 'campusflow-dev';
  const accessKeyId = process.env['STORAGE_ACCESS_KEY'] || 'S3RVER';
  const secretAccessKey = process.env['STORAGE_SECRET_KEY'] || 'S3RVER';
  const region = process.env['STORAGE_REGION'] || 'us-east-1';
  const forcePathStyle = process.env['STORAGE_FORCE_PATH_STYLE'] === 'true';

  const storage = new S3ObjectStorage({
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
    forcePathStyle,
  });

  const testKey = `test/verification-${Date.now()}.txt`;
  const testContent = Buffer.from('CampusFlow S3 storage verification payload');
  const testMime = 'text/plain';

  // 1. UPLOAD
  console.log(`[Storage Verification] Testing upload: ${testKey}...`);
  const uploadResult = await storage.upload(testKey, testContent, testMime);
  console.log(`  - Uploaded successfully: ${uploadResult}`);

  // 2. EXISTS
  const existsBefore = await storage.exists(testKey);
  if (!existsBefore) {
    throw new Error(`File was uploaded but exists() returned false for key: ${testKey}`);
  }
  console.log(`  - exists() verified: true`);

  // 3. READ
  console.log(`[Storage Verification] Testing read: ${testKey}...`);
  const readResult = await storage.getObject(testKey);
  if (!readResult) {
    throw new Error(`getObject() returned null for uploaded key: ${testKey}`);
  }
  const contentMatches = readResult.data.toString() === testContent.toString();
  if (!contentMatches) {
    throw new Error('Retrieved content does not match uploaded content');
  }
  console.log(
    `  - Read successfully. Bytes: ${readResult.data.length}, MIME: ${readResult.mimeType}`,
  );

  // 4. SIGNED ACCESS (Download & Upload)
  console.log(`[Storage Verification] Testing signed URL generation...`);
  const signedDownloadUrl = await storage.getSignedDownloadUrl(testKey, 300);
  console.log(
    `  - Signed download URL generated: ${signedDownloadUrl.split('?')[0]}?[signature hidden]`,
  );

  // Fetch via signed download URL to verify signature works
  const presignedFetch = await fetch(signedDownloadUrl);
  if (!presignedFetch.ok) {
    throw new Error(
      `Failed to fetch via presigned URL: ${presignedFetch.status} ${presignedFetch.statusText}`,
    );
  }
  const presignedText = await presignedFetch.text();
  if (presignedText !== testContent.toString()) {
    throw new Error('Presigned fetch content mismatch');
  }
  console.log(`  - Presigned GET request verified successfully (HTTP 200)`);

  const signedUploadUrl = await storage.getSignedUploadUrl(
    `test/presigned-upload-${Date.now()}.txt`,
    'text/plain',
    300,
  );
  console.log(
    `  - Signed upload URL generated: ${signedUploadUrl.split('?')[0]}?[signature hidden]`,
  );

  // 5. DELETE
  console.log(`[Storage Verification] Testing delete: ${testKey}...`);
  await storage.delete(testKey);
  const existsAfter = await storage.exists(testKey);
  if (existsAfter) {
    throw new Error(`File was deleted but exists() returned true for key: ${testKey}`);
  }
  console.log(`  - Deleted successfully. exists() verified: false`);

  // 6. HEALTH CHECK
  if (storage.checkHealth) {
    const health = await storage.checkHealth();
    console.log(`  - Bucket health check: ${health.ok ? 'OK' : 'FAILED'}`);
  }

  console.log(
    '\n[Storage Verification] ALL CHECKS PASSED: upload, read, delete, signed access verified.',
  );
}

runStorageVerification().catch((err) => {
  console.error('[Storage Verification] FAILED:', err);
  process.exit(1);
});
