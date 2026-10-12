import { describe, it, expect } from 'vitest';
import {
  generateStudySchedule,
  recoverMissedSessions,
} from '../../services/api/src/modules/courses/study-planner.js';
import type { AcademicNode, StudySession } from '@campusflow/types';

describe('Study Planner Service', () => {
  const dummyTopics: AcademicNode[] = [
    {
      id: 'topic-1',
      courseId: 'course-1',
      userId: 'user-1',
      parentId: 'mod-1',
      type: 'topic',
      title: 'Topic 1: Foundations',
      orderIndex: 0,
      origin: 'user',
      needsReview: 'no',
      estimatedMinutes: 60,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'topic-2',
      courseId: 'course-1',
      userId: 'user-1',
      parentId: 'mod-1',
      type: 'topic',
      title: 'Topic 2: Advanced Concepts',
      orderIndex: 1,
      origin: 'user',
      needsReview: 'no',
      estimatedMinutes: 90,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'topic-3',
      courseId: 'course-1',
      userId: 'user-1',
      parentId: 'mod-1',
      type: 'topic',
      title: 'Topic 3: System Design',
      orderIndex: 2,
      origin: 'user',
      needsReview: 'no',
      estimatedMinutes: 120,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('generates scheduled sessions with reviews and mock exams', () => {
    const examDate = new Date();
    examDate.setDate(examDate.getDate() + 30); // 30 days out

    const result = generateStudySchedule({
      courseId: 'course-1',
      userId: 'user-1',
      planId: 'plan-1',
      courseTitle: 'Database Systems',
      targetExamDate: examDate,
      availableHoursPerWeek: 10,
      dailyTargetMinutes: 60,
      topics: dummyTopics,
    });

    expect(result.sessions.length).toBeGreaterThanOrEqual(4);
    // At least 3 primary study sessions + 1 review + 1 final practice
    const studySessions = result.sessions.filter((s) => s.sessionType === 'study');
    expect(studySessions.length).toBe(3);

    const reviewSessions = result.sessions.filter((s) => s.sessionType === 'review');
    expect(reviewSessions.length).toBe(1);

    const practiceSessions = result.sessions.filter((s) => s.sessionType === 'practice');
    expect(practiceSessions.length).toBe(1);

    // No warning because 30 days is plenty for ~300 minutes
    expect(result.workloadWarning).toBeUndefined();
  });

  it('flags workload warnings when exam is too close for topic workload', () => {
    const tightExamDate = new Date();
    tightExamDate.setDate(tightExamDate.getDate() + 2); // 2 days out

    const result = generateStudySchedule({
      courseId: 'course-1',
      userId: 'user-1',
      planId: 'plan-1',
      courseTitle: 'Database Systems',
      targetExamDate: tightExamDate,
      availableHoursPerWeek: 5,
      dailyTargetMinutes: 30, // only 60 total available mins
      topics: dummyTopics, // requires 270 mins + 25% buffer = 338 mins
    });

    expect(result.workloadWarning).toBeDefined();
    expect(result.workloadWarning?.hasWarning).toBe(true);
    expect(result.workloadWarning?.deficitMinutes).toBeGreaterThan(0);
    expect(result.workloadWarning?.message).toContain('Workload warning');
  });

  it('recovers missed past sessions by rescheduling into future dates', () => {
    const examDate = new Date();
    examDate.setDate(examDate.getDate() + 14);

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);

    const existingSessions: StudySession[] = [
      {
        id: 'sess-1',
        planId: 'plan-1',
        userId: 'user-1',
        courseId: 'course-1',
        topicId: 'topic-1',
        title: 'Study Topic 1',
        scheduledDate: pastDate,
        durationMinutes: 60,
        sessionType: 'study',
        status: 'scheduled', // Missed!
        orderIndex: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const recovered = recoverMissedSessions(existingSessions, examDate, 60);

    expect(recovered.length).toBe(1);
    expect(recovered[0]!.scheduledDate.getTime()).toBeGreaterThan(Date.now());
    expect(recovered[0]!.notes).toContain('Rescheduled via Missed-Session Recovery');
  });
});
