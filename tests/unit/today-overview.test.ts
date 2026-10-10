import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDataStore } from '../../services/api/src/data/store.js';
import type { Course, AcademicNode } from '@campusflow/types';

describe('Today Overview Unit Suite', () => {
  let dataStore: InMemoryDataStore;

  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';

  let courseA: Course;
  let courseB: Course;
  let topicA1: AcademicNode;
  let topicA2: AcademicNode;
  let topicB1: AcademicNode;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();

    // User A course & topics
    courseA = await dataStore.createCourse({
      userId: userA,
      code: 'CSE3001',
      title: 'Database Systems',
      term: 'Fall 2026',
    });

    const [modA] = await dataStore.createAcademicNodes([
      {
        courseId: courseA.id,
        userId: userA,
        parentId: null,
        type: 'module',
        title: 'Module 1: SQL',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);

    const [t1, t2] = await dataStore.createAcademicNodes([
      {
        courseId: courseA.id,
        userId: userA,
        parentId: modA!.id,
        type: 'topic',
        title: 'Relational Algebra',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
      {
        courseId: courseA.id,
        userId: userA,
        parentId: modA!.id,
        type: 'topic',
        title: 'B-Tree Indexing',
        orderIndex: 1,
        origin: 'user',
        needsReview: 'no',
      },
    ]);
    topicA1 = t1!;
    topicA2 = t2!;

    // User B course & topics
    courseB = await dataStore.createCourse({
      userId: userB,
      code: 'MAT2001',
      title: 'Linear Algebra',
      term: 'Fall 2026',
    });

    const [tB] = await dataStore.createAcademicNodes([
      {
        courseId: courseB.id,
        userId: userB,
        parentId: null,
        type: 'topic',
        title: 'Eigenvectors',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);
    topicB1 = tB!;
  });

  it('1. Authenticated user isolation: User A only sees their own courses, assessments, and topics', async () => {
    // User A study state
    await dataStore.setTopicStudyState(courseA.id, topicA1.id, userA, 'learning');

    // User B study state
    await dataStore.setTopicStudyState(courseB.id, topicB1.id, userB, 'learning');

    // User A assessment
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Quiz 1',
      type: 'Quiz',
      date: new Date(Date.now() + 86400000 * 2),
    });

    // User B assessment
    await dataStore.createAssessment({
      userId: userB,
      courseId: courseB.id,
      title: 'Midterm',
      type: 'CAT',
      date: new Date(Date.now() + 86400000 * 2),
    });

    const overviewA = await dataStore.getTodayOverview(userA);

    expect(overviewA.courses).toHaveLength(1);
    expect(overviewA.courses[0]!.id).toBe(courseA.id);

    expect(overviewA.assessments.upcoming).toHaveLength(1);
    expect(overviewA.assessments.upcoming[0]!.title).toBe('Quiz 1');

    expect(overviewA.continueStudying).toHaveLength(1);
    expect(overviewA.continueStudying[0]!.topicId).toBe(topicA1.id);
    expect(overviewA.continueStudying[0]!.courseCode).toBe('CSE3001');

    const overviewB = await dataStore.getTodayOverview(userB);
    expect(overviewB.courses).toHaveLength(1);
    expect(overviewB.courses[0]!.id).toBe(courseB.id);
    expect(overviewB.assessments.upcoming[0]!.title).toBe('Midterm');
  });

  it('2. Assessment classification: correctly separates dueToday, overdue, upcoming, unscheduled, and completed', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const tomorrow = new Date(now.getTime() + 86400000);

    // Overdue
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Overdue Assignment',
      type: 'Assignment',
      date: yesterday,
      status: 'upcoming',
    });

    // Due Today
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Lab Submission Today',
      type: 'Lab',
      date: now,
      status: 'upcoming',
    });

    // Upcoming Future
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'CAT 1 Exam',
      type: 'CAT',
      date: tomorrow,
      status: 'upcoming',
    });

    // Unscheduled
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Course Project Phase 1',
      type: 'Project',
      date: null,
      status: 'upcoming',
    });

    // Completed
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Practice Quiz',
      type: 'Quiz',
      date: yesterday,
      status: 'completed',
    });

    // Cancelled (should be excluded)
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Cancelled Test',
      type: 'Quiz',
      date: tomorrow,
      status: 'cancelled',
    });

    const overview = await dataStore.getTodayOverview(userA);

    expect(overview.assessments.overdue).toHaveLength(1);
    expect(overview.assessments.overdue[0]!.title).toBe('Overdue Assignment');
    expect(overview.assessments.overdue[0]!.timeframe).toBe('overdue');

    expect(overview.assessments.dueToday).toHaveLength(1);
    expect(overview.assessments.dueToday[0]!.title).toBe('Lab Submission Today');
    expect(overview.assessments.dueToday[0]!.timeframe).toBe('today');

    expect(overview.assessments.upcoming).toHaveLength(1);
    expect(overview.assessments.upcoming[0]!.title).toBe('CAT 1 Exam');
    expect(overview.assessments.upcoming[0]!.timeframe).toBe('upcoming');

    expect(overview.assessments.unscheduled).toHaveLength(1);
    expect(overview.assessments.unscheduled[0]!.title).toBe('Course Project Phase 1');
    expect(overview.assessments.unscheduled[0]!.timeframe).toBe('unscheduled');

    expect(overview.assessments.completed).toHaveLength(1);
    expect(overview.assessments.completed[0]!.title).toBe('Practice Quiz');
    expect(overview.assessments.completed[0]!.timeframe).toBe('completed');

    expect(overview.summary.overdueAssessmentCount).toBe(1);
    expect(overview.summary.upcomingAssessmentCount).toBe(2); // dueToday + upcoming
  });

  it('3. Assessment ordering: chronologically sorts assessments ascending by date', async () => {
    const d1 = new Date('2026-11-01T10:00:00Z');
    const d2 = new Date('2026-11-05T10:00:00Z');
    const d3 = new Date('2026-11-10T10:00:00Z');

    // Insert out of order
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Exam 3',
      type: 'FAT',
      date: d3,
    });
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Exam 1',
      type: 'CAT',
      date: d1,
    });
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Exam 2',
      type: 'Quiz',
      date: d2,
    });

    const overview = await dataStore.getTodayOverview(userA);
    const titles = overview.assessments.upcoming.map((a) => a.title);
    expect(titles).toEqual(['Exam 1', 'Exam 2', 'Exam 3']);
  });

  it('4. Stable ordering for identical timestamps: uses stable unique id as secondary sort key', async () => {
    const sameDate = new Date('2026-11-20T14:00:00Z');

    const a1 = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Identical Time Quiz A',
      type: 'Quiz',
      date: sameDate,
    });
    const a2 = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Identical Time Quiz B',
      type: 'Quiz',
      date: sameDate,
    });
    const a3 = await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Identical Time Quiz C',
      type: 'Quiz',
      date: sameDate,
    });

    const overview = await dataStore.getTodayOverview(userA);
    const expectedIds = [a1.id, a2.id, a3.id].sort((x, y) => x.localeCompare(y));
    const actualIds = overview.assessments.upcoming.map((a) => a.id);

    expect(actualIds).toEqual(expectedIds);
  });

  it('5. Study state classification & sorting: partitions learning and needs_review with latest activity first', async () => {
    // Topic 1 marked learning
    await dataStore.setTopicStudyState(courseA.id, topicA1.id, userA, 'learning');

    // Topic 2 marked needs_review
    await dataStore.setTopicStudyState(courseA.id, topicA2.id, userA, 'needs_review');

    const overview = await dataStore.getTodayOverview(userA);

    expect(overview.continueStudying).toHaveLength(1);
    expect(overview.continueStudying[0]!.topicId).toBe(topicA1.id);
    expect(overview.continueStudying[0]!.topicTitle).toBe('Relational Algebra');
    expect(overview.continueStudying[0]!.moduleTitle).toBe('Module 1: SQL');
    expect(overview.continueStudying[0]!.state).toBe('learning');

    expect(overview.needsReview).toHaveLength(1);
    expect(overview.needsReview[0]!.topicId).toBe(topicA2.id);
    expect(overview.needsReview[0]!.topicTitle).toBe('B-Tree Indexing');
    expect(overview.needsReview[0]!.state).toBe('needs_review');

    expect(overview.summary.activeTopicsCount).toBe(1);
    expect(overview.summary.needsReviewCount).toBe(1);
  });

  it('6. Study state transition: marking needs_review topic as reviewed removes it from needsReview list', async () => {
    await dataStore.setTopicStudyState(courseA.id, topicA1.id, userA, 'needs_review');
    let overview = await dataStore.getTodayOverview(userA);
    expect(overview.needsReview).toHaveLength(1);

    // Transition to reviewed
    await dataStore.setTopicStudyState(courseA.id, topicA1.id, userA, 'reviewed');
    overview = await dataStore.getTodayOverview(userA);
    expect(overview.needsReview).toHaveLength(0);
    expect(overview.summary.needsReviewCount).toBe(0);
  });

  it('7. Empty state: handles student with no courses, assessments, or study states gracefully', async () => {
    const emptyUser = '33333333-3333-4333-a333-333333333333';
    const overview = await dataStore.getTodayOverview(emptyUser);

    expect(overview.courses).toEqual([]);
    expect(overview.assessments.dueToday).toEqual([]);
    expect(overview.assessments.overdue).toEqual([]);
    expect(overview.assessments.upcoming).toEqual([]);
    expect(overview.assessments.unscheduled).toEqual([]);
    expect(overview.assessments.completed).toEqual([]);
    expect(overview.continueStudying).toEqual([]);
    expect(overview.needsReview).toEqual([]);
    expect(overview.summary).toEqual({
      totalCourses: 0,
      upcomingAssessmentCount: 0,
      overdueAssessmentCount: 0,
      activeTopicsCount: 0,
      needsReviewCount: 0,
    });
  });

  it('8. Missing or deleted topic relationships: ignores study state for deleted/orphaned topics safely', async () => {
    await dataStore.setTopicStudyState(courseA.id, topicA1.id, userA, 'learning');

    // Simulate topic deletion by deleting academic node
    await dataStore.deleteAcademicNode(topicA1.id, userA);

    const overview = await dataStore.getTodayOverview(userA);
    // Should not crash and should exclude the deleted topic
    expect(overview.continueStudying).toHaveLength(0);
    expect(overview.summary.activeTopicsCount).toBe(0);
  });

  it('9. Timezone boundary classification: correctly handles local midnight boundaries in configured timezone', async () => {
    // In Asia/Kolkata (UTC+05:30)
    const targetTz = 'Asia/Kolkata';
    const now = new Date();
    // Use the timezone calculation to find local start of today
    const { getDayBoundariesInTimezone } = await import('@campusflow/shared');
    const { startOfToday, endOfToday } = getDayBoundariesInTimezone(now, targetTz);

    // 1 second before local midnight -> should be overdue
    const beforeMidnight = new Date(startOfToday.getTime() - 1000);
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Yesterday Night Deadline',
      type: 'Assignment',
      date: beforeMidnight,
      status: 'upcoming',
    });

    // 1 second after local midnight -> should be due today
    const afterMidnight = new Date(startOfToday.getTime() + 1000);
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Early Morning Deadline Today',
      type: 'Quiz',
      date: afterMidnight,
      status: 'upcoming',
    });

    // 1 second after local end of day -> should be upcoming
    const tomorrowMorning = new Date(endOfToday.getTime() + 1000);
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Tomorrow Morning Deadline',
      type: 'CAT',
      date: tomorrowMorning,
      status: 'upcoming',
    });

    const overview = await dataStore.getTodayOverview(userA, targetTz);

    expect(overview.assessments.overdue.map((a) => a.title)).toContain('Yesterday Night Deadline');
    expect(overview.assessments.dueToday.map((a) => a.title)).toContain(
      'Early Morning Deadline Today',
    );
    expect(overview.assessments.upcoming.map((a) => a.title)).toContain(
      'Tomorrow Morning Deadline',
    );
  });

  it('10. Invalid timezone input: rejects invalid timezone parameter with 400 Bad Request', async () => {
    await expect(dataStore.getTodayOverview(userA, 'Invalid/Unknown_Timezone')).rejects.toThrow(
      'Invalid IANA timezone specified',
    );
  });

  it('11. Past-due completed and cancelled assessments never become actionable overdue items', async () => {
    const pastDate = new Date(Date.now() - 86400000 * 10);

    // Completed past deadline
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Past Completed Lab',
      type: 'Lab',
      date: pastDate,
      status: 'completed',
    });

    // Cancelled past deadline
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Past Cancelled Exam',
      type: 'CAT',
      date: pastDate,
      status: 'cancelled',
    });

    // Incomplete past deadline
    await dataStore.createAssessment({
      userId: userA,
      courseId: courseA.id,
      title: 'Past Incomplete Homework',
      type: 'Assignment',
      date: pastDate,
      status: 'upcoming',
    });

    const overview = await dataStore.getTodayOverview(userA);

    expect(overview.assessments.overdue).toHaveLength(1);
    expect(overview.assessments.overdue[0]!.title).toBe('Past Incomplete Homework');

    const completedTitles = overview.assessments.completed.map((a) => a.title);
    expect(completedTitles).toContain('Past Completed Lab');
    const pastCompleted = overview.assessments.completed.find(
      (a) => a.title === 'Past Completed Lab',
    );
    expect(pastCompleted?.timeframe).toBe('completed');

    // Cancelled must not appear in any active list
    const allTitles = [
      ...overview.assessments.overdue,
      ...overview.assessments.dueToday,
      ...overview.assessments.upcoming,
      ...overview.assessments.unscheduled,
      ...overview.assessments.completed,
    ].map((a) => a.title);
    expect(allTitles).not.toContain('Past Cancelled Exam');
  });

  it('12. DST regression: correctly calculates boundaries and classifies assessments on a 23-hour spring-forward day', async () => {
    const { getDayBoundariesInTimezone } = await import('@campusflow/shared');
    const tz = 'America/New_York';
    // Controlled timestamp: March 8, 2026 at 15:00 UTC (10:00 AM EST)
    const controlledNow = new Date('2026-03-08T15:00:00.000Z');

    const boundaries = getDayBoundariesInTimezone(controlledNow, tz);
    // Start of March 8 is 00:00:00 EST -> 05:00:00 UTC
    expect(boundaries.startOfToday.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    // Start of March 9 is 00:00:00 EDT -> 04:00:00 UTC (after 2am jump)
    expect(boundaries.startOfNextDay.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    // Verify local day is exactly 23 hours (82,800,000 ms), NOT 24 hours
    const dayDurationMs = boundaries.startOfNextDay.getTime() - boundaries.startOfToday.getTime();
    expect(dayDurationMs).toBe(23 * 3600 * 1000);

    // Create unique user for isolated test
    const dstUser = '33333333-3333-4333-8333-333333333333';
    await dataStore.createUser({
      id: dstUser,
      email: 'dst-spring@campusflow.test',
      name: 'DST Spring Student',
    });
    const dstCourse = await dataStore.createCourse({
      userId: dstUser,
      code: 'DST101',
      title: 'Daylight Saving Studies',
    });

    // 1ms before start of today -> overdue
    const beforeStart = new Date(boundaries.startOfToday.getTime() - 1);
    await dataStore.createAssessment({
      userId: dstUser,
      courseId: dstCourse.id,
      title: 'Spring: Before Start',
      type: 'Assignment',
      date: beforeStart,
      status: 'upcoming',
    });

    // Exactly at start of today -> due today
    await dataStore.createAssessment({
      userId: dstUser,
      courseId: dstCourse.id,
      title: 'Spring: At Midnight Start',
      type: 'Quiz',
      date: boundaries.startOfToday,
      status: 'upcoming',
    });

    // 1ms before start of next day (23:59:59.999 local EDT) -> due today
    const beforeNextMidnight = new Date(boundaries.startOfNextDay.getTime() - 1);
    await dataStore.createAssessment({
      userId: dstUser,
      courseId: dstCourse.id,
      title: 'Spring: Just Before Next Midnight',
      type: 'Lab',
      date: beforeNextMidnight,
      status: 'upcoming',
    });

    // Exactly at start of next day (00:00:00 local EDT March 9) -> upcoming
    await dataStore.createAssessment({
      userId: dstUser,
      courseId: dstCourse.id,
      title: 'Spring: At Next Midnight',
      type: 'Final Exam',
      date: boundaries.startOfNextDay,
      status: 'upcoming',
    });

    // If 24h addition had been used (2026-03-09T05:00:00Z), an assessment at 04:30:00Z
    // would have been falsely marked due today. Under half-open interval, it is upcoming.
    const earlyNextDay = new Date('2026-03-09T04:30:00.000Z');
    await dataStore.createAssessment({
      userId: dstUser,
      courseId: dstCourse.id,
      title: 'Spring: Early Next Day',
      type: 'Assignment',
      date: earlyNextDay,
      status: 'upcoming',
    });

    const overview = await dataStore.getTodayOverview(dstUser, tz, controlledNow);

    expect(overview.assessments.overdue.map((a) => a.title)).toEqual(['Spring: Before Start']);
    expect(overview.assessments.dueToday.map((a) => a.title)).toEqual([
      'Spring: At Midnight Start',
      'Spring: Just Before Next Midnight',
    ]);
    expect(overview.assessments.upcoming.map((a) => a.title)).toEqual([
      'Spring: At Next Midnight',
      'Spring: Early Next Day',
    ]);
  });

  it('13. DST regression: correctly calculates boundaries and classifies assessments on a 25-hour fall-back day', async () => {
    const { getDayBoundariesInTimezone } = await import('@campusflow/shared');
    const tz = 'America/New_York';
    // Controlled timestamp: November 1, 2026 at 16:00 UTC (11:00 AM EST)
    const controlledNow = new Date('2026-11-01T16:00:00.000Z');

    const boundaries = getDayBoundariesInTimezone(controlledNow, tz);
    // Start of Nov 1 is 00:00:00 EDT -> 04:00:00 UTC
    expect(boundaries.startOfToday.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    // Start of Nov 2 is 00:00:00 EST -> 05:00:00 UTC (after fall back to EST)
    expect(boundaries.startOfNextDay.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    // Verify local day is exactly 25 hours (90,000,000 ms), NOT 24 hours
    const dayDurationMs = boundaries.startOfNextDay.getTime() - boundaries.startOfToday.getTime();
    expect(dayDurationMs).toBe(25 * 3600 * 1000);

    const dstFallUser = '44444444-4444-4444-8444-444444444444';
    await dataStore.createUser({
      id: dstFallUser,
      email: 'dst-fall@campusflow.test',
      name: 'DST Fall Student',
    });
    const dstCourse = await dataStore.createCourse({
      userId: dstFallUser,
      code: 'DST102',
      title: 'Fall Back Studies',
    });

    // An assessment during the 25th hour (e.g. 23:30 local EST on Nov 1 -> 2026-11-02T04:30:00Z)
    // In old 24h logic (start + 86400000 = 04:00:00Z), this would be falsely marked upcoming.
    // In correct half-open boundary (< startOfNextDay = 05:00:00Z), it is due today.
    const twentyFifthHourAssessment = new Date('2026-11-02T04:30:00.000Z');
    await dataStore.createAssessment({
      userId: dstFallUser,
      courseId: dstCourse.id,
      title: 'Fall: 25th Hour Deadline',
      type: 'Assignment',
      date: twentyFifthHourAssessment,
      status: 'upcoming',
    });

    // 1ms before start of next day (23:59:59.999 local EST) -> due today
    const beforeNextMidnight = new Date(boundaries.startOfNextDay.getTime() - 1);
    await dataStore.createAssessment({
      userId: dstFallUser,
      courseId: dstCourse.id,
      title: 'Fall: Just Before Next Midnight',
      type: 'Quiz',
      date: beforeNextMidnight,
      status: 'upcoming',
    });

    // Exactly at start of next day (00:00:00 local EST Nov 2) -> upcoming
    await dataStore.createAssessment({
      userId: dstFallUser,
      courseId: dstCourse.id,
      title: 'Fall: At Next Midnight',
      type: 'Final Exam',
      date: boundaries.startOfNextDay,
      status: 'upcoming',
    });

    const overview = await dataStore.getTodayOverview(dstFallUser, tz, controlledNow);

    expect(overview.assessments.dueToday.map((a) => a.title)).toEqual([
      'Fall: 25th Hour Deadline',
      'Fall: Just Before Next Midnight',
    ]);
    expect(overview.assessments.upcoming.map((a) => a.title)).toEqual(['Fall: At Next Midnight']);
  });

  it('14. Controlled Asia/Kolkata boundaries: standard 24-hour day with non-hour UTC offset', async () => {
    const { getDayBoundariesInTimezone } = await import('@campusflow/shared');
    const tz = 'Asia/Kolkata';
    // Controlled timestamp: October 10, 2026 at 12:00:00 UTC (17:30 IST)
    const controlledNow = new Date('2026-10-10T12:00:00.000Z');

    const boundaries = getDayBoundariesInTimezone(controlledNow, tz);
    // Start of Oct 10 in IST (UTC+05:30) is Oct 9 18:30:00 UTC
    expect(boundaries.startOfToday.toISOString()).toBe('2026-10-09T18:30:00.000Z');
    // Start of Oct 11 in IST is Oct 10 18:30:00 UTC
    expect(boundaries.startOfNextDay.toISOString()).toBe('2026-10-10T18:30:00.000Z');
    // Duration is exactly 24 hours
    const dayDurationMs = boundaries.startOfNextDay.getTime() - boundaries.startOfToday.getTime();
    expect(dayDurationMs).toBe(24 * 3600 * 1000);

    const istUser = '55555555-5555-4555-8555-555555555555';
    await dataStore.createUser({
      id: istUser,
      email: 'ist-user@campusflow.test',
      name: 'IST Student',
    });
    const istCourse = await dataStore.createCourse({
      userId: istUser,
      code: 'IST101',
      title: 'Indian Standard Time Studies',
    });

    // 1ms before start of today -> overdue
    await dataStore.createAssessment({
      userId: istUser,
      courseId: istCourse.id,
      title: 'IST: 1ms Before Today',
      type: 'Quiz',
      date: new Date(boundaries.startOfToday.getTime() - 1),
      status: 'upcoming',
    });

    // Exactly at start of today -> due today
    await dataStore.createAssessment({
      userId: istUser,
      courseId: istCourse.id,
      title: 'IST: At Midnight Start',
      type: 'Assignment',
      date: boundaries.startOfToday,
      status: 'upcoming',
    });

    // 1ms before start of next day -> due today
    await dataStore.createAssessment({
      userId: istUser,
      courseId: istCourse.id,
      title: 'IST: 1ms Before Next Midnight',
      type: 'Lab',
      date: new Date(boundaries.startOfNextDay.getTime() - 1),
      status: 'upcoming',
    });

    // Exactly at start of next day -> upcoming
    await dataStore.createAssessment({
      userId: istUser,
      courseId: istCourse.id,
      title: 'IST: At Next Midnight',
      type: 'Final Exam',
      date: boundaries.startOfNextDay,
      status: 'upcoming',
    });

    const overview = await dataStore.getTodayOverview(istUser, tz, controlledNow);

    expect(overview.assessments.overdue.map((a) => a.title)).toEqual(['IST: 1ms Before Today']);
    expect(overview.assessments.dueToday.map((a) => a.title)).toEqual([
      'IST: At Midnight Start',
      'IST: 1ms Before Next Midnight',
    ]);
    expect(overview.assessments.upcoming.map((a) => a.title)).toEqual(['IST: At Next Midnight']);
  });
});
