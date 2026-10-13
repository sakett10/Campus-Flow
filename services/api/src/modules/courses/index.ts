import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import {
  AppError,
  validateFileBytes,
  extractDocumentText,
  extractRawText,
  parseSyllabusDocument,
  syllabusExtractedCourseSchema,
  normalizeFileName,
  createLogger,
} from '@campusflow/shared';
import type { AcademicNode } from '@campusflow/types';
import { sharedStorage } from '../resources/index.js';
import { generateStudySchedule, recoverMissedSessions } from './study-planner.js';
import { discoverTopicResources } from './resource-discovery.js';

const logger = createLogger({ module: 'courses' });

export const coursesRouter = new Hono();

const createCourseSchema = z.object({
  code: z.string().min(1, 'Course code is required').max(50),
  title: z.string().min(1, 'Course title is required').max(255),
  term: z.string().max(50).optional().nullable(),
});

coursesRouter.get('/', async (c) => {
  const session = getSession(c);
  const courses = await defaultStore.listCourses(session.userId);
  return c.json(courses);
});

// GET /api/v1/courses/planner-overview
coursesRouter.get('/planner-overview', async (c) => {
  const session = getSession(c);
  const plans = await defaultStore.listStudyPlans(session.userId);
  const allSessions = [];
  for (const plan of plans) {
    const sessions = await defaultStore.listStudySessions(plan.id, session.userId);
    allSessions.push(...sessions);
  }
  return c.json({ plans, sessions: allSessions });
});

// POST /api/v1/courses/extract-syllabus
coursesRouter.post('/extract-syllabus', async (c) => {
  const session = getSession(c);
  const contentType = c.req.header('content-type') || '';

  // 1. Multipart PDF upload
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
    const fileName = normalizeFileName(fileObj.name || 'syllabus.pdf');
    const arrayBuffer = await fileObj.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const validated = validateFileBytes(buffer, fileName);
    if (!validated.isValid) {
      throw AppError.badRequest(validated.error || 'Invalid file format.');
    }

    const extraction = await extractDocumentText(buffer, validated.detectedMimeType);

    const warnings: string[] = [];
    if (!extraction.hasExtractableText) {
      warnings.push(
        'Scanned or image-only document detected with no selectable text. Optical Character Recognition (OCR) is required for scanned documents. Default values were provided; please review carefully.',
      );
    }

    const parsedSyllabus = parseSyllabusDocument(extraction);

    // Save uploaded syllabus to user's library as a persistent resource
    const objectKey = `users/${session.userId}/resources/${Date.now()}_${encodeURIComponent(fileName)}`;
    try {
      await sharedStorage.upload(objectKey, buffer, validated.detectedMimeType);
    } catch (storageErr) {
      logger.warn('Failed to upload syllabus to object storage, proceeding with extraction', {
        error: storageErr instanceof Error ? storageErr.message : String(storageErr),
      });
    }

    let resourceId: string | undefined;
    try {
      const resource = await defaultStore.createResource({
        userId: session.userId,
        courseId: null,
        title: parsedSyllabus.title || fileName,
        type: 'syllabus',
        objectKey,
        mimeType: validated.detectedMimeType,
        sizeBytes: validated.sizeBytes,
        contentHash: validated.contentHash,
        pageCount: extraction.pageCount,
        processingStatus: 'ready',
      });
      resourceId = resource.id;
    } catch (storeErr) {
      logger.warn('Failed to create resource entry, continuing with course extraction', {
        error: storeErr instanceof Error ? storeErr.message : String(storeErr),
      });
    }

    return c.json({
      extractedCourse: parsedSyllabus,
      resourceId,
      warnings,
    });
  }

  // 2. JSON Payload (either resourceId or raw text)
  const body = await c.req.json().catch(() => null);
  if (!body) {
    throw AppError.badRequest('Expected multipart form-data or JSON payload.');
  }

  if (body.resourceId) {
    const resource = await defaultStore.getResource(body.resourceId, session.userId);
    const storageObj = await sharedStorage.getObject(resource.objectKey);
    if (!storageObj) {
      throw AppError.notFound('Resource file not found in storage.');
    }
    const extraction = await extractDocumentText(storageObj.data, resource.mimeType);
    const parsedSyllabus = parseSyllabusDocument(extraction);
    return c.json({
      extractedCourse: parsedSyllabus,
      resourceId: resource.id,
      warnings: extraction.hasExtractableText ? [] : ['Limited text extracted from document.'],
    });
  }

  if (body.text) {
    const buffer = Buffer.from(body.text, 'utf8');
    const extraction = extractRawText(buffer, 'text/plain');
    const parsedSyllabus = parseSyllabusDocument(extraction);
    return c.json({
      extractedCourse: parsedSyllabus,
      warnings: [],
    });
  }

  throw AppError.badRequest('Either file upload, resourceId, or text is required.');
});

// POST /api/v1/courses/create-from-syllabus
coursesRouter.post('/create-from-syllabus', async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);

  const payloadSchema = z.object({
    course: syllabusExtractedCourseSchema,
    resourceId: z.string().uuid().optional().nullable(),
    term: z.string().optional().nullable(),
  });

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid course structure payload', parsed.error.format());
  }

  const { course: courseData, resourceId, term } = parsed.data;

  // Duplicate course prevention
  const existingCourses = await defaultStore.listCourses(session.userId);
  const duplicate = existingCourses.find(
    (existing) =>
      existing.code.toLowerCase().trim() === courseData.code.toLowerCase().trim() &&
      existing.term === (term || courseData.term || 'Fall 2026'),
  );

  if (duplicate) {
    throw new AppError(
      'CONFLICT',
      `Course with code "${courseData.code}" already exists for ${term || courseData.term || 'Fall 2026'}.`,
      409,
    );
  }

  // 1. Create Course Record
  const course = await defaultStore.createCourse({
    userId: session.userId,
    code: courseData.code,
    title: courseData.title,
    term: term || courseData.term || 'Fall 2026',
  });

  // 2. Link Resource if provided
  if (resourceId) {
    try {
      await defaultStore.updateResource(resourceId, session.userId, { courseId: course.id });
    } catch {
      // Ignore if resource cannot be updated
    }
  }

  // 3. Create Modules & Topics hierarchy
  let totalModules = 0;
  let totalTopics = 0;
  let firstTopicId: string | null = null;

  for (const mod of courseData.modules) {
    const modRows = await defaultStore.createAcademicNodes([
      {
        courseId: course.id,
        userId: session.userId,
        parentId: null,
        type: 'module',
        title: mod.title,
        description: mod.description || null,
        orderIndex: mod.orderIndex,
        origin: 'user',
        confidence: 1.0,
        needsReview: 'no',
        learningObjectives: mod.learningObjectives,
        estimatedMinutes: (mod.teachingHours || 0) * 60,
      },
    ]);
    const moduleNode = modRows[0];
    if (!moduleNode) continue;
    totalModules++;

    for (const topic of mod.topics) {
      const topicRows = await defaultStore.createAcademicNodes([
        {
          courseId: course.id,
          userId: session.userId,
          parentId: moduleNode.id,
          type: 'topic',
          title: topic.title,
          description:
            topic.description || (topic.subtopics?.length ? topic.subtopics.join(', ') : null),
          orderIndex: topic.orderIndex,
          origin: 'user',
          confidence: 1.0,
          needsReview: 'no',
          estimatedMinutes: topic.estimatedMinutes || 60,
          prerequisites: topic.prerequisites || [],
          notes: topic.pageReferences ? `Source: ${topic.pageReferences}` : null,
        },
      ]);
      const topicNode = topicRows[0];
      if (!topicNode) continue;
      totalTopics++;
      if (!firstTopicId) firstTopicId = topicNode.id;

      // Link page references to resource if available
      if (resourceId && topic.pageReferences) {
        const pageMatch = /(\d+)(?:[–-](\d+))?/.exec(topic.pageReferences);
        const pageStart = pageMatch && pageMatch[1] ? parseInt(pageMatch[1], 10) : null;
        const pageEnd = pageMatch && pageMatch[2] ? parseInt(pageMatch[2], 10) : pageStart;

        try {
          await defaultStore.linkResourceToAcademicNode({
            nodeId: topicNode.id,
            resourceId,
            userId: session.userId,
            courseId: course.id,
            pageStart,
            pageEnd,
            relevanceSummary: topic.pageReferences,
            origin: 'user',
          });
        } catch {
          // Non-fatal if link fails
        }
      }
    }
  }

  // 4. Save Prescribed Textbooks into Topic Resources
  if (firstTopicId && courseData.prescribedTextbooks?.length) {
    for (const book of courseData.prescribedTextbooks) {
      try {
        await defaultStore.createTopicResource({
          topicId: firstTopicId,
          courseId: course.id,
          userId: session.userId,
          title: book.title,
          provider: book.author || 'Prescribed Syllabus',
          url: null,
          type: 'textbook',
          verificationStatus: 'syllabus_extracted',
          relevanceNote: book.edition
            ? `Edition: ${book.edition}${book.isPrimary ? ' (Primary)' : ''}`
            : book.isPrimary
              ? 'Primary textbook'
              : 'Reference book',
        });
      } catch {
        // Non-fatal
      }
    }
  }

  // 5. Create Assessments
  let totalAssessments = 0;
  if (courseData.assessments?.length) {
    for (const a of courseData.assessments) {
      try {
        await defaultStore.createAssessment({
          userId: session.userId,
          courseId: course.id,
          title: a.title,
          type: a.type,
          date: a.date ? new Date(a.date) : null,
          totalMarks: a.totalMarks ?? 50,
          weightage: a.weightage ?? null,
          status: 'upcoming',
        });
        totalAssessments++;
      } catch {
        // Non-fatal
      }
    }
  }

  return c.json(
    {
      success: true,
      course,
      moduleCount: totalModules,
      topicCount: totalTopics,
      assessmentCount: totalAssessments,
    },
    201,
  );
});

coursesRouter.get('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  try {
    const course = await defaultStore.getCourse(id, session.userId);
    return c.json(course);
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    if (err instanceof Error && err.message.toLowerCase().includes('not found')) {
      throw AppError.notFound('Course not found.');
    }
    throw err;
  }
});

coursesRouter.post('/', async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);

  const parsed = createCourseSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid course payload', parsed.error.format());
  }

  const course = await defaultStore.createCourse({
    userId: session.userId,
    code: parsed.data.code,
    title: parsed.data.title,
    term: parsed.data.term,
  });

  return c.json(course, 201);
});

coursesRouter.delete('/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.deleteCourse(id, session.userId);
  return c.json({ success: true, message: 'Course deleted.' });
});

// Academic Map Endpoints
// GET /api/v1/courses/:id/map
coursesRouter.get('/:id/map', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.getCourse(id, session.userId);
  const nodes = await defaultStore.listAcademicNodesWithResources(id, session.userId);
  return c.json(nodes);
});

// POST /api/v1/courses/:id/map (Bulk create or append nodes)
coursesRouter.post('/:id/map', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.getCourse(id, session.userId);

  const body = await c.req.json().catch(() => null);
  const nodeSchema = z.object({
    parentId: z.string().uuid().optional().nullable(),
    type: z.enum(['module', 'chapter', 'topic']),
    title: z.string().min(1).max(255),
    description: z.string().optional().nullable(),
    orderIndex: z.number().int().default(0),
    origin: z.enum(['model', 'user']).default('user'),
    confidence: z.number().min(0).max(1).optional().nullable(),
    needsReview: z.enum(['yes', 'no']).default('no'),
  });

  const schema = z.object({
    nodes: z.array(nodeSchema),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid nodes payload', parsed.error.format());
  }

  const nodesToInsert = parsed.data.nodes.map((n) => ({
    courseId: id,
    userId: session.userId,
    parentId: n.parentId || null,
    type: n.type,
    title: n.title,
    description: n.description || null,
    orderIndex: n.orderIndex,
    origin: n.origin,
    confidence: n.confidence ?? 1.0,
    needsReview: n.needsReview,
  }));

  const created = await defaultStore.createAcademicNodes(nodesToInsert);
  return c.json(created, 201);
});

// PUT /api/v1/courses/:id/map/nodes/:nodeId (User edit overrides inference)
coursesRouter.put('/:id/map/nodes/:nodeId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const nodeId = c.req.param('nodeId');
  await defaultStore.getCourse(id, session.userId);

  const node = await defaultStore.getAcademicNode(nodeId, session.userId);
  if (node.courseId !== id) {
    throw AppError.notFound('Academic node does not belong to this course.');
  }

  const body = await c.req.json().catch(() => null);
  const editSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional().nullable(),
    needsReview: z.enum(['yes', 'no']).optional(),
    orderIndex: z.number().int().optional(),
    parentId: z.string().uuid().optional().nullable(),
  });

  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid edit node payload', parsed.error.format());
  }

  if (parsed.data.parentId !== undefined && parsed.data.parentId !== null) {
    if (parsed.data.parentId === nodeId) {
      throw AppError.badRequest('An academic node cannot be its own parent.');
    }
    const parent = await defaultStore.getAcademicNode(parsed.data.parentId, session.userId);
    if (parent.courseId !== id) {
      throw AppError.badRequest('Parent node does not belong to this course.');
    }
  }

  const updates: Partial<AcademicNode> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.needsReview !== undefined) updates.needsReview = parsed.data.needsReview;
  if (parsed.data.orderIndex !== undefined) updates.orderIndex = parsed.data.orderIndex;
  if (parsed.data.parentId !== undefined) updates.parentId = parsed.data.parentId;

  const updated = await defaultStore.updateAcademicNode(nodeId, session.userId, updates);
  return c.json(updated);
});

// DELETE /api/v1/courses/:id/map/nodes/:nodeId
coursesRouter.delete('/:id/map/nodes/:nodeId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const nodeId = c.req.param('nodeId');
  await defaultStore.getCourse(id, session.userId);

  const node = await defaultStore.getAcademicNode(nodeId, session.userId);
  if (node.courseId !== id) {
    throw AppError.notFound('Academic node does not belong to this course.');
  }

  await defaultStore.deleteAcademicNode(nodeId, session.userId);
  return c.json({ success: true });
});

// POST /api/v1/courses/:id/map/nodes/:nodeId/resources (Link resource to topic)
coursesRouter.post('/:id/map/nodes/:nodeId/resources', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const nodeId = c.req.param('nodeId');
  await defaultStore.getCourse(id, session.userId);

  const node = await defaultStore.getAcademicNode(nodeId, session.userId);
  if (node.courseId !== id) {
    throw AppError.notFound('Academic node does not belong to this course.');
  }

  const body = await c.req.json().catch(() => null);
  const linkSchema = z.object({
    resourceId: z.string().uuid(),
    pageStart: z.number().int().optional().nullable(),
    pageEnd: z.number().int().optional().nullable(),
    relevanceSummary: z.string().optional().nullable(),
  });

  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid link payload', parsed.error.format());
  }

  // Ensure resource exists and belongs to user
  await defaultStore.getResource(parsed.data.resourceId, session.userId);

  const link = await defaultStore.linkResourceToAcademicNode({
    nodeId,
    resourceId: parsed.data.resourceId,
    userId: session.userId,
    courseId: id,
    pageStart: parsed.data.pageStart ?? null,
    pageEnd: parsed.data.pageEnd ?? null,
    relevanceSummary: parsed.data.relevanceSummary ?? null,
    origin: 'user',
  });

  return c.json(link, 201);
});

// DELETE /api/v1/courses/:id/map/links/:linkId (Unlink resource from topic)
coursesRouter.delete('/:id/map/links/:linkId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const linkId = c.req.param('linkId');
  await defaultStore.getCourse(id, session.userId);
  await defaultStore.deleteResourceLink(linkId, session.userId);
  return c.json({ success: true });
});

// Assessment endpoints scoped to course
const assessmentTypeEnum = z.enum(['CAT', 'FAT', 'Quiz', 'Assignment', 'Lab', 'Project', 'Other']);
const assessmentStatusEnum = z.enum(['upcoming', 'completed', 'cancelled']);
const topicSourceEnum = z.enum(['user', 'syllabus', 'question_paper', 'inferred']);

const createCourseAssessmentSchema = z.object({
  title: z.string().min(1, 'Assessment title is required').max(255),
  type: assessmentTypeEnum,
  date: z.string().datetime().optional().nullable(),
  totalMarks: z.number().min(0).optional().nullable(),
  weightage: z.string().max(50).optional().nullable(),
  status: assessmentStatusEnum.optional().nullable(),
});

const updateCourseAssessmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  type: assessmentTypeEnum.optional(),
  date: z.string().datetime().optional().nullable(),
  totalMarks: z.number().min(0).optional().nullable(),
  weightage: z.string().max(50).optional().nullable(),
  status: assessmentStatusEnum.optional(),
});

const linkCourseAssessmentTopicSchema = z.object({
  topicId: z.string().uuid('topicId must be a valid UUID'),
  weight: z.number().min(0).optional().nullable(),
  source: topicSourceEnum.default('user'),
  notes: z.string().max(1000).optional().nullable(),
});

// GET /api/v1/courses/:id/assessments
coursesRouter.get('/:id/assessments', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.getCourse(id, session.userId);
  const assessments = await defaultStore.listAssessments(session.userId, id);
  return c.json(assessments);
});

// POST /api/v1/courses/:id/assessments
coursesRouter.post('/:id/assessments', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.getCourse(id, session.userId);

  const body = await c.req.json().catch(() => null);
  const parsed = createCourseAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid assessment payload', parsed.error.format());
  }

  const assessment = await defaultStore.createAssessment({
    userId: session.userId,
    courseId: id,
    title: parsed.data.title,
    type: parsed.data.type,
    date: parsed.data.date ? new Date(parsed.data.date) : null,
    totalMarks: parsed.data.totalMarks ?? null,
    weightage: parsed.data.weightage ?? null,
    status: parsed.data.status ?? 'upcoming',
  });

  return c.json(assessment, 201);
});

// GET /api/v1/courses/:id/assessments/:assessmentId
coursesRouter.get('/:id/assessments/:assessmentId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessmentId = c.req.param('assessmentId');
  await defaultStore.getCourse(id, session.userId);

  const assessment = await defaultStore.getAssessment(assessmentId, session.userId);
  if (assessment.courseId !== id) {
    throw AppError.notFound('Assessment does not belong to this course.');
  }

  return c.json(assessment);
});

// PUT /api/v1/courses/:id/assessments/:assessmentId
coursesRouter.put('/:id/assessments/:assessmentId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessmentId = c.req.param('assessmentId');
  await defaultStore.getCourse(id, session.userId);

  const existing = await defaultStore.getAssessment(assessmentId, session.userId);
  if (existing.courseId !== id) {
    throw AppError.notFound('Assessment does not belong to this course.');
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateCourseAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid update assessment payload', parsed.error.format());
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates['title'] = parsed.data.title;
  if (parsed.data.type !== undefined) updates['type'] = parsed.data.type;
  if (parsed.data.date !== undefined)
    updates['date'] = parsed.data.date ? new Date(parsed.data.date) : null;
  if (parsed.data.totalMarks !== undefined) updates['totalMarks'] = parsed.data.totalMarks;
  if (parsed.data.weightage !== undefined) updates['weightage'] = parsed.data.weightage;
  if (parsed.data.status !== undefined) updates['status'] = parsed.data.status;

  const updated = await defaultStore.updateAssessment(assessmentId, session.userId, updates);
  return c.json(updated);
});

// DELETE /api/v1/courses/:id/assessments/:assessmentId
coursesRouter.delete('/:id/assessments/:assessmentId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessmentId = c.req.param('assessmentId');
  await defaultStore.getCourse(id, session.userId);

  const existing = await defaultStore.getAssessment(assessmentId, session.userId);
  if (existing.courseId !== id) {
    throw AppError.notFound('Assessment does not belong to this course.');
  }

  await defaultStore.deleteAssessment(assessmentId, session.userId);
  return c.json({ success: true, message: 'Assessment deleted.' });
});

// POST /api/v1/courses/:id/assessments/:assessmentId/topics
coursesRouter.post('/:id/assessments/:assessmentId/topics', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessmentId = c.req.param('assessmentId');
  await defaultStore.getCourse(id, session.userId);

  const assessment = await defaultStore.getAssessment(assessmentId, session.userId);
  if (assessment.courseId !== id) {
    throw AppError.notFound('Assessment does not belong to this course.');
  }

  const body = await c.req.json().catch(() => null);
  const parsed = linkCourseAssessmentTopicSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid link topic payload', parsed.error.format());
  }

  const topicNode = await defaultStore.getAcademicNode(parsed.data.topicId, session.userId);
  if (topicNode.courseId !== id) {
    throw AppError.badRequest('Topic does not belong to the assessment course.');
  }

  const link = await defaultStore.linkTopicToAssessment({
    assessmentId,
    topicId: parsed.data.topicId,
    userId: session.userId,
    courseId: id,
    weight: parsed.data.weight ?? null,
    source: parsed.data.source,
    notes: parsed.data.notes ?? null,
  });

  return c.json(link, 201);
});

// DELETE /api/v1/courses/:id/assessments/:assessmentId/topics/:topicId
coursesRouter.delete('/:id/assessments/:assessmentId/topics/:topicId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const assessmentId = c.req.param('assessmentId');
  const topicId = c.req.param('topicId');
  await defaultStore.getCourse(id, session.userId);

  const assessment = await defaultStore.getAssessment(assessmentId, session.userId);
  if (assessment.courseId !== id) {
    throw AppError.notFound('Assessment does not belong to this course.');
  }

  await defaultStore.unlinkTopicFromAssessment(assessmentId, topicId, session.userId);
  return c.json({ success: true, message: 'Topic unlinked from assessment.' });
});

// ==========================================
// Study State & Study Events Endpoints
// ==========================================

const updateStudyStateSchema = z.object({
  state: z.enum(['not_started', 'learning', 'needs_review', 'reviewed']),
  eventType: z
    .enum(['study_started', 'study_completed', 'reviewed', 'marked_needs_review', 'state_changed'])
    .optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const createStudyEventSchema = z.object({
  type: z.enum([
    'study_started',
    'study_completed',
    'reviewed',
    'marked_needs_review',
    'state_changed',
  ]),
  metadata: z.record(z.unknown()).optional().nullable(),
});

// GET /api/v1/courses/:id/study-state
coursesRouter.get('/:id/study-state', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const states = await defaultStore.listCourseStudyStates(id, session.userId);
  return c.json(states);
});

// GET /api/v1/courses/:id/topics/:topicId/study-state
coursesRouter.get('/:id/topics/:topicId/study-state', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  const state = await defaultStore.getTopicStudyState(id, topicId, session.userId);
  return c.json(state);
});

// PUT /api/v1/courses/:id/topics/:topicId/study-state
coursesRouter.put('/:id/topics/:topicId/study-state', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  const body = await c.req.json().catch(() => null);

  const parsed = updateStudyStateSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid study state payload', parsed.error.format());
  }

  const result = await defaultStore.setTopicStudyState(
    id,
    topicId,
    session.userId,
    parsed.data.state,
    parsed.data.eventType,
    parsed.data.metadata,
  );

  return c.json(result);
});

// GET /api/v1/courses/:id/topics/:topicId/study-events
coursesRouter.get('/:id/topics/:topicId/study-events', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  const events = await defaultStore.listStudyEvents(id, topicId, session.userId);
  return c.json(events);
});

// POST /api/v1/courses/:id/topics/:topicId/study-events
coursesRouter.post('/:id/topics/:topicId/study-events', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  const body = await c.req.json().catch(() => null);

  const parsed = createStudyEventSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid study event payload', parsed.error.format());
  }

  const result = await defaultStore.recordStudyEvent(
    id,
    topicId,
    session.userId,
    parsed.data.type,
    parsed.data.metadata,
  );

  return c.json(result, 201);
});

// ==========================================
// Topic Resources Endpoints
// ==========================================

const topicResourceSchema = z.object({
  title: z.string().min(1).max(255),
  provider: z.string().max(100).optional().nullable(),
  url: z.string().url().optional().nullable(),
  type: z.enum(['textbook', 'lecture', 'article', 'video', 'practice']).default('textbook'),
  verificationStatus: z
    .enum(['syllabus_extracted', 'verified_external', 'recommended_unverified', 'student_uploaded'])
    .default('recommended_unverified'),
  relevanceNote: z.string().max(1000).optional().nullable(),
});

// GET /api/v1/courses/:id/topics/:topicId/resources
coursesRouter.get('/:id/topics/:topicId/resources', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  await defaultStore.getCourse(id, session.userId);

  const resources = await defaultStore.listTopicResources(topicId, session.userId);
  return c.json(resources);
});

// POST /api/v1/courses/:id/topics/:topicId/resources
coursesRouter.post('/:id/topics/:topicId/resources', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  await defaultStore.getCourse(id, session.userId);

  const body = await c.req.json().catch(() => null);
  const parsed = topicResourceSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid topic resource payload', parsed.error.format());
  }

  const created = await defaultStore.createTopicResource({
    topicId,
    courseId: id,
    userId: session.userId,
    title: parsed.data.title,
    provider: parsed.data.provider ?? null,
    url: parsed.data.url ?? null,
    type: parsed.data.type,
    verificationStatus: parsed.data.verificationStatus,
    relevanceNote: parsed.data.relevanceNote ?? null,
  });

  return c.json(created, 201);
});

// DELETE /api/v1/courses/:id/topics/:topicId/resources/:resourceId
coursesRouter.delete('/:id/topics/:topicId/resources/:resourceId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  const resourceId = c.req.param('resourceId');
  await defaultStore.getCourse(id, session.userId);

  const resItem = await defaultStore.getTopicResource(resourceId, session.userId);
  if (resItem.courseId !== id || resItem.topicId !== topicId) {
    throw AppError.notFound('Topic resource does not belong to this topic/course.');
  }

  await defaultStore.deleteTopicResource(resourceId, session.userId);
  return c.json({ success: true, message: 'Resource removed.' });
});

// GET /api/v1/courses/:id/topics/:topicId/resources/discover
coursesRouter.get('/:id/topics/:topicId/resources/discover', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const topicId = c.req.param('topicId');
  await defaultStore.getCourse(id, session.userId);

  // Fetch topic node
  const nodes = await defaultStore.listAcademicNodes(id, session.userId);
  const topic = nodes.find((n) => n.id === topicId);
  if (!topic) {
    throw AppError.notFound('Topic node not found.');
  }

  const discovered = await discoverTopicResources(defaultStore, topic, session.userId, id);
  return c.json(discovered);
});

// ==========================================
// Personalized Study Planner Endpoints
// ==========================================

const generatePlanSchema = z.object({
  targetExamDate: z.string().datetime(),
  availableHoursPerWeek: z.number().min(1).max(80).default(10),
  dailyTargetMinutes: z.number().int().min(15).max(360).default(60),
  preferredDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5, 6]),
});

const updateSessionSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'missed', 'rescheduled']).optional(),
  scheduledDate: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(10).max(480).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

// GET /api/v1/courses/:id/plan
coursesRouter.get('/:id/plan', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.getCourse(id, session.userId);

  const plans = await defaultStore.listStudyPlans(session.userId, id);
  const activePlan = plans.find((p) => p.status === 'active') || plans[0] || null;

  if (!activePlan) {
    return c.json({ plan: null, sessions: [] });
  }

  const sessions = await defaultStore.listStudySessions(activePlan.id, session.userId);
  return c.json({ plan: activePlan, sessions });
});

// POST /api/v1/courses/:id/plan/generate
coursesRouter.post('/:id/plan/generate', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const course = await defaultStore.getCourse(id, session.userId);

  const body = await c.req.json().catch(() => null);
  const parsed = generatePlanSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid study plan generation parameters', parsed.error.format());
  }

  const nodes = await defaultStore.listAcademicNodes(id, session.userId);
  const topics = nodes.filter((n) => n.type === 'topic');

  if (topics.length === 0) {
    throw AppError.badRequest('Course has no topics to plan study sessions for.');
  }

  // Deactivate any existing active plans for this course
  const existingPlans = await defaultStore.listStudyPlans(session.userId, id);
  for (const p of existingPlans) {
    if (p.status === 'active') {
      await defaultStore.updateStudyPlan(p.id, session.userId, { status: 'archived' });
    }
  }

  // Create new active Study Plan
  const plan = await defaultStore.createStudyPlan({
    userId: session.userId,
    courseId: id,
    title: `${course.code} Exam Master Plan`,
    targetExamDate: new Date(parsed.data.targetExamDate),
    availableHoursPerWeek: parsed.data.availableHoursPerWeek,
    dailyTargetMinutes: parsed.data.dailyTargetMinutes,
    status: 'active',
  });

  // Generate scheduled sessions & workload analysis
  const { sessions: generatedSessions, workloadWarning } = generateStudySchedule({
    courseId: id,
    userId: session.userId,
    planId: plan.id,
    courseTitle: course.title,
    targetExamDate: new Date(parsed.data.targetExamDate),
    availableHoursPerWeek: parsed.data.availableHoursPerWeek,
    dailyTargetMinutes: parsed.data.dailyTargetMinutes,
    preferredDays: parsed.data.preferredDays,
    topics,
  });

  const createdSessions = await defaultStore.createStudySessions(generatedSessions);

  return c.json(
    {
      plan,
      sessions: createdSessions,
      workloadWarning,
    },
    201,
  );
});

// PUT /api/v1/courses/:id/plan/sessions/:sessionId
coursesRouter.put('/:id/plan/sessions/:sessionId', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const sessionId = c.req.param('sessionId');
  await defaultStore.getCourse(id, session.userId);

  const existingSession = await defaultStore.getStudySession(sessionId, session.userId);
  if (existingSession.courseId !== id) {
    throw AppError.notFound('Study session does not belong to this course.');
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateSessionSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest('Invalid session update payload', parsed.error.format());
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) {
    updates['status'] = parsed.data.status;
    if (parsed.data.status === 'completed') {
      updates['completedAt'] = new Date();
    }
  }
  if (parsed.data.scheduledDate !== undefined) {
    updates['scheduledDate'] = new Date(parsed.data.scheduledDate);
  }
  if (parsed.data.durationMinutes !== undefined) {
    updates['durationMinutes'] = parsed.data.durationMinutes;
  }
  if (parsed.data.notes !== undefined) {
    updates['notes'] = parsed.data.notes;
  }

  const updated = await defaultStore.updateStudySession(sessionId, session.userId, updates);
  return c.json(updated);
});

// POST /api/v1/courses/:id/plan/recover
coursesRouter.post('/:id/plan/recover', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.getCourse(id, session.userId);

  const plans = await defaultStore.listStudyPlans(session.userId, id);
  const activePlan = plans.find((p) => p.status === 'active');
  if (!activePlan || !activePlan.targetExamDate) {
    throw AppError.badRequest('No active plan with an exam date found for recovery.');
  }

  const sessions = await defaultStore.listStudySessions(activePlan.id, session.userId);
  const recovered = recoverMissedSessions(
    sessions,
    activePlan.targetExamDate,
    activePlan.dailyTargetMinutes ?? 60,
  );

  // Update modified sessions
  let recoveredCount = 0;
  for (const s of recovered) {
    const original = sessions.find((orig) => orig.id === s.id);
    if (
      original &&
      new Date(original.scheduledDate).getTime() !== new Date(s.scheduledDate).getTime()
    ) {
      await defaultStore.updateStudySession(s.id, session.userId, {
        scheduledDate: s.scheduledDate,
        notes: s.notes,
      });
      recoveredCount++;
    }
  }

  const freshSessions = await defaultStore.listStudySessions(activePlan.id, session.userId);
  return c.json({
    success: true,
    recoveredCount,
    sessions: freshSessions,
  });
});
