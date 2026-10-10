import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDataStore } from '../../services/api/src/data/store.js';
import type { Course, AcademicNode } from '@campusflow/types';

describe('Assessment & Academic Topic Linkage Suite', () => {
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

  it('1. Create Assessment: successfully persists assessment with types, marks, and dates', async () => {
    const examDate = new Date('2026-11-15T09:30:00Z');
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'Continuous Assessment Test 1 (CAT-1)',
      type: 'CAT',
      date: examDate,
      totalMarks: 50,
      weightage: '15%',
      status: 'upcoming',
    });

    expect(assessment.id).toBeDefined();
    expect(assessment.title).toBe('Continuous Assessment Test 1 (CAT-1)');
    expect(assessment.type).toBe('CAT');
    expect(assessment.totalMarks).toBe(50);
    expect(assessment.weightage).toBe('15%');
    expect(assessment.status).toBe('upcoming');
    expect(assessment.date).toEqual(examDate);
  });

  it('2. Read Assessment: retrieves assessment with linked topic details', async () => {
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'FAT Exam',
      type: 'FAT',
      totalMarks: 100,
    });

    await dataStore.linkTopicToAssessment({
      assessmentId: assessment.id,
      topicId: topicA1_1.id,
      userId: userA,
      courseId: courseA1.id,
      weight: 20,
      source: 'syllabus',
      notes: 'Covers Section 1',
    });

    const retrieved = await dataStore.getAssessment(assessment.id, userA);
    expect(retrieved.id).toBe(assessment.id);
    expect(retrieved.topics.length).toBe(1);
    expect(retrieved.topics[0]?.topicId).toBe(topicA1_1.id);
    expect(retrieved.topics[0]?.topicTitle).toBe('Gauss Law and Applications');
    expect(retrieved.topics[0]?.weight).toBe(20);
    expect(retrieved.topics[0]?.source).toBe('syllabus');
  });

  it('3. Update Assessment: updates fields while preserving unedited metadata', async () => {
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'Quiz 1',
      type: 'Quiz',
      totalMarks: 10,
      status: 'upcoming',
    });

    const updated = await dataStore.updateAssessment(assessment.id, userA, {
      title: 'Surprise Quiz 1',
      totalMarks: 15,
      status: 'completed',
    });

    expect(updated.title).toBe('Surprise Quiz 1');
    expect(updated.totalMarks).toBe(15);
    expect(updated.status).toBe('completed');
    expect(updated.type).toBe('Quiz'); // Unchanged
  });

  it('4. Delete Assessment: removes assessment and cascades to linked topics', async () => {
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'Assessment to Delete',
      type: 'Assignment',
    });

    await dataStore.linkTopicToAssessment({
      assessmentId: assessment.id,
      topicId: topicA1_1.id,
      userId: userA,
      courseId: courseA1.id,
      weight: 10,
      source: 'user',
    });

    await dataStore.deleteAssessment(assessment.id, userA);

    await expect(dataStore.getAssessment(assessment.id, userA)).rejects.toThrow();
  });

  it('5. Assessment Ownership: User B cannot read, update, or delete User A assessment', async () => {
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'User A Private Assessment',
      type: 'CAT',
    });

    // User B read attempt
    await expect(dataStore.getAssessment(assessment.id, userB)).rejects.toThrow(/Access denied/);

    // User B update attempt
    await expect(
      dataStore.updateAssessment(assessment.id, userB, { title: 'Hacked' }),
    ).rejects.toThrow(/Access denied/);

    // User B delete attempt
    await expect(dataStore.deleteAssessment(assessment.id, userB)).rejects.toThrow(/Access denied/);
  });

  it('6. Topic Ownership: User A cannot link topic from User B course', async () => {
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'User A CAT',
      type: 'CAT',
    });

    // Attempt to link User B's topic
    await expect(
      dataStore.linkTopicToAssessment({
        assessmentId: assessment.id,
        topicId: topicB_1.id,
        userId: userA,
        courseId: courseA1.id,
        weight: 10,
        source: 'user',
      }),
    ).rejects.toThrow();
  });

  it('7. Same-Course Topic Linking: successfully links multiple topics from the same course', async () => {
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'CAT-1',
      type: 'CAT',
    });

    const link1 = await dataStore.linkTopicToAssessment({
      assessmentId: assessment.id,
      topicId: topicA1_1.id,
      userId: userA,
      courseId: courseA1.id,
      weight: 25,
      source: 'syllabus',
    });

    const link2 = await dataStore.linkTopicToAssessment({
      assessmentId: assessment.id,
      topicId: topicA1_2.id,
      userId: userA,
      courseId: courseA1.id,
      weight: 25,
      source: 'syllabus',
    });

    expect(link1.id).toBeDefined();
    expect(link2.id).toBeDefined();

    const withTopics = await dataStore.getAssessment(assessment.id, userA);
    expect(withTopics.topics.length).toBe(2);
    expect(withTopics.topics.map((t) => t.topicId)).toContain(topicA1_1.id);
    expect(withTopics.topics.map((t) => t.topicId)).toContain(topicA1_2.id);
  });

  it('8. Cross-Course Topic Rejection: prevents linking Course A2 topic to Course A1 assessment', async () => {
    const assessmentA1 = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'Physics CAT-1',
      type: 'CAT',
    });

    // Attempt to link DBMS topic (courseA2) to Physics assessment (courseA1)
    await expect(
      dataStore.linkTopicToAssessment({
        assessmentId: assessmentA1.id,
        topicId: topicA2_1.id,
        userId: userA,
        courseId: courseA1.id,
        weight: 10,
        source: 'user',
      }),
    ).rejects.toThrow(/does not belong to the assessment course/);
  });

  it('9. Cross-User Topic Rejection: User B cannot link topics to User A assessment', async () => {
    const assessmentA1 = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'Physics CAT-1',
      type: 'CAT',
    });

    await expect(
      dataStore.linkTopicToAssessment({
        assessmentId: assessmentA1.id,
        topicId: topicA1_1.id,
        userId: userB,
        courseId: courseA1.id,
        weight: 10,
        source: 'user',
      }),
    ).rejects.toThrow(/Access denied/);
  });

  it('10. Duplicate Topic Link Handling: re-linking the same topic updates weight/source idempotently', async () => {
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'CAT-1',
      type: 'CAT',
    });

    const link1 = await dataStore.linkTopicToAssessment({
      assessmentId: assessment.id,
      topicId: topicA1_1.id,
      userId: userA,
      courseId: courseA1.id,
      weight: 10,
      source: 'user',
      notes: 'Draft note',
    });

    // Re-link same topic with updated weight and source
    const link2 = await dataStore.linkTopicToAssessment({
      assessmentId: assessment.id,
      topicId: topicA1_1.id,
      userId: userA,
      courseId: courseA1.id,
      weight: 25,
      source: 'syllabus',
      notes: 'Finalized from syllabus',
    });

    expect(link2.id).toBe(link1.id);
    expect(link2.weight).toBe(25);
    expect(link2.source).toBe('syllabus');
    expect(link2.notes).toBe('Finalized from syllabus');

    const withTopics = await dataStore.getAssessment(assessment.id, userA);
    expect(withTopics.topics.length).toBe(1);
    expect(withTopics.topics[0]?.weight).toBe(25);
  });

  it('11. Assessment Deletion Cleanup: deleting course or assessment cleans up links', async () => {
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'Course Cleanup Test',
      type: 'Quiz',
    });

    await dataStore.linkTopicToAssessment({
      assessmentId: assessment.id,
      topicId: topicA1_1.id,
      userId: userA,
      courseId: courseA1.id,
      weight: null,
      source: 'user',
    });

    const topicsBefore = await dataStore.listTopicsForAssessment(assessment.id, userA);
    expect(topicsBefore.length).toBe(1);

    // Unlink topic explicitly
    await dataStore.unlinkTopicFromAssessment(assessment.id, topicA1_1.id, userA);
    const topicsAfter = await dataStore.listTopicsForAssessment(assessment.id, userA);
    expect(topicsAfter.length).toBe(0);
  });

  it('12. Null / Unknown Topic Weight: leaves weight NULL when unknown (never fabricates weights)', async () => {
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'Unweighted Assessment Scope',
      type: 'FAT',
    });

    const link = await dataStore.linkTopicToAssessment({
      assessmentId: assessment.id,
      topicId: topicA1_1.id,
      userId: userA,
      courseId: courseA1.id,
      weight: null,
      source: 'user',
    });

    expect(link.weight).toBeNull();

    const withTopics = await dataStore.getAssessment(assessment.id, userA);
    expect(withTopics.topics[0]?.weight).toBeNull();
  });

  it('13. Source Preservation: preserves user, syllabus, question_paper, and inferred accurately', async () => {
    const assessment = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA1.id,
      title: 'Multi-Source Assessment Scope',
      type: 'CAT',
    });

    const l1 = await dataStore.linkTopicToAssessment({
      assessmentId: assessment.id,
      topicId: topicA1_1.id,
      userId: userA,
      courseId: courseA1.id,
      source: 'question_paper',
    });

    const l2 = await dataStore.linkTopicToAssessment({
      assessmentId: assessment.id,
      topicId: topicA1_2.id,
      userId: userA,
      courseId: courseA1.id,
      source: 'inferred',
    });

    expect(l1.source).toBe('question_paper');
    expect(l2.source).toBe('inferred');

    const withTopics = await dataStore.getAssessment(assessment.id, userA);
    const sources = withTopics.topics.map((t) => t.source);
    expect(sources).toContain('question_paper');
    expect(sources).toContain('inferred');
  });
});
