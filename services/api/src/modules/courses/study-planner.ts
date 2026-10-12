import type { AcademicNode, PlanWorkloadWarning, StudySession } from '@campusflow/types';

export interface GeneratePlanOptions {
  courseId: string;
  userId: string;
  planId: string;
  courseTitle: string;
  targetExamDate: Date;
  availableHoursPerWeek: number;
  dailyTargetMinutes?: number;
  preferredDays?: number[]; // [0, 1, 2, 3, 4, 5, 6] where 0 = Sun
  topics: AcademicNode[];
}

export interface GeneratedPlanResult {
  sessions: Array<Omit<StudySession, 'id' | 'createdAt' | 'updatedAt'>>;
  workloadWarning?: PlanWorkloadWarning | undefined;
}

/**
 * Deterministic personalized study schedule generator.
 *
 * Distributes course topics across available days leading up to target exam date,
 * interleaves revision sessions, calculates workload deficit warnings, and supports recovery.
 */
export function generateStudySchedule(options: GeneratePlanOptions): GeneratedPlanResult {
  const {
    courseId,
    userId,
    planId,
    targetExamDate,
    dailyTargetMinutes = 60,
    preferredDays = [1, 2, 3, 4, 5, 6], // Mon-Sat default
    topics,
  } = options;

  const now = new Date();
  const startDate = new Date(now);
  startDate.setHours(9, 0, 0, 0); // Start next local study slot

  // Ensure exam is in the future
  const examInstant = new Date(targetExamDate);
  examInstant.setHours(18, 0, 0, 0);

  const totalDays = Math.max(
    1,
    Math.round((examInstant.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
  );

  // Generate available calendar dates
  const availableDates: Date[] = [];
  const cursor = new Date(startDate);
  while (cursor < examInstant) {
    const dayOfWeek = cursor.getDay();
    if (preferredDays.includes(dayOfWeek)) {
      availableDates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Fallback: If no preferred days matched, use all calendar days
  if (availableDates.length === 0) {
    const fallbackCursor = new Date(startDate);
    while (fallbackCursor < examInstant) {
      availableDates.push(new Date(fallbackCursor));
      fallbackCursor.setDate(fallbackCursor.getDate() + 1);
    }
  }

  // Filter topics (only topic nodes, ordered)
  const topicNodes = topics.filter((t) => t.type === 'topic');
  const sortedTopics = [...topicNodes].sort((a, b) => a.orderIndex - b.orderIndex);

  // Calculate demand
  let totalTopicMinutes = 0;
  for (const t of sortedTopics) {
    totalTopicMinutes += t.estimatedMinutes || 60;
  }
  // Add 25% buffer for revision and practice
  const revisionMinutes = Math.round(totalTopicMinutes * 0.25);
  const totalRequiredMinutes = totalTopicMinutes + revisionMinutes;

  // Calculate capacity
  const totalAvailableMinutes = availableDates.length * dailyTargetMinutes;

  let workloadWarning: PlanWorkloadWarning | undefined;
  if (totalRequiredMinutes > totalAvailableMinutes) {
    const deficitMinutes = totalRequiredMinutes - totalAvailableMinutes;
    const recommendedDaily = Math.ceil(totalRequiredMinutes / availableDates.length);
    workloadWarning = {
      hasWarning: true,
      totalRequiredMinutes,
      availableMinutes: totalAvailableMinutes,
      deficitMinutes,
      message: `Workload warning: ${Math.round(totalRequiredMinutes / 60)}h study needed before exam (${totalDays} days), but at ${dailyTargetMinutes}m/day you have ${Math.round(totalAvailableMinutes / 60)}h scheduled. Recommended: increase to ${recommendedDaily} mins/day.`,
    };
  }

  // Generate sessions
  const sessions: Array<Omit<StudySession, 'id' | 'createdAt' | 'updatedAt'>> = [];
  let dateIndex = 0;
  let orderIndex = 0;

  for (let i = 0; i < sortedTopics.length; i++) {
    const topic = sortedTopics[i]!;
    const scheduledDate = availableDates[dateIndex % availableDates.length] || new Date(startDate);
    const duration = Math.min(dailyTargetMinutes, topic.estimatedMinutes || 60);

    sessions.push({
      planId,
      userId,
      courseId,
      topicId: topic.id,
      title: `Study: ${topic.title}`,
      scheduledDate,
      durationMinutes: duration,
      sessionType: 'study',
      status: 'scheduled',
      orderIndex: orderIndex++,
      notes: topic.notes ?? null,
    });

    dateIndex++;

    // Insert periodic review session every 3 topics
    if ((i + 1) % 3 === 0 && dateIndex < availableDates.length) {
      const reviewDate = availableDates[dateIndex % availableDates.length] || scheduledDate;
      sessions.push({
        planId,
        userId,
        courseId,
        topicId: topic.id,
        title: `Revision & Practice: Module Checkpoint`,
        scheduledDate: reviewDate,
        durationMinutes: Math.min(dailyTargetMinutes, 45),
        sessionType: 'review',
        status: 'scheduled',
        orderIndex: orderIndex++,
        notes: `Review concepts covered in previous 3 topics`,
      });
      dateIndex++;
    }
  }

  // Pre-exam final review sessions
  if (sortedTopics.length > 0) {
    const finalDate =
      availableDates[availableDates.length - 1] || new Date(examInstant.getTime() - 86400000);
    sessions.push({
      planId,
      userId,
      courseId,
      topicId: sortedTopics[sortedTopics.length - 1]!.id,
      title: `Final Comprehensive Review & Mock Exam`,
      scheduledDate: finalDate,
      durationMinutes: dailyTargetMinutes,
      sessionType: 'practice',
      status: 'scheduled',
      orderIndex: orderIndex++,
      notes: `Consolidate all modules and practice timed questions before exam.`,
    });
  }

  return { sessions, workloadWarning };
}

/**
 * Redistributes missed/overdue study sessions into future available dates before exam date.
 */
export function recoverMissedSessions(
  existingSessions: StudySession[],
  targetExamDate: Date,
  _dailyTargetMinutes = 60,
): StudySession[] {
  const now = new Date();
  const uncompletedPastSessions = existingSessions.filter(
    (s) => s.status === 'scheduled' && new Date(s.scheduledDate) < now,
  );

  if (uncompletedPastSessions.length === 0) {
    return existingSessions;
  }

  // Find remaining future dates
  const futureStart = new Date(now);
  futureStart.setDate(futureStart.getDate() + 1);
  futureStart.setHours(9, 0, 0, 0);

  const updatedSessions = existingSessions.map((s) => ({ ...s }));
  const rescheduleCursor = new Date(futureStart);

  for (const missed of uncompletedPastSessions) {
    const idx = updatedSessions.findIndex((s) => s.id === missed.id);
    if (idx !== -1) {
      // Find a slot before exam
      if (rescheduleCursor < targetExamDate) {
        updatedSessions[idx] = {
          ...updatedSessions[idx]!,
          scheduledDate: new Date(rescheduleCursor),
          notes: `${updatedSessions[idx]!.notes ? updatedSessions[idx]!.notes + ' | ' : ''}Rescheduled via Missed-Session Recovery on ${now.toISOString().slice(0, 10)}`,
        };
        rescheduleCursor.setDate(rescheduleCursor.getDate() + 1);
      }
    }
  }

  return updatedSessions;
}
