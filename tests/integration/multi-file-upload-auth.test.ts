import { describe, it, expect, beforeEach } from 'vitest';
import { createApiApp } from '../../services/api/src/app.js';
import { defaultStore } from '../../services/api/src/data/store.js';
import { INGESTION_LIMITS } from '@campusflow/shared';
import type { BatchUploadResponse, BatchExamPaperUploadResponse } from '@campusflow/types';

describe('Multi-File Uploads & Authentication Enforcement Test Suite', () => {
  const app = createApiApp();
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';

  let courseAId: string;

  beforeEach(async () => {
    defaultStore.clear();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_TEST_BYPASS'] = 'true';

    // Seed course for User A
    const cA = await defaultStore.createCourse({
      userId: userA,
      code: 'CSE3002',
      title: 'Database Systems',
      term: 'Fall 2026',
    });
    courseAId = cA.id;

    // Seed course for User B
    await defaultStore.createCourse({
      userId: userB,
      code: 'PHY2001',
      title: 'Electromagnetic Theory',
      term: 'Fall 2026',
    });
  });

  // ==========================================
  // 1. Authentication & Authorization Tests
  // ==========================================
  describe('Authentication & Authorization Invariants', () => {
    it('1. Successfully uploads batch with an authorized session token', async () => {
      const fd = new FormData();
      fd.append('files', new Blob(['Lecture 1: Relational Algebra']), 'lecture1.txt');
      fd.append('files', new Blob(['Lecture 2: Normalization Forms']), 'lecture2.txt');
      fd.append('courseId', courseAId);
      fd.append('type', 'lecture_notes');

      const res = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as BatchUploadResponse;
      expect(data.summary.total).toBe(2);
      expect(data.summary.succeeded).toBe(2);
      expect(data.summary.failed).toBe(0);
      expect(data.results).toHaveLength(2);
      expect(data.results[0]?.status).toBe('uploaded');
      expect(data.results[0]?.processingStatus).toBe('queued');
      expect(data.results[1]?.status).toBe('uploaded');
    });

    it('2. Strictly rejects batch upload when Authorization header is missing', async () => {
      const fd = new FormData();
      fd.append('files', new Blob(['Lecture note']), 'notes.txt');
      fd.append('courseId', courseAId);

      const res = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        body: fd,
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.detail || data.message).toContain('Authentication token required');
    });

    it('3. Rejects batch upload when Bearer token is empty or invalid format', async () => {
      const fd = new FormData();
      fd.append('files', new Blob(['Lecture note']), 'notes.txt');

      const res = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ',
        },
        body: fd,
      });

      expect(res.status).toBe(401);
    });

    it('4. Rejects test bypass header when AUTH_TEST_BYPASS is disabled', async () => {
      process.env['AUTH_TEST_BYPASS'] = 'false';

      const fd = new FormData();
      fd.append('files', new Blob(['Lecture note']), 'notes.txt');

      const res = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          'x-test-user-id': userA,
        },
        body: fd,
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.detail || data.message).toContain('Authentication token required');
    });

    it('5. Enforces course ownership: User B cannot upload documents to User A course', async () => {
      const fd = new FormData();
      fd.append('files', new Blob(['Intrusion attempt']), 'malicious.txt');
      fd.append('courseId', courseAId); // Belongs to User A

      const res = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_b',
          'x-test-user-id': userB, // Authenticated as User B
        },
        body: fd,
      });

      // Assert ownership failure produces 403 Forbidden
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.detail || data.message).toContain('Access denied');
    });

    it('6. Ensures user isolation: User B cannot view or access resources uploaded by User A', async () => {
      // User A uploads
      const fd = new FormData();
      fd.append('files', new Blob(['Private research']), 'user_a_private.txt');
      fd.append('courseId', courseAId);

      const uploadRes = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd,
      });
      expect(uploadRes.status).toBe(200);
      const uploadData = (await uploadRes.json()) as BatchUploadResponse;
      const resourceId = uploadData.results[0]?.resourceId as string;

      // User B attempts to access User A's resource directly
      const getRes = await app.request(`/api/v1/resources/${resourceId}`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test_user_b',
          'x-test-user-id': userB,
        },
      });

      expect(getRes.status).toBe(403);
    });
  });

  // ==========================================
  // 2. Multiple-Upload Validation & Reliability
  // ==========================================
  describe('Multiple-Upload Batch Mechanics & Partial Failures', () => {
    it('1. Handles mixed valid and unsupported file types without failing the entire batch', async () => {
      const fd = new FormData();
      fd.append('files', new Blob(['Valid text notes']), 'notes.txt');
      fd.append('files', new Blob(['Dangerous binary payload']), 'script.exe');
      fd.append('files', new Blob(['# Markdown Document\nContent']), 'readme.md');
      fd.append('courseId', courseAId);

      const res = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as BatchUploadResponse;
      expect(data.summary.total).toBe(3);
      expect(data.summary.succeeded).toBe(2);
      expect(data.summary.failed).toBe(1);

      const exeResult = data.results.find((r) => r.originalName === 'script.exe');
      expect(exeResult).toBeDefined();
      expect(exeResult?.status).toBe('rejected');
      expect(exeResult?.error).toContain('Unsupported file format');

      const txtResult = data.results.find((r) => r.originalName === 'notes.txt');
      expect(txtResult?.status).toBe('uploaded');

      const mdResult = data.results.find((r) => r.originalName === 'readme.md');
      expect(mdResult?.status).toBe('uploaded');
    });

    it('2. Handles corrupted or malformed documents independently in batch', async () => {
      const fd = new FormData();
      fd.append('files', new Blob(['Legitimate lecture text']), 'lecture1.txt');
      // Invalid PDF header/structure
      fd.append('files', new Blob(['not-a-pdf-corrupt-bytes']), 'corrupt.pdf');
      fd.append('courseId', courseAId);

      const res = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as BatchUploadResponse;
      expect(data.summary.total).toBe(2);
      expect(data.summary.succeeded).toBe(1);
      expect(data.summary.failed).toBe(1);

      const corruptPdf = data.results.find((r) => r.originalName === 'corrupt.pdf');
      expect(corruptPdf?.status).toBe('rejected');
      expect(corruptPdf?.error).toContain('Invalid PDF signature');
    });

    it('3. Enforces individual oversized file limits while allowing valid files', async () => {
      const fd = new FormData();
      fd.append('files', new Blob(['Regular sized file']), 'valid.txt');

      // Allocate a buffer exceeding INGESTION_LIMITS.MAX_FILE_SIZE_BYTES (within 100 MB batch limit)
      const oversizedBlob = new Blob([
        Buffer.alloc(INGESTION_LIMITS.MAX_FILE_SIZE_BYTES + 1024 * 1024),
      ]);
      fd.append('files', oversizedBlob, 'oversized.txt');
      fd.append('courseId', courseAId);

      const res = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as BatchUploadResponse;
      expect(data.summary.succeeded).toBe(1);
      expect(data.summary.failed).toBe(1);

      const oversizedResult = data.results.find((r) => r.originalName === 'oversized.txt');
      expect(oversizedResult?.status).toBe('rejected');
      expect(oversizedResult?.error).toContain('exceeds maximum allowed size');
    });

    it('4. Rejects request when batch exceeds maximum file count limit', async () => {
      const fd = new FormData();
      // Exceed INGESTION_LIMITS.MAX_BATCH_FILE_COUNT (10)
      for (let i = 1; i <= 11; i++) {
        fd.append('files', new Blob([`Content ${i}`]), `doc${i}.txt`);
      }
      fd.append('courseId', courseAId);

      const res = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.detail || data.message).toContain(
        'Batch file count (11) exceeds maximum allowed limit',
      );
    });

    it('5. Detects duplicate submissions and marks them as conflict when duplicateAction is reject', async () => {
      const content = 'Unique identical content across uploads';

      // 1. First upload
      const fd1 = new FormData();
      fd1.append('files', new Blob([content]), 'original.txt');
      fd1.append('courseId', courseAId);

      const res1 = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd1,
      });
      expect(res1.status).toBe(200);

      // 2. Second upload containing identical content
      const fd2 = new FormData();
      fd2.append('files', new Blob([content]), 'duplicate_attempt.txt');
      fd2.append('files', new Blob(['New non-duplicate content']), 'new_doc.txt');
      fd2.append('courseId', courseAId);
      fd2.append('duplicateAction', 'reject');

      const res2 = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd2,
      });

      expect(res2.status).toBe(200);
      const data2 = (await res2.json()) as BatchUploadResponse;
      expect(data2.summary.conflicts).toBe(1);
      expect(data2.summary.succeeded).toBe(1);

      const conflictItem = data2.results.find((r) => r.originalName === 'duplicate_attempt.txt');
      expect(conflictItem?.status).toBe('conflict');
      expect(conflictItem?.duplicateResource?.id).toBeDefined();
    });

    it('6. Replaces existing document when duplicateAction is replace', async () => {
      const content = 'Replaced document test content';

      // First upload
      const fd1 = new FormData();
      fd1.append('files', new Blob([content]), 'v1.txt');
      fd1.append('courseId', courseAId);

      const res1 = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd1,
      });
      const data1 = (await res1.json()) as BatchUploadResponse;
      const initialResourceId = data1.results[0]?.resourceId as string;

      // Second upload with replace
      const fd2 = new FormData();
      fd2.append('files', new Blob([content]), 'v2.txt');
      fd2.append('courseId', courseAId);
      fd2.append('duplicateAction', 'replace');

      const res2 = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd2,
      });

      expect(res2.status).toBe(200);
      const data2 = (await res2.json()) as BatchUploadResponse;
      expect(data2.summary.succeeded).toBe(1);
      expect(data2.summary.conflicts).toBe(0);

      // Verify old resource was deleted
      await expect(defaultStore.getResource(initialResourceId, userA)).rejects.toThrow();
    });

    it('7. Preserves course association and user ownership on all created resources', async () => {
      const fd = new FormData();
      fd.append('files', new Blob(['Chapter 1 content']), 'ch1.txt');
      fd.append('files', new Blob(['Chapter 2 content']), 'ch2.txt');
      fd.append('courseId', courseAId);
      fd.append('type', 'lecture_notes');

      const res = await app.request('/api/v1/resources/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd,
      });

      const data = (await res.json()) as BatchUploadResponse;
      for (const item of data.results) {
        expect(item.resourceId).toBeDefined();
        const stored = await defaultStore.getResource(item.resourceId!, userA);
        expect(stored.userId).toBe(userA);
        expect(stored.courseId).toBe(courseAId);
        expect(stored.type).toBe('lecture_notes');
        expect(stored.processingStatus).toBe('queued');
      }
    });
  });

  // ==========================================
  // 3. Batch Examination Upload Workflow
  // ==========================================
  describe('Batch Examination Papers Upload', () => {
    it('1. Uploads multiple examination papers and extracts structured questions', async () => {
      const paper1 = `
VIT UNIVERSITY - CAT-1 2025
Course Title: Database Systems
Total Marks: 50
1. Define 3NF and BCNF normalization forms with schema examples. [20 Marks]
2. Explain write-ahead logging in transaction recovery. [30 Marks]
`;

      const paper2 = `
VIT UNIVERSITY - CAT-2 2025
Course Title: Database Systems
Total Marks: 50
1. Describe B+ Tree indexing page structure and search traversal. [25 Marks]
2. Discuss deadlock detection algorithms in distributed locking. [25 Marks]
`;

      const fd = new FormData();
      fd.append('files', new Blob([paper1]), 'db_cat1.txt');
      fd.append('files', new Blob([paper2]), 'db_cat2.txt');

      const res = await app.request(`/api/v1/examination/courses/${courseAId}/papers/batch`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_a',
          'x-test-user-id': userA,
        },
        body: fd,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as BatchExamPaperUploadResponse;
      expect(data.summary.total).toBe(2);
      expect(data.summary.succeeded).toBe(2);
      expect(data.summary.failed).toBe(0);

      expect(data.results[0]?.paperId).toBeDefined();
      expect(data.results[0]?.questionCount).toBeGreaterThanOrEqual(1);

      expect(data.results[1]?.paperId).toBeDefined();
      expect(data.results[1]?.questionCount).toBeGreaterThanOrEqual(1);

      // Verify persisted papers
      const papers = await defaultStore.listExaminationPapers(courseAId, userA);
      expect(papers.length).toBeGreaterThanOrEqual(2);
    });

    it('2. Enforces course ownership on examination batch uploads', async () => {
      const fd = new FormData();
      fd.append('files', new Blob(['Exam paper']), 'paper.txt');

      const res = await app.request(`/api/v1/examination/courses/${courseAId}/papers/batch`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_user_b',
          'x-test-user-id': userB, // User B attempting upload to User A course
        },
        body: fd,
      });

      expect(res.status).toBe(403);
    });
  });
});
