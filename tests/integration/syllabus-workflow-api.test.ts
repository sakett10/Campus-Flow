import { describe, it, expect, beforeEach } from 'vitest';
import { createApiApp } from '../../services/api/src/app.js';
import { defaultStore } from '../../services/api/src/data/store.js';
import type {
  Course,
  AcademicNode,
  TopicResource,
  StudyPlan,
  StudySession,
  SyllabusExtractedCourse,
} from '@campusflow/types';

describe('Syllabus-to-Course Workflow & Planner Integration API', () => {
  const testUserId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const app = createApiApp();

  beforeEach(() => {
    defaultStore.clear();
    process.env['AUTH_TEST_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'test';
  });

  it('completes the full syllabus upload, course generation, resource discovery, and planner loop', async () => {
    // 1. Extract syllabus from text
    const syllabusText = `
Course Code: CSE4001
Course Title: Distributed Systems
Semester: Fall 2026

Prerequisites: Operating Systems, Computer Networks

Module 1: Distributed Architectures (6 Hours)
- Introduction to Distributed Systems
- Communication: RPC and Message-Oriented Middleware
- Direct and Indirect Communication Patterns

Module 2: Synchronization and Coordination (8 Hours)
- Logical Clocks and Lamport Timestamps
- Distributed Mutual Exclusion Algorithms
- Election Algorithms

Text Books:
1. Maarten van Steen, Andrew S. Tanenbaum, "Distributed Systems", 4th Edition, Pearson

Assessment Scheme:
CAT-1: 25% weightage, Total Marks: 50
FAT: 50% weightage, Total Marks: 100
`;

    const extractRes = await app.request('/api/v1/courses/extract-syllabus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({ text: syllabusText }),
    });

    expect(extractRes.status).toBe(200);
    const extractJson = (await extractRes.json()) as { extractedCourse: SyllabusExtractedCourse };
    expect(extractJson.extractedCourse).toBeDefined();
    expect(extractJson.extractedCourse.code).toBe('CSE4001');
    expect(extractJson.extractedCourse.modules.length).toBe(2);
    expect(extractJson.extractedCourse.modules[0].topics.length).toBe(3);

    // 2. Student reviews and confirms course creation
    const createRes = await app.request('/api/v1/courses/create-from-syllabus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({
        course: extractJson.extractedCourse,
        term: 'Fall 2026',
      }),
    });

    expect(createRes.status).toBe(201);
    const createJson = (await createRes.json()) as { success: boolean; course: Course };
    expect(createJson.success).toBe(true);
    expect(createJson.course.code).toBe('CSE4001');
    const courseId = createJson.course.id;

    // 3. Inspect generated academic map
    const mapRes = await app.request(`/api/v1/courses/${courseId}/map`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
    });
    expect(mapRes.status).toBe(200);
    const nodes = (await mapRes.json()) as AcademicNode[];
    expect(nodes.length).toBeGreaterThanOrEqual(8); // 2 modules + 6 topics

    const topicNodes = nodes.filter((n) => n.type === 'topic');
    expect(topicNodes.length).toBe(6);
    const firstTopic = topicNodes[0]!;

    // 4. Discover learning resources for first topic
    const discoverRes = await app.request(
      `/api/v1/courses/${courseId}/topics/${firstTopic.id}/resources/discover`,
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
          'x-test-user-id': testUserId,
        },
      },
    );
    expect(discoverRes.status).toBe(200);
    const discovered = (await discoverRes.json()) as TopicResource[];
    expect(discovered.length).toBeGreaterThanOrEqual(1);
    // Verified or recommended status present
    expect(
      discovered.some(
        (d) =>
          d.verificationStatus === 'syllabus_extracted' ||
          d.verificationStatus === 'verified_external' ||
          d.verificationStatus === 'recommended_unverified',
      ),
    ).toBe(true);

    // 5. Generate personalized study plan
    const examDate = new Date();
    examDate.setDate(examDate.getDate() + 21); // 3 weeks out

    const planRes = await app.request(`/api/v1/courses/${courseId}/plan/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify({
        targetExamDate: examDate.toISOString(),
        availableHoursPerWeek: 10,
        dailyTargetMinutes: 60,
        preferredDays: [1, 2, 3, 4, 5, 6],
      }),
    });

    expect(planRes.status).toBe(201);
    const planJson = (await planRes.json()) as { plan: StudyPlan; sessions: StudySession[] };
    expect(planJson.plan).toBeDefined();
    expect(planJson.sessions.length).toBeGreaterThanOrEqual(6);

    // 6. Complete a session
    const firstSession = planJson.sessions[0]!;
    const updateSessRes = await app.request(
      `/api/v1/courses/${courseId}/plan/sessions/${firstSession.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
          'x-test-user-id': testUserId,
        },
        body: JSON.stringify({
          status: 'completed',
          notes: 'Finished reading core chapter and solved RPC practice problems',
        }),
      },
    );
    expect(updateSessRes.status).toBe(200);
    const updatedSess = (await updateSessRes.json()) as StudySession;
    expect(updatedSess.status).toBe('completed');
    expect(updatedSess.completedAt).toBeDefined();

    // 7. Verify multi-tenant authorization (another user cannot access this course or plan)
    const unauthorizedRes = await app.request(`/api/v1/courses/${courseId}`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'x-test-user-id': otherUserId,
      },
    });
    expect(unauthorizedRes.status).toBe(403);
  });

  it('uploads a real multipart PDF syllabus file and extracts course structure correctly', async () => {
    // Generate valid deterministic PDF
    const textLines = [
      'Course Code: CSE3002',
      'Course Title: Database Systems',
      'Semester: Fall 2026',
      'Module 1: Relational Data Models (6 Hours)',
      '- ER Modeling and Schema Design',
    ];
    const textCommands = textLines
      .map((l, i) => `${i === 0 ? '' : '0 -20 Td\n'}(${l.replace(/[()\\]/g, '\\$&')}) Tj`)
      .join('\n');
    const contentStream = `BT\n/F1 12 Tf\n50 750 Td\n${textCommands}\nET`;
    const streamLen = Buffer.byteLength(contentStream, 'utf-8');

    const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLen} >>
stream
${contentStream}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
${[
  '0000000000 65535 f ',
  '0000000009 00000 n ',
  '0000000058 00000 n ',
  '0000000115 00000 n ',
  '0000000244 00000 n ',
  '0000000300 00000 n ',
].join('\n')}
trailer
<< /Size 6 /Root 1 0 R >>
startxref
380
%%EOF`;

    const fileBytes = Buffer.from(pdfString, 'utf-8');
    const blob = new Blob([fileBytes], { type: 'application/pdf' });
    const file = new File([blob], 'CSE3002_Syllabus.pdf', { type: 'application/pdf' });

    const formData = new FormData();
    formData.append('file', file);

    const res = await app.request('/api/v1/courses/extract-syllabus', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: formData,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      extractedCourse: SyllabusExtractedCourse;
      resourceId?: string;
      warnings: string[];
    };

    expect(body.extractedCourse).toBeDefined();
    expect(body.extractedCourse.code).toBe('CSE3002');
    expect(body.extractedCourse.title).toContain('Database Systems');
    expect(body.extractedCourse.sourcePageCount).toBe(1);
    expect(body.warnings).toEqual([]);
  });

  it('rejects malformed or corrupted PDF uploads with clear bad request status', async () => {
    const corruptBytes = Buffer.from('%PDF-1.4\ncorrupted-random-bytes\n%%EOF', 'utf-8');
    const blob = new Blob([corruptBytes], { type: 'application/pdf' });
    const file = new File([blob], 'corrupt.pdf', { type: 'application/pdf' });

    const formData = new FormData();
    formData.append('file', file);

    const res = await app.request('/api/v1/courses/extract-syllabus', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'x-test-user-id': testUserId,
      },
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; detail: string };
    expect(body.detail).toContain('Invalid or corrupt PDF document structure');
  });

  it('rejects course creation when session token is missing or unauthorized', async () => {
    // Disable bypass for this strict test
    process.env['AUTH_TEST_BYPASS'] = 'false';

    const res = await app.request('/api/v1/courses/create-from-syllabus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        course: {
          code: 'CSE9999',
          title: 'Unauthenticated Course',
          term: 'Fall 2026',
          modules: [],
        },
      }),
    });

    expect(res.status).toBe(401);
    const errBody = (await res.json()) as { detail?: string; message?: string };
    expect(errBody.detail || errBody.message).toContain('Authentication token required');
  });

  it('successfully creates course with valid test bearer token and enforces multi-tenant boundary', async () => {
    process.env['AUTH_TEST_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'test';

    const studentAId = 'student_alpha';
    const studentBId = 'student_beta';

    // 1. Student A creates a course using bearer token
    const createResA = await app.request('/api/v1/courses/create-from-syllabus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test_user_${studentAId}`,
      },
      body: JSON.stringify({
        course: {
          code: 'PHY3005',
          title: 'Quantum Mechanics',
          term: 'Fall 2026',
          confidence: 0.95,
          modules: [
            {
              title: 'Module 1: Wave Mechanics',
              orderIndex: 0,
              topics: [
                {
                  title: 'Schrodinger Equation',
                  orderIndex: 0,
                },
              ],
            },
          ],
        },
      }),
    });

    expect(createResA.status).toBe(201);
    const bodyA = (await createResA.json()) as { success: boolean; course: Course };
    expect(bodyA.success).toBe(true);
    expect(bodyA.course.code).toBe('PHY3005');
    const courseId = bodyA.course.id;

    // 2. Student A can access their course
    const accessResA = await app.request(`/api/v1/courses/${courseId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer test_user_${studentAId}`,
      },
    });
    expect(accessResA.status).toBe(200);

    // 3. Student B is forbidden from accessing Student A's course
    const accessResB = await app.request(`/api/v1/courses/${courseId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer test_user_${studentBId}`,
      },
    });
    expect(accessResB.status).toBe(403);
  });
});
