import { describe, it, expect, beforeEach } from 'vitest';
import { createApiApp } from '../../services/api/src/app.js';
import { defaultStore } from '../../services/api/src/data/store.js';
import { sharedOutboxManager } from '../../services/api/src/modules/resources/index.js';

describe('Comprehensive Security & Authorization Audit', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const attackerUser = '66666666-6666-4666-a666-666666666666';
  const app = createApiApp();

  beforeEach(async () => {
    defaultStore.clear();
    process.env['AUTH_TEST_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'test';

    // Seed User A and User B
    await defaultStore.createUser({
      id: userA,
      clerkId: `clerk_${userA}`,
      email: 'student_a@campusflow.test',
      fullName: 'Student A',
      role: 'student',
    });

    await defaultStore.createUser({
      id: userB,
      clerkId: `clerk_${userB}`,
      email: 'student_b@campusflow.test',
      fullName: 'Student B',
      role: 'student',
    });
  });

  it('FORGED COURSE ID: Accessing or manipulating another student course is rejected with 403', async () => {
    const courseA = await defaultStore.createCourse({
      userId: userA,
      code: 'CSE3001',
      title: 'Database Systems',
      term: 'Fall 2026',
    });

    // Attacker sends request attempting to read User A's course
    const readRes = await app.request(`/api/v1/courses/${courseA.id}`, {
      headers: { 'x-test-user-id': attackerUser },
    });
    expect(readRes.status).toBe(403);
    const readBody = await readRes.json();
    expect(readBody.code).toBe('FORBIDDEN');
    expect(readBody.detail).toContain('You do not own this course');

    // Attacker sends request attempting to delete User A's course
    const deleteRes = await app.request(`/api/v1/courses/${courseA.id}`, {
      method: 'DELETE',
      headers: { 'x-test-user-id': attackerUser },
    });
    expect(deleteRes.status).toBe(403);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.code).toBe('FORBIDDEN');
  });

  it('FORGED ASSESSMENT ID: Creating assessment referencing unowned course is rejected with 403', async () => {
    const courseA = await defaultStore.createCourse({
      userId: userA,
      code: 'MAT3001',
      title: 'Advanced Calculus',
    });

    // Attacker attempts to forge course ID in assessment creation
    const res = await app.request('/api/v1/assessments', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': attackerUser,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        title: 'Midterm Exam',
        type: 'FAT',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('FORGED RESOURCE ID: Reading or deleting another user resource is rejected with 403', async () => {
    const resourceA = await defaultStore.createResource({
      userId: userA,
      title: 'Lecture 1 Slides.pdf',
      type: 'lecture_notes',
      objectKey: `users/${userA}/resources/lecture1.pdf`,
      mimeType: 'application/pdf',
    });

    // User B attempts to fetch User A's resource metadata
    const getRes = await app.request(`/api/v1/resources/${resourceA.id}`, {
      headers: { 'x-test-user-id': userB },
    });
    expect(getRes.status).toBe(403);
    const getBody = await getRes.json();
    expect(getBody.code).toBe('FORBIDDEN');
    expect(getBody.detail).toContain('You do not own this resource');

    // User B attempts to delete User A's resource
    const delRes = await app.request(`/api/v1/resources/${resourceA.id}`, {
      method: 'DELETE',
      headers: { 'x-test-user-id': userB },
    });
    expect(delRes.status).toBe(403);
  });

  it('SIGNED DOWNLOAD URL: User cannot mint signed download URL for another user file', async () => {
    const resourceA = await defaultStore.createResource({
      userId: userA,
      title: 'Confidential Syllabus.pdf',
      type: 'syllabus',
      objectKey: `users/${userA}/resources/confidential.pdf`,
      mimeType: 'application/pdf',
    });

    const res = await app.request(`/api/v1/resources/${resourceA.id}/download-url`, {
      headers: { 'x-test-user-id': userB },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('SIGNED UPLOAD AUTHORIZATION: Upload object keys are strictly scoped to authenticated user', async () => {
    // 1. Valid user generates upload url
    const uploadRes = await app.request('/api/v1/resources/upload-url', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        fileName: 'chapter1.pdf',
        mimeType: 'application/pdf',
      }),
    });

    expect(uploadRes.status).toBe(200);
    const { uploadUrl, objectKey } = await uploadRes.json();
    expect(uploadUrl).toBeDefined();
    // Key must strictly start with authenticated user id
    expect(objectKey.startsWith(`users/${userA}/resources/`)).toBe(true);

    // 2. Cross-user storage injection: User B attempts to register a resource pointing to User A's storage key
    const hijackRes = await app.request('/api/v1/resources', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userB,
      },
      body: JSON.stringify({
        title: 'Hijacked File',
        type: 'lecture_notes',
        objectKey: objectKey, // User A's object key!
        mimeType: 'application/pdf',
      }),
    });

    expect(hijackRes.status).toBe(403);
    const hijackBody = await hijackRes.json();
    expect(hijackBody.code).toBe('FORBIDDEN');
    expect(hijackBody.detail).toContain('Object key does not belong to the authenticated user');
  });

  it('DELETED OWNER: Resources and courses are inaccessible after owner account deletion', async () => {
    // User A creates course and resource
    const courseA = await defaultStore.createCourse({
      userId: userA,
      code: 'HUM1001',
      title: 'Ethics and Values',
    });

    const resourceA = await defaultStore.createResource({
      userId: userA,
      courseId: courseA.id,
      title: 'Ethics Notes.pdf',
      type: 'lecture_notes',
      objectKey: `users/${userA}/resources/ethics.pdf`,
      mimeType: 'application/pdf',
    });

    // Delete User A account
    await defaultStore.deleteUser(userA);

    // Subsequent retrieval attempts fail
    await expect(defaultStore.getCourse(courseA.id, userA)).rejects.toThrow();
    await expect(defaultStore.getResource(resourceA.id, userA)).rejects.toThrow();
  });

  it('MISSING OWNER: Unregistered / non-existent user returns 404 or empty list safely', async () => {
    const nonExistentUser = '99999999-9999-4999-a999-999999999999';
    const courses = await defaultStore.listCourses(nonExistentUser);
    expect(courses).toEqual([]);

    const resources = await defaultStore.listResources(nonExistentUser);
    expect(resources).toEqual([]);
  });

  it('COURSE DELETION LIFECYCLE: Resources remain with course_id = null while assessments cascade', async () => {
    // Create course, assessment, and linked resource
    const course = await defaultStore.createCourse({
      userId: userA,
      code: 'PHY2001',
      title: 'Electromagnetic Theory',
    });

    const assessment = await defaultStore.createAssessment({
      userId: userA,
      courseId: course.id,
      title: 'Quiz 1',
      type: 'Quiz',
    });

    const resource = await defaultStore.createResource({
      userId: userA,
      courseId: course.id,
      title: 'Maxwell Equations Notes.pdf',
      type: 'lecture_notes',
      objectKey: `users/${userA}/resources/maxwell.pdf`,
      mimeType: 'application/pdf',
    });

    expect(resource.courseId).toBe(course.id);

    // Delete course
    await defaultStore.deleteCourse(course.id, userA);

    // 1. Course is deleted
    await expect(defaultStore.getCourse(course.id, userA)).rejects.toThrow();

    // 2. Assessment was cascaded (deleted)
    await expect(defaultStore.getAssessment(assessment.id, userA)).rejects.toThrow();

    // 3. Resource SURVIVES in user second brain with courseId = null
    const survivingResource = await defaultStore.getResource(resource.id, userA);
    expect(survivingResource).toBeDefined();
    expect(survivingResource.id).toBe(resource.id);
    expect(survivingResource.courseId).toBeNull();
  });

  it('COURSE IDOR: User A cannot attach a resource to User B course via POST /resources', async () => {
    const courseB = await defaultStore.createCourse({
      userId: userB,
      code: 'CS201',
      title: 'Data Structures',
    });

    const res = await app.request('/api/v1/resources', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        courseId: courseB.id,
        title: 'User A attempting to hijack Course B.pdf',
        type: 'lecture_notes',
        objectKey: `users/${userA}/resources/hijack.pdf`,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');

    // Verify NO resource was created for User A or User B
    const resourcesA = await defaultStore.listResources(userA);
    const resourcesB = await defaultStore.listResources(userB);
    expect(resourcesA).toHaveLength(0);
    expect(resourcesB).toHaveLength(0);

    // Verify NO outbox job was enqueued
    const pendingJobs = await sharedOutboxManager.getStore().listPending();
    expect(pendingJobs.filter((j) => j.payload['userId'] === userA)).toHaveLength(0);
  });

  it('COURSE ATTACH: User A can attach a resource to User A own course via POST /resources', async () => {
    const courseA = await defaultStore.createCourse({
      userId: userA,
      code: 'CS101',
      title: 'Intro to CS',
    });

    const res = await app.request('/api/v1/resources', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        title: 'Syllabus.pdf',
        type: 'syllabus',
        objectKey: `users/${userA}/resources/syllabus.pdf`,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.courseId).toBe(courseA.id);
    expect(body.userId).toBe(userA);

    const resourcesA = await defaultStore.listResources(userA);
    expect(resourcesA).toHaveLength(1);
    expect(resourcesA[0]?.id).toBe(body.id);
  });

  it('COURSE IDOR (DIRECT): User A cannot attach a direct upload to User B course via POST /resources/direct', async () => {
    const courseB = await defaultStore.createCourse({
      userId: userB,
      code: 'CS202',
      title: 'Algorithms',
    });

    const formData = new FormData();
    formData.append(
      'file',
      new Blob(['Algorithms lecture notes content for testing.'], { type: 'text/plain' }),
      'notes.txt',
    );
    formData.append('courseId', courseB.id);
    formData.append('title', 'Direct Upload Notes');
    formData.append('type', 'lecture_notes');

    const res = await app.request('/api/v1/resources/direct', {
      method: 'POST',
      headers: {
        'x-test-user-id': userA,
      },
      body: formData,
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');

    // Verify NO resource was created
    const resourcesA = await defaultStore.listResources(userA);
    expect(resourcesA).toHaveLength(0);
  });

  it('COURSE ATTACH (DIRECT): User A can attach a direct upload to User A own course via POST /resources/direct', async () => {
    const courseA = await defaultStore.createCourse({
      userId: userA,
      code: 'CS102',
      title: 'Operating Systems',
    });

    const formData = new FormData();
    formData.append(
      'file',
      new Blob(['Operating Systems lecture notes content for testing.'], { type: 'text/plain' }),
      'os_notes.txt',
    );
    formData.append('courseId', courseA.id);
    formData.append('title', 'OS Notes');
    formData.append('type', 'lecture_notes');

    const res = await app.request('/api/v1/resources/direct', {
      method: 'POST',
      headers: {
        'x-test-user-id': userA,
      },
      body: formData,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.courseId).toBe(courseA.id);
    expect(body.userId).toBe(userA);
  });

  it('FAKE INGESTION ENDPOINT: POST /api/v1/ingestion/enqueue no longer exists and returns 404', async () => {
    const res = await app.request('/api/v1/ingestion/enqueue', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        resourceId: '11111111-1111-4111-a111-111111111111',
      }),
    });

    expect(res.status).toBe(404);
  });
});
