import { describe, it, expect, beforeEach } from 'vitest';
import { createApiApp } from '../../services/api/src/app.js';
import { defaultStore } from '../../services/api/src/data/store.js';

describe('Today API Integration Suite (GET /api/v1/today)', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const app = createApiApp();

  beforeEach(() => {
    defaultStore.clear();
    process.env['AUTH_TEST_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'test';
  });

  it('1. GET /api/v1/today requires authentication (401 without user header)', async () => {
    // When test bypass is disabled, unauthorized request must return 401
    const originalBypass = process.env['AUTH_TEST_BYPASS'];
    delete process.env['AUTH_TEST_BYPASS'];

    try {
      const res = await app.request('/api/v1/today', {
        headers: {},
      });
      expect(res.status).toBe(401);
    } finally {
      process.env['AUTH_TEST_BYPASS'] = originalBypass;
    }
  });

  it('2. GET /api/v1/today returns complete, authenticated overview for User A', async () => {
    // Setup course for User A
    const courseA = await defaultStore.createCourse({
      userId: userA,
      code: 'ECE2002',
      title: 'Digital Logic Design',
      term: 'Fall 2026',
    });

    // Create topic
    const [topic] = await defaultStore.createAcademicNodes([
      {
        courseId: courseA.id,
        userId: userA,
        parentId: null,
        type: 'topic',
        title: 'Karnaugh Maps',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);

    // Set topic state to learning
    await defaultStore.setTopicStudyState(courseA.id, topic!.id, userA, 'learning');

    // Create assessment
    await defaultStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'DLD Quiz 1',
      type: 'Quiz',
      date: new Date(Date.now() + 86400000 * 3),
      totalMarks: 50,
      weightage: '15%',
    });

    const res = await app.request('/api/v1/today', {
      headers: {
        'x-test-user-id': userA,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.courses).toHaveLength(1);
    expect(body.courses[0].code).toBe('ECE2002');

    expect(body.assessments.upcoming).toHaveLength(1);
    expect(body.assessments.upcoming[0].title).toBe('DLD Quiz 1');
    expect(body.assessments.upcoming[0].courseCode).toBe('ECE2002');
    expect(body.assessments.upcoming[0].weightage).toBe('15%');

    expect(body.continueStudying).toHaveLength(1);
    expect(body.continueStudying[0].topicTitle).toBe('Karnaugh Maps');

    expect(body.summary.totalCourses).toBe(1);
    expect(body.summary.upcomingAssessmentCount).toBe(1);
    expect(body.summary.activeTopicsCount).toBe(1);
  });

  it('3. Cross-user isolation: User B receives empty overview when only User A has data', async () => {
    const courseA = await defaultStore.createCourse({
      userId: userA,
      code: 'PHY1001',
      title: 'Physics I',
      term: 'Fall 2026',
    });

    await defaultStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Final Exam',
      type: 'FAT',
      date: new Date(Date.now() + 86400000 * 5),
    });

    const resB = await app.request('/api/v1/today', {
      headers: {
        'x-test-user-id': userB,
      },
    });

    expect(resB.status).toBe(200);
    const bodyB = await resB.json();

    expect(bodyB.courses).toHaveLength(0);
    expect(bodyB.assessments.upcoming).toHaveLength(0);
    expect(bodyB.summary.totalCourses).toBe(0);
  });

  it('4. Real-time refresh after topic study state mutation', async () => {
    const course = await defaultStore.createCourse({
      userId: userA,
      code: 'MAT3001',
      title: 'Advanced Calculus',
    });

    const [topic] = await defaultStore.createAcademicNodes([
      {
        courseId: course.id,
        userId: userA,
        parentId: null,
        type: 'topic',
        title: 'Fourier Transforms',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);

    // 1. Mark as needs_review
    await app.request(`/api/v1/courses/${course.id}/topics/${topic!.id}/study-state`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({ state: 'needs_review' }),
    });

    // Verify appears in needsReview
    const todayRes1 = await app.request('/api/v1/today', {
      headers: { 'x-test-user-id': userA },
    });
    const body1 = await todayRes1.json();
    expect(body1.needsReview).toHaveLength(1);
    expect(body1.needsReview[0].topicTitle).toBe('Fourier Transforms');

    // 2. Student clicks "Mark Reviewed"
    await app.request(`/api/v1/courses/${course.id}/topics/${topic!.id}/study-state`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({ state: 'reviewed' }),
    });

    // Verify disappears from needsReview on refresh
    const todayRes2 = await app.request('/api/v1/today', {
      headers: { 'x-test-user-id': userA },
    });
    const body2 = await todayRes2.json();
    expect(body2.needsReview).toHaveLength(0);
    expect(body2.summary.needsReviewCount).toBe(0);
  });

  it('5. Timezone query parameter validation in API endpoint', async () => {
    // Valid timezone
    const validRes = await app.request('/api/v1/today?timezone=Asia/Kolkata', {
      headers: { 'x-test-user-id': userA },
    });
    expect(validRes.status).toBe(200);

    // Invalid timezone
    const invalidRes = await app.request('/api/v1/today?timezone=Invalid_Zone_123', {
      headers: { 'x-test-user-id': userA },
    });
    expect(invalidRes.status).toBe(400);
    const body = await invalidRes.json();
    expect(body.detail).toContain('Invalid IANA timezone specified');
  });

  it('6. Completed assessments returned with timeframe: completed contract', async () => {
    const course = await defaultStore.createCourse({
      userId: userA,
      code: 'CSE4001',
      title: 'Parallel Processing',
    });

    await defaultStore.createAssessment({
      userId: userA,
      courseId: course.id,
      title: 'Term Project',
      type: 'Project',
      date: new Date('2026-10-01T12:00:00Z'),
      status: 'completed',
    });

    const res = await app.request('/api/v1/today', {
      headers: { 'x-test-user-id': userA },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assessments.completed).toHaveLength(1);
    expect(body.assessments.completed[0].timeframe).toBe('completed');
  });
});
