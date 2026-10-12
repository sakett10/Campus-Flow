import { describe, it, expect, beforeEach } from 'vitest';
import { createApiApp } from '../../services/api/src/app.js';
import { defaultStore } from '../../services/api/src/data/store.js';
import type {
  ExaminationPaper,
  ExaminationQuestion,
  PracticeAssessment,
  PracticeSubmission,
  ExamPaperStructuralAnalysis,
  CrossPaperComparisonReport,
} from '@campusflow/types';

describe('Examination Analysis & Practice Assessment Integration API', () => {
  const testUserId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const app = createApiApp();

  let courseId: string;
  let topicId1: string;

  beforeEach(async () => {
    defaultStore.clear();
    process.env['AUTH_TEST_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'test';

    // 1. Create a course and academic map for testUserId
    const course = await defaultStore.createCourse({
      userId: testUserId,
      code: 'CSE4001',
      title: 'Distributed Systems',
      term: 'Fall 2026',
    });
    courseId = course.id;

    const [t1] = await defaultStore.createAcademicNodes([
      {
        courseId,
        userId: testUserId,
        parentId: null,
        type: 'topic',
        title: 'Remote Procedure Calls (RPC)',
        description: null,
        orderIndex: 1,
        origin: 'user',
        confidence: 1.0,
        needsReview: 'no',
      },
    ]);
    topicId1 = t1!.id;

    await defaultStore.createAcademicNodes([
      {
        courseId,
        userId: testUserId,
        parentId: null,
        type: 'topic',
        title: 'Lamport Timestamps & Vector Clocks',
        description: null,
        orderIndex: 2,
        origin: 'user',
        confidence: 1.0,
        needsReview: 'no',
      },
    ]);
  });

  it('completes the entire examination intelligence and practice workflow', async () => {
    // 1. Upload past exam paper
    const paperText = `
VIT UNIVERSITY - FALL 2025
Course Title: Distributed Systems
Continuous Assessment Test - 1 (CAT-1)
Total Marks: 50
Time Allowed: 90 Minutes

Instructions:
Answer all questions.

1. State the fundamental distinction between synchronous and asynchronous RPC paradigms. [10 Marks]

2. Explain Lamport logical clocks and prove that if event e1 happens before e2, then L(e1) < L(e2). [15 Marks]

3. Consider an RPC implementation over an unreliable channel. Describe the at-least-once invocation semantics. [15 Marks]

4. Which consensus protocol uses term numbers and leader heartbeats?
(A) Raft
(B) Paxos
(C) Two-Phase Commit
(D) Chandy-Lamport
[10 Marks]
`;

    const uploadRes = await app.request(`/api/v1/examination/courses/${courseId}/papers/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({ text: paperText }),
    });

    expect(uploadRes.status).toBe(201);
    const uploadJson = (await uploadRes.json()) as {
      paper: ExaminationPaper;
      questions: ExaminationQuestion[];
      warnings: string[];
    };

    expect(uploadJson.paper).toBeDefined();
    expect(uploadJson.paper.title).toContain('Distributed Systems');
    expect(uploadJson.paper.totalMarks).toBe(50);
    expect(uploadJson.paper.durationMinutes).toBe(90);
    expect(uploadJson.questions.length).toBe(4);

    const paperId = uploadJson.paper.id;
    const question1 = uploadJson.questions.find((q) => q.questionNumber === '1')!;
    expect(question1).toBeDefined();
    expect(question1.marks).toBe(10);

    // 2. Student inspects and corrects question 1
    const correctRes = await app.request(`/api/v1/examination/questions/${question1.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({
        marks: 12,
        userNotes: 'Verified against syllabus module 1.',
        verificationStatus: 'verified_by_user',
      }),
    });

    expect(correctRes.status).toBe(200);
    const updatedQ1 = (await correctRes.json()) as ExaminationQuestion;
    expect(updatedQ1.marks).toBe(12);
    expect(updatedQ1.verificationStatus).toBe('verified_by_user');
    expect(updatedQ1.userNotes).toBe('Verified against syllabus module 1.');

    // 3. Inspect course examination analysis report
    const analysisRes = await app.request(`/api/v1/examination/courses/${courseId}/analysis`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
    });

    expect(analysisRes.status).toBe(200);
    const analysisJson = (await analysisRes.json()) as {
      paperCount: number;
      questionCount: number;
      paperAnalyses: ExamPaperStructuralAnalysis[];
      crossPaperReport: CrossPaperComparisonReport;
    };

    expect(analysisJson.paperCount).toBe(1);
    expect(analysisJson.questionCount).toBe(4);
    expect(analysisJson.paperAnalyses[0]?.totalMarks).toBe(50);
    expect(analysisJson.crossPaperReport.uncertaintyNote).toBeDefined();

    // 4. Generate structure-matched practice assessment
    const genPracticeRes = await app.request(
      `/api/v1/examination/courses/${courseId}/practice/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
          'x-test-user-id': testUserId,
        },
        body: JSON.stringify({
          format: 'standard',
          blueprintId: paperId,
          targetDifficulty: 'medium',
        }),
      },
    );

    expect(genPracticeRes.status).toBe(201);
    const practiceAssessment = (await genPracticeRes.json()) as PracticeAssessment;
    expect(practiceAssessment.id).toBeDefined();
    expect(practiceAssessment.questions.length).toBe(5);
    const practiceId = practiceAssessment.id;

    // 5. Blind attempt mode: Get practice assessment without solutions
    const attemptRes = await app.request(`/api/v1/examination/practice/${practiceId}`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
    });

    expect(attemptRes.status).toBe(200);
    const attemptAssessment = (await attemptRes.json()) as PracticeAssessment;
    expect(attemptAssessment.questions[0]?.workedSolution).toBe('[Hidden until submission]');
    expect(attemptAssessment.questions[0]?.finalAnswer).toBe('[Hidden until submission]');

    // 6. Submit answers and receive diagnostic report card
    const q1 = attemptAssessment.questions[0]!;
    const q2 = attemptAssessment.questions[1]!;

    const submitRes = await app.request(`/api/v1/examination/practice/${practiceId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({
        timeSpentSeconds: 300,
        answers: {
          [q1.id]: {
            questionId: q1.id,
            selectedOptionLabel: 'A', // Correct option for generated MCQ
            studentAnswerText: 'Option A',
            selfReportedConfidence: 'high',
          },
          [q2.id]: {
            questionId: q2.id,
            studentAnswerText: 'Omitted answer.',
            selfReportedConfidence: 'low',
          },
        },
      }),
    });

    expect(submitRes.status).toBe(200);
    const submitJson = (await submitRes.json()) as {
      submission: PracticeSubmission;
      report: PracticeSubmission['diagnosticFeedback'];
      topicStateUpdates: Array<{ topicId: string; suggestedState: string }>;
    };

    expect(submitJson.submission).toBeDefined();
    expect(submitJson.report).toBeDefined();
    expect(submitJson.report?.questionFeedback.length).toBe(5);

    // 7. Verify atomic topic study state update in course academic map
    const state = await defaultStore.getTopicStudyState(courseId, topicId1, testUserId);
    expect(state).toBeDefined();

    // 8. Cross-User Authorization: otherUserId cannot view User A's paper or practice assessment
    const unauthPaperRes = await app.request(`/api/v1/examination/papers/${paperId}`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'x-test-user-id': otherUserId,
      },
    });
    expect([403, 404]).toContain(unauthPaperRes.status);

    const unauthPracticeRes = await app.request(`/api/v1/examination/practice/${practiceId}`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'x-test-user-id': otherUserId,
      },
    });
    expect([403, 404]).toContain(unauthPracticeRes.status);

    // 9. Inspect AI usage quota status
    const quotaRes = await app.request('/api/v1/examination/ai/quota', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
    });
    expect(quotaRes.status).toBe(200);
    const quotaJson = (await quotaRes.json()) as {
      tier: string;
      windowLimit: number;
      isThrottled: boolean;
    };
    expect(quotaJson.tier).toBe('free');
    expect(quotaJson.windowLimit).toBe(20);
    expect(quotaJson.isThrottled).toBe(false);
  });
});
