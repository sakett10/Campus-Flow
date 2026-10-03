import { describe, it, expect, beforeEach } from 'vitest';
import { createApiApp } from '../../services/api/src/app.js';
import { defaultStore } from '../../services/api/src/data/store.js';

describe('Strict Server-Side Authorization & Ownership Enforcement', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const app = createApiApp();

  beforeEach(() => {
    defaultStore.clear();
    process.env['AUTH_TEST_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'test';
  });

  it('User A can create and retrieve their own course', async () => {
    // 1. Create course as User A
    const res = await app.request('/api/v1/courses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        code: 'CSE2001',
        title: 'Computer Organization and Architecture',
        term: 'Fall 2026',
      }),
    });

    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.id).toBeDefined();
    expect(created.userId).toBe(userA);
    expect(created.code).toBe('CSE2001');

    // 2. Retrieve course as User A
    const getRes = await app.request(`/api/v1/courses/${created.id}`, {
      headers: { 'x-test-user-id': userA },
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(created.id);
  });

  it("CROSS-USER ACCESS DENIAL: User B is denied (403) from accessing User A's course", async () => {
    // Create course owned by User A
    const courseA = await defaultStore.createCourse({
      userId: userA,
      code: 'MAT2001',
      title: 'Differential Equations and Transforms',
    });

    // User B attempts to access User A's course
    const res = await app.request(`/api/v1/courses/${courseA.id}`, {
      headers: { 'x-test-user-id': userB },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
    expect(body.detail).toContain('You do not own this course');
  });

  it("CROSS-USER ACCESS DENIAL: User B is denied (403) from deleting User A's course", async () => {
    const courseA = await defaultStore.createCourse({
      userId: userA,
      code: 'PHY1001',
      title: 'Engineering Physics',
    });

    // User B attempts to delete User A's course
    const res = await app.request(`/api/v1/courses/${courseA.id}`, {
      method: 'DELETE',
      headers: { 'x-test-user-id': userB },
    });

    expect(res.status).toBe(403);
    // Verify course still exists
    const check = await defaultStore.getCourse(courseA.id, userA);
    expect(check.id).toBe(courseA.id);
  });

  it("COURSE OWNERSHIP: User cannot create an assessment for another student's course", async () => {
    // Course owned by User A
    const courseA = await defaultStore.createCourse({
      userId: userA,
      code: 'CHY1001',
      title: 'Engineering Chemistry',
    });

    // User B attempts to create assessment for User A's course
    const res = await app.request('/api/v1/assessments', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userB,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        title: 'CAT 1 Exam',
        type: 'CAT',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it("RESOURCE OWNERSHIP: User B cannot access or mint download URL for User A's resource", async () => {
    // User A uploads a resource
    const resourceA = await defaultStore.createResource({
      userId: userA,
      title: 'Syllabus 2026.pdf',
      type: 'syllabus',
      objectKey: `users/${userA}/resources/syllabus.pdf`,
      mimeType: 'application/pdf',
    });

    // User A can mint download URL
    const resA = await app.request(`/api/v1/resources/${resourceA.id}/download-url`, {
      headers: { 'x-test-user-id': userA },
    });
    expect(resA.status).toBe(200);

    // User B attempts to mint download URL for User A's resource
    const resB = await app.request(`/api/v1/resources/${resourceA.id}/download-url`, {
      headers: { 'x-test-user-id': userB },
    });
    expect(resB.status).toBe(403);
    const body = await resB.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('INVALID IDS: Malformed UUID returns 400 Bad Request', async () => {
    const res = await app.request('/api/v1/courses/not-a-valid-uuid', {
      headers: { 'x-test-user-id': userA },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('NON-EXISTENT IDS: Random valid UUID returns 404 Not Found', async () => {
    const randomUuid = '99999999-9999-4999-a999-999999999999';
    const res = await app.request(`/api/v1/courses/${randomUuid}`, {
      headers: { 'x-test-user-id': userA },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  it('AUTHENTICATION ENFORCEMENT: Requests without authentication token or header return 401', async () => {
    const res = await app.request('/api/v1/courses', {
      method: 'GET',
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });
});
