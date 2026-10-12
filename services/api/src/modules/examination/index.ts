import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import {
  AppError,
  validateFileBytes,
  extractDocumentText,
  parseExaminationDocument,
  analyzeExamPaper,
  analyzeTopicCoverage,
  compareCrossPapers,
  generatePracticeAssessment,
  evaluatePracticeSubmission,
  defaultAiUsageController,
  normalizeFileName,
} from '@campusflow/shared';
import { sharedStorage } from '../resources/index.js';
import type {
  ExaminationPaper,
  ExaminationQuestion,
  PracticeAssessmentFormat,
  QuestionVerificationStatus,
  PracticeStudentAnswer,
} from '@campusflow/types';

export const examinationRouter = new Hono();

const updatePaperSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  term: z.string().max(50).optional().nullable(),
  examType: z.string().max(50).optional().nullable(),
  academicYear: z.string().max(50).optional().nullable(),
  totalMarks: z.number().min(0).max(500).optional().nullable(),
  durationMinutes: z.number().int().min(10).max(600).optional().nullable(),
  instructions: z.string().optional().nullable(),
});

const updateQuestionSchema = z.object({
  questionText: z.string().min(1).optional(),
  marks: z.number().min(0).max(100).optional().nullable(),
  topicId: z.string().uuid().optional().nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'uncertain']).optional(),
  verificationStatus: z.enum(['extracted', 'verified_by_user', 'rejected']).optional(),
  userNotes: z.string().max(2000).optional().nullable(),
  questionFormat: z
    .enum([
      'multiple_choice',
      'short_answer',
      'numerical',
      'essay',
      'derivation',
      'coding',
      'diagram',
    ])
    .optional(),
});

const generatePracticeSchema = z.object({
  format: z
    .enum(['standard', 'quick_diagnostic', 'full_simulation', 'targeted_weakness'])
    .default('standard'),
  blueprintId: z.string().uuid().optional().nullable(),
  targetDifficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  focusTopicIds: z.array(z.string().uuid()).optional(),
});

const submitPracticeSchema = z.object({
  timeSpentSeconds: z.number().int().min(0).default(0),
  answers: z.record(
    z.string(),
    z.object({
      questionId: z.string(),
      studentAnswerText: z.string().default(''),
      selectedOptionLabel: z.string().optional(),
      selfReportedConfidence: z.enum(['low', 'medium', 'high']).optional(),
    }),
  ),
});

// ==========================================
// 1. Examination Papers Ingestion & CRUD
// ==========================================

// GET /api/v1/examination/courses/:courseId/papers
examinationRouter.get('/courses/:courseId/papers', async (c) => {
  const session = getSession(c);
  const courseId = c.req.param('courseId');
  await defaultStore.getCourse(courseId, session.userId);

  const papers = await defaultStore.listExaminationPapers(courseId, session.userId);
  return c.json(papers);
});

// POST /api/v1/examination/courses/:courseId/papers/upload
examinationRouter.post('/courses/:courseId/papers/upload', async (c) => {
  const session = getSession(c);
  const courseId = c.req.param('courseId');
  const course = await defaultStore.getCourse(courseId, session.userId);

  const contentType = c.req.header('content-type') || '';
  let buffer: Buffer;
  let fileName = 'examination_paper.pdf';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.parseBody().catch(() => null);
    if (!formData || !formData['file']) {
      throw AppError.badRequest('File is required in multipart upload.');
    }

    const file = formData['file'];
    if (
      !file ||
      typeof file === 'string' ||
      typeof (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer !== 'function'
    ) {
      throw AppError.badRequest('Invalid file upload.');
    }

    const fileObj = file as File;
    fileName = normalizeFileName(fileObj.name || 'examination_paper.pdf');
    const arrayBuffer = await fileObj.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.text) {
      throw AppError.badRequest('Text or multipart file is required.');
    }
    buffer = Buffer.from(body.text, 'utf-8');
    fileName = 'examination_paper.txt';
  }

  // 1. Validate file bytes
  const validated = validateFileBytes(buffer, fileName);
  if (!validated.isValid) {
    throw AppError.badRequest(validated.error || 'Invalid file format.');
  }

  // 2. Extract text with page preservation
  const extraction = await extractDocumentText(buffer, validated.detectedMimeType);

  // 3. Fetch academic nodes for topic mapping
  const academicNodes = await defaultStore.listAcademicNodes(courseId, session.userId);

  // 4. Parse question paper structure
  const parsed = parseExaminationDocument(extraction, academicNodes);

  // 5. Store uploaded document in object storage
  const objectKey = `users/${session.userId}/resources/${Date.now()}_${encodeURIComponent(fileName)}`;
  await sharedStorage.upload(objectKey, buffer, validated.detectedMimeType);

  const resource = await defaultStore.createResource({
    userId: session.userId,
    courseId,
    title: parsed.title || fileName,
    type: 'question_bank',
    objectKey,
    mimeType: validated.detectedMimeType,
    sizeBytes: validated.sizeBytes,
    contentHash: validated.contentHash,
    pageCount: extraction.pageCount,
    processingStatus: parsed.status === 'ready' ? 'ready' : 'failed',
  });

  // 6. Create examination paper record
  const paper = await defaultStore.createExaminationPaper({
    userId: session.userId,
    courseId,
    resourceId: resource.id,
    title: parsed.title || `${course.code} Examination Paper`,
    term: parsed.term || course.term || null,
    examType: parsed.examType || 'FAT',
    academicYear: parsed.academicYear || null,
    totalMarks: parsed.totalMarks ?? null,
    durationMinutes: parsed.durationMinutes ?? 180,
    instructions: parsed.instructions ?? null,
    status: parsed.status,
    metadata: {
      unclearFields: parsed.unclearFields,
      warnings: parsed.warnings,
      detectedMimeType: validated.detectedMimeType,
    },
  });

  // 7. Bulk insert extracted questions
  const questionsToInsert = parsed.questions.map((q) => ({
    paperId: paper.id,
    userId: session.userId,
    courseId,
    questionNumber: q.questionNumber,
    parentQuestionId: null,
    questionText: q.questionText,
    marks: q.marks ?? null,
    pageNumber: q.pageNumber ?? null,
    questionFormat: q.questionFormat,
    options: q.options ?? null,
    compulsory: q.compulsory,
    choiceGroup: q.choiceGroup ?? null,
    candidateTopics: q.candidateTopics,
    topicId: q.topicId ?? null,
    topicConfidence: q.topicConfidence ?? null,
    difficulty: q.difficulty,
    difficultyUncertainty: q.difficultyUncertainty,
    cognitiveLevel: q.cognitiveLevel ?? null,
    verificationStatus: 'extracted' as QuestionVerificationStatus,
    userNotes: null,
    sourceSnippet: q.sourceSnippet,
  }));

  const createdQuestions = await defaultStore.createExaminationQuestions(questionsToInsert);

  return c.json(
    {
      paper,
      questions: createdQuestions,
      warnings: parsed.warnings,
    },
    201,
  );
});

// GET /api/v1/examination/papers/:paperId
examinationRouter.get('/papers/:paperId', async (c) => {
  const session = getSession(c);
  const paperId = c.req.param('paperId');

  const paper = await defaultStore.getExaminationPaper(paperId, session.userId);
  const questions = await defaultStore.listQuestionsForPaper(paperId, session.userId);

  return c.json({ paper, questions });
});

// PUT /api/v1/examination/papers/:paperId
examinationRouter.put('/papers/:paperId', async (c) => {
  const session = getSession(c);
  const paperId = c.req.param('paperId');
  const body = await c.req.json().catch(() => null);

  const parsed = updatePaperSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid update paper payload', parsed.error.format());
  }

  const updates: Partial<ExaminationPaper> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.term !== undefined) updates.term = parsed.data.term;
  if (parsed.data.examType !== undefined) updates.examType = parsed.data.examType;
  if (parsed.data.academicYear !== undefined) updates.academicYear = parsed.data.academicYear;
  if (parsed.data.totalMarks !== undefined) updates.totalMarks = parsed.data.totalMarks;
  if (parsed.data.durationMinutes !== undefined)
    updates.durationMinutes = parsed.data.durationMinutes;
  if (parsed.data.instructions !== undefined) updates.instructions = parsed.data.instructions;

  const updated = await defaultStore.updateExaminationPaper(paperId, session.userId, updates);
  return c.json(updated);
});

// DELETE /api/v1/examination/papers/:paperId
examinationRouter.delete('/papers/:paperId', async (c) => {
  const session = getSession(c);
  const paperId = c.req.param('paperId');

  await defaultStore.deleteExaminationPaper(paperId, session.userId);
  return c.json({ success: true, message: 'Examination paper deleted.' });
});

// PUT /api/v1/examination/questions/:questionId (User Inspection & Corrections)
examinationRouter.put('/questions/:questionId', async (c) => {
  const session = getSession(c);
  const questionId = c.req.param('questionId');
  const body = await c.req.json().catch(() => null);

  const parsed = updateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid update question payload', parsed.error.format());
  }

  const updates: Partial<ExaminationQuestion> = {
    verificationStatus: (parsed.data.verificationStatus ||
      'verified_by_user') as QuestionVerificationStatus,
  };
  if (parsed.data.questionText !== undefined) updates.questionText = parsed.data.questionText;
  if (parsed.data.marks !== undefined) updates.marks = parsed.data.marks;
  if (parsed.data.topicId !== undefined) updates.topicId = parsed.data.topicId;
  if (parsed.data.difficulty !== undefined) updates.difficulty = parsed.data.difficulty;
  if (parsed.data.userNotes !== undefined) updates.userNotes = parsed.data.userNotes;
  if (parsed.data.questionFormat !== undefined) updates.questionFormat = parsed.data.questionFormat;

  const updated = await defaultStore.updateExaminationQuestion(questionId, session.userId, updates);
  return c.json(updated);
});

// ==========================================
// 2. Examination Analysis Engine (Structural, Topic, Cross-Paper)
// ==========================================

// GET /api/v1/examination/courses/:courseId/analysis
examinationRouter.get('/courses/:courseId/analysis', async (c) => {
  const session = getSession(c);
  const courseId = c.req.param('courseId');
  await defaultStore.getCourse(courseId, session.userId);

  const [papers, questions, nodes] = await Promise.all([
    defaultStore.listExaminationPapers(courseId, session.userId),
    defaultStore.listQuestionsForCourse(courseId, session.userId),
    defaultStore.listAcademicNodes(courseId, session.userId),
  ]);

  const paperAnalyses = papers.map((p) => {
    const paperQuestions = questions.filter((q) => q.paperId === p.id);
    return analyzeExamPaper(p, paperQuestions, nodes);
  });

  const topicAnalysis = analyzeTopicCoverage(questions, nodes);
  const crossPaperReport = compareCrossPapers(papers, questions, nodes);

  return c.json({
    courseId,
    paperCount: papers.length,
    questionCount: questions.length,
    paperAnalyses,
    topicAnalysis,
    crossPaperReport,
  });
});

// ==========================================
// 3. Structure-Matched Practice Assessments
// ==========================================

// POST /api/v1/examination/courses/:courseId/practice/generate
examinationRouter.post('/courses/:courseId/practice/generate', async (c) => {
  const session = getSession(c);
  const courseId = c.req.param('courseId');
  const course = await defaultStore.getCourse(courseId, session.userId);

  const body = await c.req.json().catch(() => ({}));
  const parsed = generatePracticeSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid generate practice payload', parsed.error.format());
  }

  let blueprint = null;
  if (parsed.data.blueprintId) {
    blueprint = await defaultStore.getExaminationPaper(parsed.data.blueprintId, session.userId);
  }

  const nodes = await defaultStore.listAcademicNodes(courseId, session.userId);

  const practiceOptions = {
    userId: session.userId,
    courseId,
    courseCode: course.code,
    courseTitle: course.title,
    format: parsed.data.format as PracticeAssessmentFormat,
    blueprint,
    academicNodes: nodes,
    targetDifficulty: parsed.data.targetDifficulty,
  };
  const generated = await generatePracticeAssessment(
    parsed.data.focusTopicIds
      ? { ...practiceOptions, focusTopicIds: parsed.data.focusTopicIds }
      : practiceOptions,
  );

  const assessment = await defaultStore.createPracticeAssessment({
    userId: session.userId,
    courseId,
    title: generated.title,
    format: generated.format,
    blueprintId: generated.blueprintId,
    totalMarks: generated.totalMarks,
    durationMinutes: generated.durationMinutes,
    difficulty: generated.difficulty,
    status: 'ready',
    questions: generated.questions,
  });

  return c.json(assessment, 201);
});

// GET /api/v1/examination/courses/:courseId/practice
examinationRouter.get('/courses/:courseId/practice', async (c) => {
  const session = getSession(c);
  const courseId = c.req.param('courseId');
  await defaultStore.getCourse(courseId, session.userId);

  const assessments = await defaultStore.listPracticeAssessments(courseId, session.userId);
  return c.json(assessments);
});

// GET /api/v1/examination/practice/:assessmentId (Blind Student Attempt View)
examinationRouter.get('/practice/:assessmentId', async (c) => {
  const session = getSession(c);
  const assessmentId = c.req.param('assessmentId');
  const showSolutions = c.req.query('showSolutions') === 'true';

  const assessment = await defaultStore.getPracticeAssessment(assessmentId, session.userId);

  // If student hasn't submitted yet and not explicitly requesting solutions, strip solutions
  if (!showSolutions) {
    const studentViewQuestions = assessment.questions.map((q) => ({
      ...q,
      workedSolution: '[Hidden until submission]',
      finalAnswer: '[Hidden until submission]',
      options: q.options?.map((opt) => ({
        label: opt.label,
        text: opt.text,
      })),
    }));

    return c.json({
      ...assessment,
      questions: studentViewQuestions,
    });
  }

  return c.json(assessment);
});

// POST /api/v1/examination/practice/:assessmentId/submit (Evaluation & Diagnostic Report)
examinationRouter.post('/practice/:assessmentId/submit', async (c) => {
  const session = getSession(c);
  const assessmentId = c.req.param('assessmentId');
  const assessment = await defaultStore.getPracticeAssessment(assessmentId, session.userId);

  const body = await c.req.json().catch(() => null);
  const parsed = submitPracticeSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid submission payload', parsed.error.format());
  }

  const submissionId = crypto.randomUUID();
  const evaluation = evaluatePracticeSubmission({
    submissionId,
    assessment,
    answers: parsed.data.answers as Record<string, PracticeStudentAnswer>,
  });

  // 1. Create durable practice submission record
  const submission = await defaultStore.createPracticeSubmission({
    assessmentId,
    userId: session.userId,
    courseId: assessment.courseId,
    startedAt: new Date(Date.now() - (parsed.data.timeSpentSeconds || 60) * 1000),
    submittedAt: new Date(),
    timeSpentSeconds: parsed.data.timeSpentSeconds,
    answers: parsed.data.answers as Record<string, PracticeStudentAnswer>,
    diagnosticFeedback: evaluation.report,
  });

  // 2. Automatically update learner study states and record study ledger events
  for (const update of evaluation.recommendedTopicStateUpdates) {
    try {
      await defaultStore.setTopicStudyState(
        assessment.courseId,
        update.topicId,
        session.userId,
        update.suggestedState,
        update.suggestedState === 'reviewed' ? 'reviewed' : 'marked_needs_review',
        {
          submissionId: submission.id,
          reason: update.reason,
        },
      );
    } catch {
      // Non-fatal if state update fails for an unpersisted topic
    }
  }

  // 3. Mark assessment status as completed
  await defaultStore.updatePracticeAssessment(assessmentId, session.userId, {
    status: 'completed',
  });

  return c.json({
    submission,
    report: evaluation.report,
    topicStateUpdates: evaluation.recommendedTopicStateUpdates,
  });
});

// GET /api/v1/examination/practice/:assessmentId/submissions
examinationRouter.get('/practice/:assessmentId/submissions', async (c) => {
  const session = getSession(c);
  const assessmentId = c.req.param('assessmentId');
  await defaultStore.getPracticeAssessment(assessmentId, session.userId);

  const submissions = await defaultStore.listPracticeSubmissions(assessmentId, session.userId);
  return c.json(submissions);
});

// ==========================================
// 4. AI Usage Transparency & Rate Quotas
// ==========================================

// GET /api/v1/examination/ai/quota
examinationRouter.get('/ai/quota', (c) => {
  const session = getSession(c);
  const quota = defaultAiUsageController.getQuotaStatus(session.userId);
  return c.json(quota);
});
