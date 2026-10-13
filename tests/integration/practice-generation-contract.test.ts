import { describe, it, expect, beforeEach } from 'vitest';
import { createApiApp } from '../../services/api/src/app.js';
import { defaultStore } from '../../services/api/src/data/store.js';
import type { PracticeAssessment } from '@campusflow/types';

describe('Practice Assessment Generation Contract & Validation Regression Suite', () => {
  const testUserId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const app = createApiApp();

  let courseId: string;
  let otherCourseId: string;
  let topicId1: string;
  let topicId2: string;
  let blueprintPaperId: string;
  let otherBlueprintPaperId: string;

  beforeEach(async () => {
    defaultStore.clear();
    process.env['AUTH_TEST_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'test';

    // 1. Setup user course with topics
    const course = await defaultStore.createCourse({
      userId: testUserId,
      code: 'CSE4001',
      title: 'Distributed Systems',
      term: 'Fall 2026',
    });
    courseId = course.id;

    const [t1, t2] = await defaultStore.createAcademicNodes([
      {
        courseId,
        userId: testUserId,
        parentId: null,
        type: 'topic',
        title: 'Paxos Consensus Algorithm',
        description: 'Distributed consensus mechanisms',
        orderIndex: 1,
        origin: 'user',
        confidence: 1.0,
        needsReview: 'no',
      },
      {
        courseId,
        userId: testUserId,
        parentId: null,
        type: 'topic',
        title: 'Vector Clocks and Causality',
        description: 'Logical time tracking in distributed networks',
        orderIndex: 2,
        origin: 'user',
        confidence: 1.0,
        needsReview: 'no',
      },
    ]);
    topicId1 = t1!.id;
    topicId2 = t2!.id;

    // 2. Setup user blueprint paper
    const paper = await defaultStore.createExaminationPaper({
      courseId,
      userId: testUserId,
      title: 'Mid-Term Blueprint',
      examType: 'CAT-1',
      term: 'Fall 2026',
      totalMarks: 50,
      durationMinutes: 90,
      instructions: 'Answer all questions.',
    });
    blueprintPaperId = paper.id;

    // 3. Setup other user course and blueprint paper
    const otherCourse = await defaultStore.createCourse({
      userId: otherUserId,
      code: 'CSE4002',
      title: 'Network Security',
      term: 'Fall 2026',
    });
    otherCourseId = otherCourse.id;

    const otherPaper = await defaultStore.createExaminationPaper({
      courseId: otherCourseId,
      userId: otherUserId,
      title: 'Other User Blueprint',
      examType: 'FAT',
      term: 'Fall 2026',
      totalMarks: 100,
      durationMinutes: 180,
      instructions: 'Confidential.',
    });
    otherBlueprintPaperId = otherPaper.id;
  });

  // 1. Valid minimal practice-generation request
  it('1. accepts a valid minimal practice-generation request with default parameters', async () => {
    const res = await app.request(`/api/v1/examination/courses/${courseId}/practice/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const assessment = (await res.json()) as PracticeAssessment;
    expect(assessment.id).toBeDefined();
    expect(assessment.format).toBe('standard');
    expect(assessment.difficulty).toBe('medium');
    expect(assessment.blueprintId).toBeNull();
    expect(assessment.questions.length).toBeGreaterThanOrEqual(3);
    expect(assessment.totalMarks).toBeGreaterThan(0);
  });

  // 2. Request containing the actual previously failing payload
  it('2. successfully processes the previously failing payload { format: "mixed", difficulty: "medium" }', async () => {
    const res = await app.request(`/api/v1/examination/courses/${courseId}/practice/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({
        format: 'mixed',
        difficulty: 'medium',
      }),
    });

    expect(res.status).toBe(201);
    const assessment = (await res.json()) as PracticeAssessment;
    expect(assessment.id).toBeDefined();
    expect(assessment.format).toBe('standard'); // 'mixed' normalized to 'standard'
    expect(assessment.difficulty).toBe('medium');
    expect(assessment.questions.length).toBe(5);
  });

  // 3. Missing optional fields (with defaults)
  it('3. handles optional fields and empty string blueprintId gracefully', async () => {
    const res = await app.request(`/api/v1/examination/courses/${courseId}/practice/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({
        blueprintId: '',
        focusTopicIds: [topicId1],
      }),
    });

    expect(res.status).toBe(201);
    const assessment = (await res.json()) as PracticeAssessment;
    expect(assessment.blueprintId).toBeNull();
    expect(assessment.format).toBe('standard');
    expect(assessment.difficulty).toBe('medium');
  });

  // 4. Incorrect field types
  it('4. rejects incorrect field types with clear validation messages', async () => {
    const res = await app.request(`/api/v1/examination/courses/${courseId}/practice/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({
        format: 12345,
        focusTopicIds: 'not-an-array',
      }),
    });

    expect(res.status).toBe(400);
    const err = (await res.json()) as {
      detail: string;
      invalidParams: Array<{ name: string; reason: string }>;
    };
    expect(err.detail).toContain('Invalid generate practice payload');
    expect(err.invalidParams).toBeDefined();
    const paramNames = err.invalidParams.map((p) => p.name);
    expect(paramNames).toContain('format');
    expect(paramNames).toContain('focusTopicIds');
  });

  // 5. Unsupported examination formats or difficulty values
  it('5. provides field-level error messages for unsupported format and difficulty values', async () => {
    const res = await app.request(`/api/v1/examination/courses/${courseId}/practice/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({
        format: 'ultra_quantum_exam',
        targetDifficulty: 'impossible',
      }),
    });

    expect(res.status).toBe(400);
    const err = (await res.json()) as {
      detail: string;
      invalidParams: Array<{ name: string; reason: string }>;
    };
    expect(err.detail).toContain('Unsupported examination format');
    expect(err.detail).toContain('Invalid targetDifficulty');
    expect(err.invalidParams).toHaveLength(2);
    expect(
      err.invalidParams.some(
        (p) => p.name === 'format' && p.reason.includes('Unsupported examination format'),
      ),
    ).toBe(true);
    expect(
      err.invalidParams.some(
        (p) => p.name === 'targetDifficulty' && p.reason.includes('Invalid targetDifficulty'),
      ),
    ).toBe(true);
  });

  // 6. Invalid or inaccessible course identifiers
  it('6. rejects invalid and non-existent course identifiers', async () => {
    // Malformed UUID
    const malformedRes = await app.request(
      `/api/v1/examination/courses/not-a-valid-uuid/practice/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
          'x-test-user-id': testUserId,
        },
        body: JSON.stringify({ format: 'standard' }),
      },
    );
    expect(malformedRes.status).toBe(400);

    // Non-existent UUID
    const nonExistentRes = await app.request(
      `/api/v1/examination/courses/99999999-9999-4999-a999-999999999999/practice/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
          'x-test-user-id': testUserId,
        },
        body: JSON.stringify({ format: 'standard' }),
      },
    );
    expect(nonExistentRes.status).toBe(404);
  });

  // 7. Authentication and course-ownership enforcement
  it('7. enforces authentication, course ownership, and blueprint-to-course isolation', async () => {
    // Unauthenticated request
    const unauthRes = await app.request(
      `/api/v1/examination/courses/${courseId}/practice/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format: 'standard' }),
      },
    );
    expect(unauthRes.status).toBe(401);

    // Requesting another user's course
    const forbiddenCourseRes = await app.request(
      `/api/v1/examination/courses/${otherCourseId}/practice/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
          'x-test-user-id': testUserId,
        },
        body: JSON.stringify({ format: 'standard' }),
      },
    );
    expect(forbiddenCourseRes.status).toBe(403);

    // Requesting a blueprint belonging to another user
    const otherUserBlueprintRes = await app.request(
      `/api/v1/examination/courses/${courseId}/practice/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
          'x-test-user-id': testUserId,
        },
        body: JSON.stringify({
          blueprintId: otherBlueprintPaperId,
        }),
      },
    );
    expect(otherUserBlueprintRes.status).toBe(403);
  });

  // 8. Successful generation of questions with expected marks and structure
  it('8. generates structure-matched questions respecting blueprint marks, rubrics, and format options', async () => {
    // Full simulation with blueprint
    const simRes = await app.request(`/api/v1/examination/courses/${courseId}/practice/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({
        format: 'full_simulation',
        blueprintId: blueprintPaperId,
        targetDifficulty: 'hard',
      }),
    });

    expect(simRes.status).toBe(201);
    const assessment = (await simRes.json()) as PracticeAssessment;
    expect(assessment.format).toBe('full_simulation');
    expect(assessment.difficulty).toBe('hard');
    expect(assessment.blueprintId).toBe(blueprintPaperId);
    expect(assessment.durationMinutes).toBe(90); // inherited from blueprint
    expect(assessment.questions.length).toBe(6);

    // Check individual question structure
    const mcq = assessment.questions[0]!;
    expect(mcq.questionFormat).toBe('multiple_choice');
    expect(mcq.options).toBeDefined();
    expect(mcq.options!.length).toBe(4);
    expect(mcq.options!.some((opt) => opt.isCorrect)).toBe(true);
    expect(mcq.rubric.length).toBeGreaterThan(0);
    expect(mcq.workedSolution).toBeDefined();

    // Quick diagnostic mode
    const diagRes = await app.request(`/api/v1/examination/courses/${courseId}/practice/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({
        format: 'quick_diagnostic',
        targetDifficulty: 'easy',
        focusTopicIds: [topicId2],
      }),
    });

    expect(diagRes.status).toBe(201);
    const diagAssessment = (await diagRes.json()) as PracticeAssessment;
    expect(diagAssessment.format).toBe('quick_diagnostic');
    expect(diagAssessment.questions.length).toBe(3);
    expect(diagAssessment.totalMarks).toBe(15);
    expect(diagAssessment.durationMinutes).toBe(20);
    expect(diagAssessment.difficulty).toBe('easy');
    expect(diagAssessment.questions.every((q) => q.topicId === topicId2)).toBe(true);
  });
});
