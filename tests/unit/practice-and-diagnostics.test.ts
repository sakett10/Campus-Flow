import { describe, it, expect } from 'vitest';
import {
  generatePracticeAssessment,
  verifyNumericalAnswer,
} from '../../packages/shared/src/examination/practice-generator.js';
import { evaluatePracticeSubmission } from '../../packages/shared/src/examination/diagnostic-feedback.js';
import type { AcademicNode, PracticeStudentAnswer } from '@campusflow/types';

describe('Practice Assessment Generation & Diagnostic Feedback Unit Suite', () => {
  const mockNodes: AcademicNode[] = [
    {
      id: 'topic-1',
      courseId: 'course-1',
      userId: 'user-1',
      parentId: null,
      type: 'topic',
      title: 'Distributed Mutual Exclusion',
      description: null,
      orderIndex: 1,
      origin: 'user',
      confidence: 1.0,
      needsReview: 'no',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'topic-2',
      courseId: 'course-1',
      userId: 'user-1',
      parentId: null,
      type: 'topic',
      title: 'Lamport Timestamps & Vector Clocks',
      description: null,
      orderIndex: 2,
      origin: 'user',
      confidence: 1.0,
      needsReview: 'no',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('1. Generates structure-matched practice assessment with rubrics and worked solutions', async () => {
    const assessment = await generatePracticeAssessment({
      userId: 'user-1',
      courseId: 'course-1',
      courseCode: 'CSE4001',
      courseTitle: 'Distributed Systems',
      format: 'standard',
      academicNodes: mockNodes,
      targetDifficulty: 'medium',
    });

    expect(assessment.title).toContain('CSE4001');
    expect(assessment.questions.length).toBe(5);
    expect(assessment.totalMarks).toBeGreaterThanOrEqual(40);

    // Question 1 should be MCQ with distractors
    const mcq = assessment.questions[0]!;
    expect(mcq.questionFormat).toBe('multiple_choice');
    expect(mcq.options?.length).toBe(4);
    const correctOpt = mcq.options?.find((o) => o.isCorrect);
    expect(correctOpt).toBeDefined();
    expect(correctOpt?.explanation).toBeDefined();

    // Questions should have worked solutions, rubrics, and final answers
    for (const q of assessment.questions) {
      expect(q.workedSolution.length).toBeGreaterThan(10);
      expect(q.finalAnswer.length).toBeGreaterThan(3);
      expect(q.rubric.length).toBeGreaterThanOrEqual(1);
      expect(q.rubric[0]?.criterion).toBeDefined();
      expect(q.validationStatus).toBe('verified');
    }
  });

  it('2. Verifies numerical calculations deterministically', () => {
    // Exact arithmetic
    expect(verifyNumericalAnswer('20 * 4', 80).isCorrect).toBe(true);
    expect(verifyNumericalAnswer('100 / 5 + 10', 30).isCorrect).toBe(true);

    // Incorrect calculation
    expect(verifyNumericalAnswer('20 * 4', 75).isCorrect).toBe(false);

    // Tolerant floating point
    expect(verifyNumericalAnswer('(1 / 3) * 3', 1.0, 0.001).isCorrect).toBe(true);

    // Malicious or unparseable input fails safely without executing arbitrary code
    expect(verifyNumericalAnswer('console.log("hack")', 0).isCorrect).toBe(false);
  });

  it('3. Evaluates objective and subjective answers against rubrics with error categorization', async () => {
    const assessment = await generatePracticeAssessment({
      userId: 'user-1',
      courseId: 'course-1',
      courseCode: 'CSE4001',
      courseTitle: 'Distributed Systems',
      format: 'quick_diagnostic', // 3 questions
      academicNodes: mockNodes,
    });

    const q1 = assessment.questions[0]!; // MCQ
    const q2 = assessment.questions[1]!; // Numerical or Subjective
    const q3 = assessment.questions[2]!; // Subjective

    const answers: Record<string, PracticeStudentAnswer> = {
      [q1.id]: {
        questionId: q1.id,
        studentAnswerText: 'Option A',
        selectedOptionLabel: 'A',
      },
      [q2.id]: {
        questionId: q2.id,
        studentAnswerText: 'Wrong calculation result: 999 units/sec',
      },
      [q3.id]: {
        questionId: q3.id,
        studentAnswerText: 'Too short',
      },
    };

    const { report, recommendedTopicStateUpdates } = evaluatePracticeSubmission({
      submissionId: 'sub-1',
      assessment,
      answers,
    });

    expect(report.submissionId).toBe('sub-1');
    expect(report.questionFeedback.length).toBe(3);

    // Q1 should be full marks (Option A correct)
    const fb1 = report.questionFeedback.find((f) => f.questionId === q1.id)!;
    expect(fb1.earnedMarks).toBe(q1.marks);
    expect(fb1.isGradingEstimated).toBe(false); // Authoritative MCQ
    expect(fb1.errorCategory).toBe('none');

    // Q2 or Q3 should have error categories
    const fb3 = report.questionFeedback.find((f) => f.questionId === q3.id)!;
    expect(fb3.errorCategory).toBe('incomplete_explanation');
    expect(fb3.isGradingEstimated).toBe(true); // Estimated subjective grading

    // Recommended state updates should reflect weakness
    expect(recommendedTopicStateUpdates.length).toBeGreaterThan(0);
    const hasNeedsReview = recommendedTopicStateUpdates.some(
      (u) => u.suggestedState === 'needs_review' || u.suggestedState === 'learning',
    );
    expect(hasNeedsReview).toBe(true);
  });
});
