import { describe, it, expect, beforeEach } from 'vitest';
import { createApiApp } from '../../services/api/src/app.js';
import { defaultStore } from '../../services/api/src/data/store.js';
import type { Course, AcademicNode } from '@campusflow/types';

describe('Core Academic Workflows & Integration Audit Regression Suite', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const app = createApiApp();

  let courseA1: Course;
  let courseA2: Course;
  let courseB1: Course;
  let nodeA1: AcademicNode;
  let nodeA2: AcademicNode;
  let nodeB1: AcademicNode;

  beforeEach(async () => {
    defaultStore.clear();
    process.env['AUTH_TEST_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'test';

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

    // Create courses
    courseA1 = await defaultStore.createCourse({
      userId: userA,
      code: 'CSE101',
      title: 'Intro to Programming',
    });

    courseA2 = await defaultStore.createCourse({
      userId: userA,
      code: 'CSE102',
      title: 'Data Structures',
    });

    courseB1 = await defaultStore.createCourse({
      userId: userB,
      code: 'CSE201',
      title: 'Operating Systems',
    });

    // Create academic nodes
    const createdNodesA1 = await defaultStore.createAcademicNodes([
      {
        courseId: courseA1.id,
        userId: userA,
        parentId: null,
        type: 'module',
        title: 'Module 1: Variables and Functions',
        description: 'Basics of programming',
        orderIndex: 0,
        origin: 'user',
        confidence: 1.0,
        needsReview: 'no',
      },
    ]);
    nodeA1 = createdNodesA1[0]!;

    const createdNodesA2 = await defaultStore.createAcademicNodes([
      {
        courseId: courseA2.id,
        userId: userA,
        parentId: null,
        type: 'topic',
        title: 'Trees and Graphs',
        description: 'Hierarchical data structures',
        orderIndex: 0,
        origin: 'user',
        confidence: 1.0,
        needsReview: 'no',
      },
    ]);
    nodeA2 = createdNodesA2[0]!;

    const createdNodesB1 = await defaultStore.createAcademicNodes([
      {
        courseId: courseB1.id,
        userId: userB,
        parentId: null,
        type: 'topic',
        title: 'Concurrency & Deadlocks',
        description: 'Synchronization primitives',
        orderIndex: 0,
        origin: 'user',
        confidence: 1.0,
        needsReview: 'no',
      },
    ]);
    nodeB1 = createdNodesB1[0]!;
  });

  describe('1. Academic Map & Node Boundary Controls', () => {
    it('prevents modifying an academic node from a different course (BOLA containment)', async () => {
      // User A attempts to edit nodeA2 (from Course A2) via Course A1's URL route
      const res = await app.request(`/api/v1/courses/${courseA1.id}/map/nodes/${nodeA2.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': userA,
        },
        body: JSON.stringify({
          title: 'Tampered Title',
        }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.detail).toContain('Academic node does not belong to this course');
    });

    it('prevents deleting an academic node from a different course', async () => {
      // User A attempts to delete nodeA2 (from Course A2) via Course A1's URL route
      const res = await app.request(`/api/v1/courses/${courseA1.id}/map/nodes/${nodeA2.id}`, {
        method: 'DELETE',
        headers: {
          'x-test-user-id': userA,
        },
      });

      expect(res.status).toBe(404);
      // Verify node still exists
      const fetched = await defaultStore.getAcademicNode(nodeA2.id, userA);
      expect(fetched.id).toBe(nodeA2.id);
    });

    it('rejects circular parent assignment where parentId equals nodeId', async () => {
      const res = await app.request(`/api/v1/courses/${courseA1.id}/map/nodes/${nodeA1.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': userA,
        },
        body: JSON.stringify({
          parentId: nodeA1.id,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.detail).toContain('cannot be its own parent');
    });

    it('rejects cross-course parent assignment', async () => {
      // User A attempts to set nodeA1's parent to nodeA2 (from a different course)
      const res = await app.request(`/api/v1/courses/${courseA1.id}/map/nodes/${nodeA1.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': userA,
        },
        body: JSON.stringify({
          parentId: nodeA2.id,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.detail).toContain('Parent node does not belong to this course');
    });

    it('rejects linking a resource to an academic node in a different course', async () => {
      const res = await app.request(
        `/api/v1/courses/${courseA1.id}/map/nodes/${nodeA2.id}/resources`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-user-id': userA,
          },
          body: JSON.stringify({
            resourceId: '33333333-3333-4333-a333-333333333333',
          }),
        },
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.detail).toContain('Academic node does not belong to this course');
    });
  });

  describe('2. Assessment Topic Linkage & IDOR Prevention', () => {
    it('rejects linking a topic from a different course via /courses/:id/assessments/:assessmentId/topics', async () => {
      const assessmentA1 = await defaultStore.createAssessment({
        userId: userA,
        courseId: courseA1.id,
        title: 'Quiz 1',
        type: 'Quiz',
      });

      // User A attempts to link nodeA2 (from Course A2) to assessmentA1 (Course A1)
      const res = await app.request(
        `/api/v1/courses/${courseA1.id}/assessments/${assessmentA1.id}/topics`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-user-id': userA,
          },
          body: JSON.stringify({
            topicId: nodeA2.id,
            weight: 20,
          }),
        },
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.detail).toContain('Topic does not belong to the assessment course');
    });

    it('rejects linking a topic from a different course via standalone /assessments/:id/topics', async () => {
      const assessmentA1 = await defaultStore.createAssessment({
        userId: userA,
        courseId: courseA1.id,
        title: 'Midterm',
        type: 'CAT',
      });

      const res = await app.request(`/api/v1/assessments/${assessmentA1.id}/topics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': userA,
        },
        body: JSON.stringify({
          topicId: nodeA2.id,
          weight: 50,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.detail).toContain('Topic does not belong to the assessment course');
    });

    it('rejects linking another student topic to an assessment', async () => {
      const assessmentA1 = await defaultStore.createAssessment({
        userId: userA,
        courseId: courseA1.id,
        title: 'Final Exam',
        type: 'FAT',
      });

      // User A attempts to link User B's topic node
      const res = await app.request(`/api/v1/assessments/${assessmentA1.id}/topics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': userA,
        },
        body: JSON.stringify({
          topicId: nodeB1.id,
          weight: 100,
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('3. Study Plan & Session Route Consistency', () => {
    it('rejects updating a study session via the wrong course route', async () => {
      const planA2 = await defaultStore.createStudyPlan({
        userId: userA,
        courseId: courseA2.id,
        title: 'Plan A2',
        targetExamDate: new Date('2026-11-15'),
        status: 'active',
      });

      const [sessA2] = await defaultStore.createStudySessions([
        {
          planId: planA2.id,
          userId: userA,
          courseId: courseA2.id,
          topicId: nodeA2.id,
          title: 'Review Trees',
          scheduledDate: new Date('2026-10-20'),
          durationMinutes: 45,
          sessionType: 'study',
          status: 'scheduled',
          orderIndex: 0,
        },
      ]);

      // Attempt to update sessA2 (Course A2) via Course A1's route
      const res = await app.request(`/api/v1/courses/${courseA1.id}/plan/sessions/${sessA2!.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': userA,
        },
        body: JSON.stringify({
          status: 'completed',
        }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.detail).toContain('Study session does not belong to this course');
    });

    it('rejects deleting a topic resource from the wrong course/topic route', async () => {
      const trA1 = await defaultStore.createTopicResource({
        topicId: nodeA1.id,
        courseId: courseA1.id,
        userId: userA,
        title: 'Variables Reference Guide',
        type: 'article',
        verificationStatus: 'verified_external',
      });

      // Attempt to delete trA1 via Course A2's route
      const res = await app.request(
        `/api/v1/courses/${courseA2.id}/topics/${nodeA2.id}/resources/${trA1.id}`,
        {
          method: 'DELETE',
          headers: {
            'x-test-user-id': userA,
          },
        },
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.detail).toContain('Topic resource does not belong to this topic/course');
    });
  });

  describe('4. Search Scope & Isolation', () => {
    it('rejects search requests targeting an unowned courseId with 403', async () => {
      // User A attempts to search with User B's courseId
      const res = await app.request(`/api/v1/search?q=deadlock&courseId=${courseB1.id}`, {
        headers: {
          'x-test-user-id': userA,
        },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });

    it('rejects POST search targeting an unowned courseId with 403', async () => {
      const res = await app.request('/api/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': userA,
        },
        body: JSON.stringify({
          query: 'operating systems',
          courseId: courseB1.id,
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('5. Examination Intelligence & Integrity', () => {
    it('rejects practice generation if focusTopicIds do not belong to the course', async () => {
      // User A generates practice for courseA1, but passes nodeA2 (from Course A2) as focus topic
      const res = await app.request(
        `/api/v1/examination/courses/${courseA1.id}/practice/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-user-id': userA,
          },
          body: JSON.stringify({
            format: 'standard',
            focusTopicIds: [nodeA2.id],
          }),
        },
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.detail).toContain('do not belong to this course');
    });

    it('strictly hides solutions in GET /practice/:id before submission even if showSolutions=true', async () => {
      // Create a topic node of type topic for courseA1
      const [topic] = await defaultStore.createAcademicNodes([
        {
          courseId: courseA1.id,
          userId: userA,
          parentId: null,
          type: 'topic',
          title: 'Functions & Recursion',
          orderIndex: 1,
          origin: 'user',
          confidence: 1.0,
          needsReview: 'no',
        },
      ]);

      const genRes = await app.request(
        `/api/v1/examination/courses/${courseA1.id}/practice/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-user-id': userA,
          },
          body: JSON.stringify({
            format: 'standard',
            focusTopicIds: [topic!.id],
          }),
        },
      );

      expect(genRes.status).toBe(201);
      const generated = await genRes.json();
      const practiceId = generated.id;

      // Student attempts to reveal solutions prior to submitting by adding showSolutions=true
      const peekRes = await app.request(
        `/api/v1/examination/practice/${practiceId}?showSolutions=true`,
        {
          headers: {
            'x-test-user-id': userA,
          },
        },
      );

      expect(peekRes.status).toBe(200);
      const peekData = await peekRes.json();
      // Solutions MUST remain masked because assessment status is 'ready' (not 'completed')
      expect(peekData.questions[0]?.workedSolution).toBe('[Hidden until submission]');
      expect(peekData.questions[0]?.finalAnswer).toBe('[Hidden until submission]');
      expect(peekData.questions[0]?.options?.[0]?.isCorrect).toBeUndefined();

      // Submit the exam
      const submitRes = await app.request(`/api/v1/examination/practice/${practiceId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': userA,
        },
        body: JSON.stringify({
          timeSpentSeconds: 120,
          answers: {
            [peekData.questions[0]!.id]: {
              questionId: peekData.questions[0]!.id,
              studentAnswerText: 'My answer',
            },
          },
        }),
      });
      expect(submitRes.status).toBe(200);

      // Now that status is 'completed', showSolutions=true reveals solutions
      const postSubmitRes = await app.request(
        `/api/v1/examination/practice/${practiceId}?showSolutions=true`,
        {
          headers: {
            'x-test-user-id': userA,
          },
        },
      );

      expect(postSubmitRes.status).toBe(200);
      const postSubmitData = await postSubmitRes.json();
      expect(postSubmitData.questions[0]?.workedSolution).not.toBe('[Hidden until submission]');
      expect(postSubmitData.questions[0]?.finalAnswer).not.toBe('[Hidden until submission]');
    });

    it('rejects updating an examination question with a topicId from another course', async () => {
      const paper = await defaultStore.createExaminationPaper({
        userId: userA,
        courseId: courseA1.id,
        title: 'Spring 2026 Midterm',
      });

      const [question] = await defaultStore.createExaminationQuestions([
        {
          paperId: paper.id,
          userId: userA,
          courseId: courseA1.id,
          questionNumber: '1',
          questionText: 'Explain variable scope in TypeScript.',
          marks: 5,
          questionFormat: 'short_answer',
          verificationStatus: 'extracted',
          difficulty: 'medium',
        },
      ]);

      // User A attempts to link question from Course A1 to nodeA2 (from Course A2)
      const res = await app.request(`/api/v1/examination/questions/${question!.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': userA,
        },
        body: JSON.stringify({
          topicId: nodeA2.id,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.detail).toContain('Topic does not belong to the examination question course');
    });
  });
});
