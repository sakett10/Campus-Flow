import type {
  PracticeAssessment,
  PracticeStudentAnswer,
  PracticeDiagnosticReport,
  QuestionDiagnosticFeedback,
  DiagnosticErrorCategory,
  StudyStateValue,
} from '@campusflow/types';

export interface EvaluateSubmissionOptions {
  submissionId: string;
  assessment: PracticeAssessment;
  answers: Record<string, PracticeStudentAnswer>;
}

export interface StateUpdateRecommendation {
  topicId: string;
  topicTitle: string;
  suggestedState: StudyStateValue;
  reason: string;
}

/**
 * Diagnostic Rubric Evaluator:
 * Compares student responses against explicit rubrics, identifies correct/incorrect steps,
 * classifies error categories, and derives actionable revision recommendations.
 */
export function evaluatePracticeSubmission(options: EvaluateSubmissionOptions): {
  report: PracticeDiagnosticReport;
  recommendedTopicStateUpdates: StateUpdateRecommendation[];
} {
  const { submissionId, assessment, answers } = options;
  const questionFeedbackList: QuestionDiagnosticFeedback[] = [];

  let totalEarnedMarks = 0;
  let totalMaxMarks = 0;

  const demonstratedStrengths: string[] = [];
  const criticalWeaknesses: string[] = [];
  const topicScoreMap = new Map<string, { topicTitle: string; earned: number; max: number }>();

  for (const question of assessment.questions) {
    const studentAns = answers[question.id];
    const maxMarks = question.marks;
    totalMaxMarks += maxMarks;

    let earnedMarks = 0;
    const correctSteps: string[] = [];
    const incorrectSteps: string[] = [];
    let errorCategory: DiagnosticErrorCategory = 'none';
    let feedbackSummary = '';
    let isGradingEstimated = true;
    let confidenceComment = '';

    const hasAnswer =
      studentAns &&
      ((studentAns.selectedOptionLabel && studentAns.selectedOptionLabel.trim().length > 0) ||
        (studentAns.studentAnswerText && studentAns.studentAnswerText.trim().length > 0));

    if (!hasAnswer) {
      // Unanswered
      earnedMarks = 0;
      errorCategory = 'knowledge_gap';
      incorrectSteps.push('Question left unanswered by student.');
      feedbackSummary = 'No answer submitted. Topic requires fundamental review.';
      isGradingEstimated = false;
      confidenceComment = 'Deterministic check: question was omitted.';
    } else if (question.questionFormat === 'multiple_choice') {
      // Objective MCQ grading: authoritative
      isGradingEstimated = false;
      const selected = (studentAns.selectedOptionLabel || studentAns.studentAnswerText || '')
        .trim()
        .toUpperCase();
      const correctOpt = question.options?.find((o) => o.isCorrect);

      if (correctOpt && selected === correctOpt.label.toUpperCase()) {
        earnedMarks = maxMarks;
        correctSteps.push(`Selected correct Option ${correctOpt.label}: ${correctOpt.text}`);
        feedbackSummary = correctOpt.explanation || 'Correct option selected.';
        confidenceComment = 'Authoritative: exact match against objective key.';
      } else {
        earnedMarks = 0;
        errorCategory = 'conceptual_misunderstanding';
        incorrectSteps.push(
          `Selected ${selected || 'invalid option'}, but correct option is ${correctOpt?.label}.`,
        );
        feedbackSummary = correctOpt?.explanation || 'Incorrect option choice.';
        confidenceComment = 'Authoritative: mismatch against objective key.';
      }
    } else if (question.questionFormat === 'numerical') {
      // Numerical Answer evaluation
      const ansText = (studentAns.studentAnswerText || '').trim();
      const expectedAnswerStr = question.finalAnswer.replace(/[^\d.]/g, '');
      const studentNumMatch = ansText.match(/[-+]?[0-9]*\.?[0-9]+/);

      if (studentNumMatch && expectedAnswerStr) {
        const studentNum = parseFloat(studentNumMatch[0]);
        const expectedNum = parseFloat(expectedAnswerStr);
        const diff = Math.abs(studentNum - expectedNum);

        if (diff < 0.05 || (expectedNum !== 0 && diff / Math.abs(expectedNum) < 0.02)) {
          earnedMarks = maxMarks;
          correctSteps.push(
            'Identified correct calculation method and produced accurate numeric magnitude.',
          );
          feedbackSummary = `Accurate final computation (${ansText}).`;
          isGradingEstimated = false;
          confidenceComment = 'Deterministic check: numeric value matches within tolerance.';
        } else {
          // Partial credit for attempting method
          earnedMarks = Math.floor(maxMarks * 0.4);
          errorCategory = 'calculation_error';
          correctSteps.push('Problem setup attempted with numerical parameters.');
          incorrectSteps.push(`Calculated ${studentNum}, but expected target was ${expectedNum}.`);
          feedbackSummary = `Computational divergence. Verify arithmetic steps and unit conversion.`;
          isGradingEstimated = true;
          confidenceComment =
            'Estimated: awarded 40% partial marks for methodology; final result deviated.';
        }
      } else {
        earnedMarks = Math.floor(maxMarks * 0.2);
        errorCategory = 'incomplete_explanation';
        incorrectSteps.push('Failed to produce a clear numeric answer or final calculation.');
        feedbackSummary = 'Incomplete numerical computation.';
        isGradingEstimated = true;
        confidenceComment = 'Estimated partial credit for attempt.';
      }
    } else {
      // Subjective / Short Answer / Essay
      isGradingEstimated = true;
      const ansText = (studentAns.studentAnswerText || '').trim();
      const wordCount = ansText.split(/\s+/).filter(Boolean).length;

      if (wordCount < 10) {
        earnedMarks = Math.floor(maxMarks * 0.25);
        errorCategory = 'incomplete_explanation';
        incorrectSteps.push('Response is too brief to substantiate technical requirements.');
        feedbackSummary =
          'Answer is underdeveloped. Core mechanics and trade-offs were not elaborated.';
        confidenceComment = 'Estimated: brief keyword mention only.';
      } else {
        // Compare with key terms from topic and solution
        const keyTerms = question.workedSolution
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 4);

        const ansLower = ansText.toLowerCase();
        let matchedTerms = 0;
        for (const term of keyTerms) {
          if (ansLower.includes(term)) matchedTerms++;
        }

        const matchRatio = keyTerms.length > 0 ? matchedTerms / keyTerms.length : 0.5;

        if (matchRatio >= 0.5) {
          earnedMarks = Math.max(Math.floor(maxMarks * 0.8), maxMarks - 1);
          correctSteps.push('Accurately captured core terminology and structural dependencies.');
          correctSteps.push('Addressed trade-offs and mitigation mechanisms.');
          feedbackSummary = 'Comprehensive explanation adhering to standard academic expectations.';
          confidenceComment = 'Estimated: strong concept and vocabulary alignment.';
        } else if (matchRatio >= 0.25) {
          earnedMarks = Math.floor(maxMarks * 0.55);
          errorCategory = 'incomplete_explanation';
          correctSteps.push('Demonstrates foundational awareness of the topic.');
          incorrectSteps.push('Missing in-depth analysis of trade-offs and failure scenarios.');
          feedbackSummary = 'Acceptable baseline answer, but lacks detailed technical depth.';
          confidenceComment = 'Estimated: moderate concept coverage.';
        } else {
          earnedMarks = Math.floor(maxMarks * 0.3);
          errorCategory = 'conceptual_misunderstanding';
          incorrectSteps.push(
            'Key architectural and theoretical terms from the syllabus were missing.',
          );
          feedbackSummary =
            'Response demonstrates conceptual gaps. Consult textbook reference notes.';
          confidenceComment = 'Estimated: limited concept coverage.';
        }
      }
    }

    totalEarnedMarks += earnedMarks;

    // Track by topic
    const topicId = question.topicId;
    let topicStat = topicScoreMap.get(topicId);
    if (!topicStat) {
      topicStat = { topicTitle: question.topicTitle, earned: 0, max: 0 };
      topicScoreMap.set(topicId, topicStat);
    }
    topicStat.earned += earnedMarks;
    topicStat.max += maxMarks;

    const recommendedAction =
      earnedMarks === maxMarks
        ? `Consolidate retention with spaced retrieval practice in 5 days.`
        : errorCategory === 'calculation_error'
          ? `Work through 2 additional quantitative examples on ${question.topicTitle}.`
          : `Review core concept notes and worked examples for ${question.topicTitle}.`;

    questionFeedbackList.push({
      questionId: question.id,
      questionNumber: question.questionNumber,
      maxMarks,
      earnedMarks,
      isGradingEstimated,
      confidenceComment,
      correctSteps,
      incorrectSteps,
      errorCategory,
      relatedTopicId: question.topicId,
      relatedTopicTitle: question.topicTitle,
      feedbackSummary,
      recommendedReviewAction: recommendedAction,
    });
  }

  // Determine overall strengths, weaknesses, and state recommendations
  const recommendedTopicStateUpdates: StateUpdateRecommendation[] = [];
  const recommendedFollowUpTopics: PracticeDiagnosticReport['recommendedFollowUpTopics'] = [];

  for (const [topicId, stat] of Array.from(topicScoreMap.entries())) {
    const ratio = stat.max > 0 ? stat.earned / stat.max : 0;
    const pct = Math.round(ratio * 100);

    if (ratio >= 0.8) {
      demonstratedStrengths.push(`${stat.topicTitle} (${pct}% marks achieved)`);
      recommendedTopicStateUpdates.push({
        topicId,
        topicTitle: stat.topicTitle,
        suggestedState: 'reviewed',
        reason: `Demonstrated ${pct}% accuracy on practice assessment questions.`,
      });
    } else if (ratio < 0.6) {
      criticalWeaknesses.push(`${stat.topicTitle} (${pct}% marks achieved)`);
      recommendedTopicStateUpdates.push({
        topicId,
        topicTitle: stat.topicTitle,
        suggestedState: 'needs_review',
        reason: `Scored below 60% (${pct}%) on practice assessment. Revision recommended.`,
      });
      recommendedFollowUpTopics.push({
        topicId,
        topicTitle: stat.topicTitle,
        priority: ratio < 0.4 ? 'high' : 'medium',
        recommendedMinutes: ratio < 0.4 ? 45 : 30,
      });
    } else {
      recommendedTopicStateUpdates.push({
        topicId,
        topicTitle: stat.topicTitle,
        suggestedState: 'learning',
        reason: `Moderate mastery (${pct}%). Continued guided practice advised.`,
      });
      recommendedFollowUpTopics.push({
        topicId,
        topicTitle: stat.topicTitle,
        priority: 'low',
        recommendedMinutes: 20,
      });
    }
  }

  const overallPercentage =
    totalMaxMarks > 0 ? Math.round((totalEarnedMarks / totalMaxMarks) * 100) : 0;

  const report: PracticeDiagnosticReport = {
    submissionId,
    totalEarnedMarks,
    totalMaxMarks,
    percentage: overallPercentage,
    demonstratedStrengths,
    criticalWeaknesses,
    recommendedFollowUpTopics,
    questionFeedback: questionFeedbackList,
    generatedAt: new Date().toISOString(),
  };

  return { report, recommendedTopicStateUpdates };
}
