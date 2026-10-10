import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDataStore } from '../../services/api/src/data/store.js';
import type { Course, AcademicNode } from '@campusflow/types';

describe('Study State & Event Tracking Unit Suite', () => {
  let dataStore: InMemoryDataStore;

  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';

  let courseA1: Course;
  let courseA2: Course;
  let courseB: Course;

  let topicA1_1: AcademicNode;
  let topicA1_2: AcademicNode;
  let topicA2_1: AcademicNode;
  let topicB_1: AcademicNode;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();

    // User A courses
    courseA1 = await dataStore.createCourse({
      userId: userA,
      code: 'PHY2001',
      title: 'Electromagnetic Field Theory',
      term: 'Fall 2026',
    });

    courseA2 = await dataStore.createCourse({
      userId: userA,
      code: 'CSE3001',
      title: 'Database Systems & Architecture',
      term: 'Fall 2026',
    });

    // User B course
    courseB = await dataStore.createCourse({
      userId: userB,
      code: 'MAT2001',
      title: 'Linear Algebra',
      term: 'Fall 2026',
    });

    // Nodes for Course A1
    const [modA1] = await dataStore.createAcademicNodes([
      {
        courseId: courseA1.id,
        userId: userA,
        parentId: null,
        type: 'module',
        title: 'Module 1: Electrostatics',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);

    const [t1, t2] = await dataStore.createAcademicNodes([
      {
        courseId: courseA1.id,
        userId: userA,
        parentId: modA1!.id,
        type: 'topic',
        title: 'Gauss Law and Applications',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
      {
        courseId: courseA1.id,
        userId: userA,
        parentId: modA1!.id,
        type: 'topic',
        title: 'Electric Dipoles and Polarization',
        orderIndex: 1,
        origin: 'user',
        needsReview: 'no',
      },
    ]);
    topicA1_1 = t1!;
    topicA1_2 = t2!;

    // Node for Course A2
    const [modA2] = await dataStore.createAcademicNodes([
      {
        courseId: courseA2.id,
        userId: userA,
        parentId: null,
        type: 'module',
        title: 'Module 1: Relational Algebra',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);
    const [tA2] = await dataStore.createAcademicNodes([
      {
        courseId: courseA2.id,
        userId: userA,
        parentId: modA2!.id,
        type: 'topic',
        title: 'Relational Calculus',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);
    topicA2_1 = tA2!;

    // Node for Course B
    const [modB] = await dataStore.createAcademicNodes([
      {
        courseId: courseB.id,
        userId: userB,
        parentId: null,
        type: 'module',
        title: 'Module 1: Vector Spaces',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);
    const [tB] = await dataStore.createAcademicNodes([
      {
        courseId: courseB.id,
        userId: userB,
        parentId: modB!.id,
        type: 'topic',
        title: 'Eigenvalues and Eigenvectors',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);
    topicB_1 = tB!;
  });

  it('1. Create Initial Study State: transitions from not_started to learning and sets lastStudiedAt', async () => {
    const { studyState, event } = await dataStore.setTopicStudyState(
      courseA1.id,
      topicA1_1.id,
      userA,
      'learning',
      'study_started',
      { sessionType: 'reading' },
    );

    expect(studyState.id).toBeDefined();
    expect(studyState.state).toBe('learning');
    expect(studyState.lastStudiedAt).toBeInstanceOf(Date);
    expect(studyState.lastReviewedAt).toBeNull();
    expect(event.type).toBe('study_started');
    expect(event.metadata).toEqual({ sessionType: 'reading' });
  });

  it('2. Default not_started state: unstudied topic returns state=not_started with null timestamps', async () => {
    const state = await dataStore.getTopicStudyState(courseA1.id, topicA1_1.id, userA);

    expect(state.state).toBe('not_started');
    expect(state.lastStudiedAt).toBeNull();
    expect(state.lastReviewedAt).toBeNull();
    expect(state.topicId).toBe(topicA1_1.id);
    expect(state.courseId).toBe(courseA1.id);
  });

  it('3. Update State: changes state to needs_review and preserves lastStudiedAt', async () => {
    // Start learning
    const initial = await dataStore.setTopicStudyState(
      courseA1.id,
      topicA1_1.id,
      userA,
      'learning',
    );
    const studiedAt = initial.studyState.lastStudiedAt;

    // Flag needs review
    const updated = await dataStore.setTopicStudyState(
      courseA1.id,
      topicA1_1.id,
      userA,
      'needs_review',
    );

    expect(updated.studyState.state).toBe('needs_review');
    expect(updated.studyState.lastStudiedAt).toEqual(studiedAt);
    expect(updated.studyState.lastReviewedAt).toBeNull();
    expect(updated.event.type).toBe('marked_needs_review');
  });

  it('4. State Transition: learning -> reviewed updates lastReviewedAt and lastStudiedAt', async () => {
    const { studyState, event } = await dataStore.setTopicStudyState(
      courseA1.id,
      topicA1_1.id,
      userA,
      'reviewed',
    );

    expect(studyState.state).toBe('reviewed');
    expect(studyState.lastReviewedAt).toBeInstanceOf(Date);
    expect(studyState.lastStudiedAt).toBeInstanceOf(Date);
    expect(event.type).toBe('reviewed');
  });

  it('5. Study Event Creation: recordStudyEvent automatically triggers appropriate state update', async () => {
    const result = await dataStore.recordStudyEvent(courseA1.id, topicA1_1.id, userA, 'reviewed', {
      notes: 'Completed practice problems',
    });

    expect(result.studyState.state).toBe('reviewed');
    expect(result.event.type).toBe('reviewed');
    expect(result.event.metadata).toEqual({ notes: 'Completed practice problems' });
  });

  it('6. Reviewed Timestamp: preserves lastReviewedAt across subsequent non-review states', async () => {
    // 1. Mark reviewed
    const rev = await dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userA, 'reviewed');
    const reviewedTimestamp = rev.studyState.lastReviewedAt;

    // 2. Mark needs_review later
    const nr = await dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userA, 'needs_review');

    expect(nr.studyState.state).toBe('needs_review');
    expect(nr.studyState.lastReviewedAt).toEqual(reviewedTimestamp);
  });

  it('7. Needs Review Timestamp Behavior: needs_review does not fabricate a review timestamp', async () => {
    const nr = await dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userA, 'needs_review');

    expect(nr.studyState.state).toBe('needs_review');
    expect(nr.studyState.lastReviewedAt).toBeNull();
  });

  it('8. Study History Retrieval: returns chronological events newest first', async () => {
    await dataStore.recordStudyEvent(courseA1.id, topicA1_1.id, userA, 'study_started');
    await dataStore.recordStudyEvent(courseA1.id, topicA1_1.id, userA, 'marked_needs_review');
    await dataStore.recordStudyEvent(courseA1.id, topicA1_1.id, userA, 'reviewed');

    const history = await dataStore.listStudyEvents(courseA1.id, topicA1_1.id, userA);

    expect(history.length).toBe(3);
    expect(history[0]?.type).toBe('reviewed');
    expect(history[1]?.type).toBe('marked_needs_review');
    expect(history[2]?.type).toBe('study_started');
  });

  it('9. User Ownership: User B cannot access User A study state', async () => {
    await dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userA, 'learning');

    // User B attempts to read User A topic study state
    await expect(dataStore.getTopicStudyState(courseA1.id, topicA1_1.id, userB)).rejects.toThrow(
      /Access denied/,
    );

    // User B attempts to mutate User A topic study state
    await expect(
      dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userB, 'reviewed'),
    ).rejects.toThrow(/Access denied/);
  });

  it('10. Topic Ownership: User A cannot access or mutate study state for User B topic', async () => {
    await expect(dataStore.getTopicStudyState(courseB.id, topicB_1.id, userA)).rejects.toThrow(
      /Access denied/,
    );

    await expect(
      dataStore.setTopicStudyState(courseB.id, topicB_1.id, userA, 'learning'),
    ).rejects.toThrow(/Access denied/);
  });

  it('11. Course Ownership: User B cannot list course study states for User A course, but User A can', async () => {
    await expect(dataStore.listCourseStudyStates(courseA1.id, userB)).rejects.toThrow(
      /Access denied/,
    );

    const states = await dataStore.listCourseStudyStates(courseA1.id, userA);
    expect(states.length).toBe(2);
    expect(states.some((s) => s.topicId === topicA1_2.id)).toBe(true);
  });

  it('12. Cross-Course Rejection: topic from Course A2 cannot be queried under Course A1', async () => {
    await expect(dataStore.getTopicStudyState(courseA1.id, topicA2_1.id, userA)).rejects.toThrow(
      /does not belong to the requested course/,
    );

    await expect(
      dataStore.setTopicStudyState(courseA1.id, topicA2_1.id, userA, 'learning'),
    ).rejects.toThrow(/does not belong to the requested course/);
  });

  it('13. Cross-User Rejection: User B cannot read User A study events', async () => {
    await dataStore.recordStudyEvent(courseA1.id, topicA1_1.id, userA, 'study_started');

    await expect(dataStore.listStudyEvents(courseA1.id, topicA1_1.id, userB)).rejects.toThrow(
      /Access denied/,
    );
  });

  it('14. Multiple Events Preserve History: multiple state changes log individual audit trail records', async () => {
    await dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userA, 'learning');
    await dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userA, 'needs_review');
    await dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userA, 'learning');
    await dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userA, 'reviewed');

    const history = await dataStore.listStudyEvents(courseA1.id, topicA1_1.id, userA);
    expect(history.length).toBe(4);

    const types = history.map((h) => h.type);
    expect(types).toEqual(['reviewed', 'study_started', 'marked_needs_review', 'study_started']);
  });

  it('15. Repeated State Updates Behave Deterministically: setting the same state updates timestamp & event', async () => {
    const res1 = await dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userA, 'learning');
    const res2 = await dataStore.setTopicStudyState(courseA1.id, topicA1_1.id, userA, 'learning');

    expect(res1.studyState.id).toBe(res2.studyState.id);
    expect(res2.studyState.state).toBe('learning');

    const history = await dataStore.listStudyEvents(courseA1.id, topicA1_1.id, userA);
    expect(history.length).toBe(2);
  });
});
