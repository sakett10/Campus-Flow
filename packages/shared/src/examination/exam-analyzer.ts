import type {
  ExaminationPaper,
  ExaminationQuestion,
  AcademicNode,
  ExamPaperStructuralAnalysis,
  ExamTopicAnalysis,
  CrossPaperComparisonReport,
} from '@campusflow/types';

/**
 * Produces an auditable structural analysis of a single examination paper.
 */
export function analyzeExamPaper(
  paper: ExaminationPaper,
  questions: ExaminationQuestion[],
  courseNodes: AcademicNode[],
): ExamPaperStructuralAnalysis {
  const topics = courseNodes.filter((n) => n.type === 'topic');
  const questionCount = questions.length;
  const subquestions = questions.filter((q) => !!q.parentQuestionId);

  // 1. Calculate observed marks
  let calculatedMarks = 0;
  const marksDistribution: Record<string, number> = {};
  const questionFormats: Record<string, number> = {};
  const optionalRulesSummary: string[] = [];

  for (const q of questions) {
    const marks = q.marks || 0;
    calculatedMarks += marks;

    // By format
    questionFormats[q.questionFormat] = (questionFormats[q.questionFormat] || 0) + 1;

    // By difficulty
    marksDistribution[q.difficulty] = (marksDistribution[q.difficulty] || 0) + marks;

    if (!q.compulsory || q.choiceGroup) {
      const rule = q.choiceGroup || `Question ${q.questionNumber} is optional or offers choices`;
      if (!optionalRulesSummary.includes(rule)) {
        optionalRulesSummary.push(rule);
      }
    }
  }

  // 2. Syllabus Coverage
  const coveredTopicIds = Array.from(
    new Set(questions.map((q) => q.topicId).filter((id): id is string => !!id)),
  );
  const totalTopics = topics.length;
  const coveredCount = coveredTopicIds.filter((id) => topics.some((t) => t.id === id)).length;
  const syllabusCoveragePercentage =
    totalTopics > 0 ? Math.round((coveredCount / totalTopics) * 100) : 0;

  const uncoveredTopicIds = topics.filter((t) => !coveredTopicIds.includes(t.id)).map((t) => t.id);

  return {
    paperId: paper.id,
    title: paper.title,
    totalMarks: paper.totalMarks || calculatedMarks,
    durationMinutes: paper.durationMinutes || 180,
    questionCount,
    subquestionCount: subquestions.length,
    marksDistribution,
    optionalRulesSummary,
    questionFormats,
    syllabusCoveragePercentage,
    coveredTopicIds,
    uncoveredTopicIds,
  };
}

/**
 * Analyzes topic distribution, frequency, and weight across an examination question set.
 */
export function analyzeTopicCoverage(
  questions: ExaminationQuestion[],
  courseNodes: AcademicNode[],
): ExamTopicAnalysis[] {
  const topics = courseNodes.filter((n) => n.type === 'topic');
  const topicMap = new Map<string, AcademicNode>();
  for (const t of topics) topicMap.set(t.id, t);

  const analysisByTopic = new Map<
    string,
    {
      topicId: string;
      topicTitle: string;
      questionCount: number;
      totalMarksObserved: number;
      questionReferences: Array<{
        paperId: string;
        paperTitle: string;
        questionNumber: string;
        marks?: number | undefined;
      }>;
      difficultyDistribution: Record<string, number>;
    }
  >();

  // Pre-populate with all syllabus topics so coverage gaps are transparent
  for (const t of topics) {
    analysisByTopic.set(t.id, {
      topicId: t.id,
      topicTitle: t.title,
      questionCount: 0,
      totalMarksObserved: 0,
      questionReferences: [],
      difficultyDistribution: {},
    });
  }

  for (const q of questions) {
    if (!q.topicId) continue;
    let entry = analysisByTopic.get(q.topicId);
    if (!entry) {
      const foundTitle = topicMap.get(q.topicId)?.title || q.topicTitle || 'Unmapped Topic';
      entry = {
        topicId: q.topicId,
        topicTitle: foundTitle,
        questionCount: 0,
        totalMarksObserved: 0,
        questionReferences: [],
        difficultyDistribution: {},
      };
      analysisByTopic.set(q.topicId, entry);
    }

    entry.questionCount++;
    const marks = q.marks || 0;
    entry.totalMarksObserved += marks;
    entry.difficultyDistribution[q.difficulty] =
      (entry.difficultyDistribution[q.difficulty] || 0) + 1;
    entry.questionReferences.push({
      paperId: q.paperId,
      paperTitle: `Paper Ref ${q.paperId.slice(0, 8)}`,
      questionNumber: q.questionNumber,
      marks: q.marks ?? undefined,
    });
  }

  return Array.from(analysisByTopic.values()).sort(
    (a, b) => b.totalMarksObserved - a.totalMarksObserved,
  );
}

/**
 * Cross-paper comparative analysis across multiple historical examination papers.
 * Adheres strictly to the ethical rule: no fabricated predictive percentages.
 */
export function compareCrossPapers(
  papers: ExaminationPaper[],
  questions: ExaminationQuestion[],
  courseNodes: AcademicNode[],
): CrossPaperComparisonReport {
  const topics = courseNodes.filter((n) => n.type === 'topic');
  const paperCount = papers.length;
  const analyzedPaperIds = papers.map((p) => p.id);
  const totalQuestionsAnalyzed = questions.length;

  if (paperCount === 0) {
    return {
      courseId: courseNodes[0]?.courseId || '',
      paperCount: 0,
      analyzedPaperIds: [],
      totalQuestionsAnalyzed: 0,
      repeatedTopicThemes: [],
      observedFormatShifts: ['No examination papers uploaded yet.'],
      topicCoverageSpread: [],
      uncoveredCourseTopics: topics.map((t) => ({ topicId: t.id, topicTitle: t.title })),
      uncertaintyNote:
        'Insufficient data: Upload at least 2 previous examination papers to observe trends across semesters.',
    };
  }

  // 1. Group questions by paper and topic
  const paperTopicAppearance = new Map<string, Set<string>>(); // topicId -> Set of paperIds
  const topicSampleQuestions = new Map<string, string[]>();

  for (const q of questions) {
    if (!q.topicId) continue;
    if (!paperTopicAppearance.has(q.topicId)) {
      paperTopicAppearance.set(q.topicId, new Set());
      topicSampleQuestions.set(q.topicId, []);
    }
    paperTopicAppearance.get(q.topicId)!.add(q.paperId);

    const samples = topicSampleQuestions.get(q.topicId)!;
    if (samples.length < 3 && q.questionText) {
      samples.push(q.questionText.slice(0, 100));
    }
  }

  // 2. Build topic coverage spread
  const topicCoverageSpread = topics.map((t) => {
    const papersAppeared = paperTopicAppearance.get(t.id)?.size || 0;
    const ratio = paperCount > 0 ? Number((papersAppeared / paperCount).toFixed(2)) : 0;
    return {
      topicId: t.id,
      topicTitle: t.title,
      papersAppearedIn: papersAppeared,
      totalPapers: paperCount,
      coverageRatio: ratio,
    };
  });

  // Sort by frequency of appearance
  topicCoverageSpread.sort((a, b) => b.papersAppearedIn - a.papersAppearedIn);

  // 3. Repeated topic themes (appeared in >= 2 papers or >= 50% of available papers)
  const repeatedTopicThemes = topicCoverageSpread
    .filter((t) => (paperCount > 1 ? t.papersAppearedIn >= 2 : t.papersAppearedIn >= 1))
    .map((t) => ({
      topicId: t.topicId,
      topicTitle: t.topicTitle,
      frequency: t.papersAppearedIn,
      sampleQuestions: topicSampleQuestions.get(t.topicId) || [],
    }));

  // 4. Identify completely uncovered course topics across all uploaded papers
  const uncoveredCourseTopics = topicCoverageSpread
    .filter((t) => t.papersAppearedIn === 0)
    .map((t) => ({ topicId: t.topicId, topicTitle: t.topicTitle }));

  // 5. Observed format shifts
  const observedFormatShifts: string[] = [];
  if (paperCount >= 2) {
    // Check marks variation
    const marksList = papers.map((p) => p.totalMarks).filter((m): m is number => m != null);
    if (new Set(marksList).size > 1) {
      observedFormatShifts.push(
        `Total marks varied across papers (${marksList.join(', ')} marks), indicating changes in examination regulations or exam types.`,
      );
    }

    // Check duration variation
    const durationList = papers.map((p) => p.durationMinutes).filter((d): d is number => d != null);
    if (new Set(durationList).size > 1) {
      observedFormatShifts.push(
        `Exam durations varied between ${Math.min(...durationList)}m and ${Math.max(...durationList)}m.`,
      );
    }

    // Check MCQ presence
    const mcqPapers = new Set(
      questions.filter((q) => q.questionFormat === 'multiple_choice').map((q) => q.paperId),
    );
    if (mcqPapers.size > 0 && mcqPapers.size < paperCount) {
      observedFormatShifts.push(
        'Multiple-choice questions appeared in some papers but were absent in others.',
      );
    }
  } else {
    observedFormatShifts.push(
      'Only 1 paper uploaded; cross-semester structural shifts cannot be inferred.',
    );
  }

  const uncertaintyNote =
    paperCount < 3
      ? `Sample size is limited (${paperCount} paper${paperCount === 1 ? '' : 's'}). Observed appearance frequencies reflect historical occurrences and must not be interpreted as predictive certainties for future exams.`
      : `Based on ${paperCount} previous papers and ${totalQuestionsAnalyzed} questions. Frequencies represent observed empirical coverage across past terms; university curricula and exam setters may introduce untested topics.`;

  return {
    courseId: courseNodes[0]?.courseId || '',
    paperCount,
    analyzedPaperIds,
    totalQuestionsAnalyzed,
    repeatedTopicThemes,
    observedFormatShifts,
    topicCoverageSpread,
    uncoveredCourseTopics,
    uncertaintyNote,
  };
}
