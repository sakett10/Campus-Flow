import type {
  Course,
  Resource,
  ResourceChunk,
  AcademicNode,
  AcademicNodeWithResources,
  AcademicNodeResourceLink,
  SearchQueryResponse,
  Opportunity,
  OpportunityRequirement,
  OpportunitySkillRequirement,
  OpportunityLocation,
  OpportunityProgramRule,
  OpportunitySource,
  OpportunityEvaluation,
  StudentCareerProfile,
  StudentCareerProfileInput,
  RoleFamily,
  Skill,
  StudentSkillEvidence,
  StudentTargetRole,
  ActionOptimizerItem,
  ApplicationRecord,
  ApplicationStatus,
  OpportunityLandscapeSummary,
  StudentSavedOpportunity,
  StudentSavedOpportunityInput,
  PredictionTransparencyRecord,
  Assessment,
  AssessmentWithTopics,
  AssessmentTopicLink,
  AssessmentTopicSource,
  TopicStudyState,
  StudyEvent,
  StudyStateValue,
  StudyEventType,
  TodayOverviewResponse,
} from '@campusflow/types';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001/api/v1';

// Default mock headers for local development
function getHeaders(): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-test-user-id': '11111111-1111-4111-a111-111111111111',
  };
}

export async function fetchCourses(): Promise<Course[]> {
  try {
    const res = await fetch(`${API_BASE}/courses`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch courses');
    return await res.json();
  } catch {
    // Deterministic fallback for initial build / disconnected preview
    return [
      {
        id: '11111111-1111-4111-a111-111111111111',
        userId: '11111111-1111-4111-a111-111111111111',
        code: 'PHY2001',
        title: 'Electromagnetic Field Theory',
        term: 'Fall 2026',
        syllabusStatus: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '22222222-2222-4222-a222-222222222222',
        userId: '11111111-1111-4111-a111-111111111111',
        code: 'CSE3001',
        title: 'Database Systems & Architecture',
        term: 'Fall 2026',
        syllabusStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }
}

export async function fetchCourse(id: string): Promise<Course | null> {
  try {
    const res = await fetch(`${API_BASE}/courses/${id}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    const all = await fetchCourses();
    return all.find((c) => c.id === id) || all[0] || null;
  }
}

export async function createCourse(data: {
  code: string;
  title: string;
  term?: string;
}): Promise<Course> {
  const res = await fetch(`${API_BASE}/courses`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create course' }));
    throw new Error(err.detail || 'Failed to create course');
  }
  return await res.json();
}

export async function fetchResources(courseId?: string): Promise<Resource[]> {
  try {
    const url = courseId ? `${API_BASE}/resources?courseId=${courseId}` : `${API_BASE}/resources`;
    const res = await fetch(url, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch resources');
    return await res.json();
  } catch {
    return [
      {
        id: '33333333-3333-4333-a333-333333333333',
        userId: '11111111-1111-4111-a111-111111111111',
        courseId: courseId || '11111111-1111-4111-a111-111111111111',
        title: 'PHY2001_Syllabus_2026.pdf',
        type: 'syllabus',
        objectKey: 'users/11111111-1111-4111-a111-111111111111/resources/syllabus.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1048576,
        contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        pageCount: 6,
        processingStatus: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }
}

export async function fetchResource(id: string): Promise<Resource | null> {
  try {
    const res = await fetch(`${API_BASE}/resources/${id}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    const all = await fetchResources();
    return all.find((r) => r.id === id) || all[0] || null;
  }
}

export async function fetchResourceChunks(resourceId: string): Promise<ResourceChunk[]> {
  try {
    const res = await fetch(`${API_BASE}/resources/${resourceId}/chunks`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [
      {
        id: 'c1',
        resourceId,
        userId: '11111111-1111-4111-a111-111111111111',
        courseId: '11111111-1111-4111-a111-111111111111',
        sequence: 0,
        content:
          'Module 1: Electrostatics in Vacuum. Coulombs Law, electric field intensity, Gauss Law and its applications. Potential and electric energy of continuous charge distributions.',
        pageStart: 1,
        pageEnd: 1,
        charCount: 198,
        tokenCount: 50,
        extractionVersion: 'v1.0',
        chunkingVersion: 'v1.0',
        createdAt: new Date(),
      },
      {
        id: 'c2',
        resourceId,
        userId: '11111111-1111-4111-a111-111111111111',
        courseId: '11111111-1111-4111-a111-111111111111',
        sequence: 1,
        content:
          'Module 2: Magnetostatics. Biot-Savart Law, Amperes Circuital Law and its differential formulation. Magnetic vector potential and magnetic boundary conditions.',
        pageStart: 2,
        pageEnd: 2,
        charCount: 165,
        tokenCount: 42,
        extractionVersion: 'v1.0',
        chunkingVersion: 'v1.0',
        createdAt: new Date(),
      },
    ];
  }
}

export async function deleteResource(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/resources/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error('Failed to delete resource');
  }
}

export async function retryResource(id: string): Promise<Resource> {
  const res = await fetch(`${API_BASE}/resources/${id}/retry`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error('Failed to retry resource processing');
  }
  return await res.json();
}

export async function fetchAcademicMap(courseId: string): Promise<AcademicNodeWithResources[]> {
  try {
    const res = await fetch(`${API_BASE}/courses/${courseId}/map`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [
      {
        id: 'n1',
        courseId,
        userId: '11111111-1111-4111-a111-111111111111',
        parentId: null,
        type: 'module',
        title: 'Module 1: Electrostatics in Vacuum',
        description: 'Coulomb law, Gauss law, electric potential',
        orderIndex: 0,
        origin: 'model',
        confidence: 0.85,
        needsReview: 'no',
        createdAt: new Date(),
        updatedAt: new Date(),
        resources: [
          {
            linkId: 'l1',
            resourceId: '33333333-3333-4333-a333-333333333333',
            resourceTitle: 'PHY2001_Syllabus_2026.pdf',
            resourceType: 'syllabus',
            pageStart: 1,
            pageEnd: 2,
            origin: 'model',
          },
        ],
      },
      {
        id: 'n2',
        courseId,
        userId: '11111111-1111-4111-a111-111111111111',
        parentId: 'n1',
        type: 'topic',
        title: 'Gauss Law and Applications',
        description: null,
        orderIndex: 0,
        origin: 'model',
        confidence: 0.8,
        needsReview: 'no',
        createdAt: new Date(),
        updatedAt: new Date(),
        resources: [
          {
            linkId: 'l2',
            resourceId: '33333333-3333-4333-a333-333333333333',
            resourceTitle: 'PHY2001_Syllabus_2026.pdf',
            resourceType: 'syllabus',
            pageStart: 2,
            pageEnd: 2,
            origin: 'model',
          },
        ],
      },
      {
        id: 'n3',
        courseId,
        userId: '11111111-1111-4111-a111-111111111111',
        parentId: null,
        type: 'module',
        title: 'Module 2: Magnetostatics',
        description: 'Biot-Savart, Ampere circuital law',
        orderIndex: 1,
        origin: 'model',
        confidence: 0.85,
        needsReview: 'no',
        createdAt: new Date(),
        updatedAt: new Date(),
        resources: [],
      },
    ];
  }
}

export async function createAcademicNodes(
  courseId: string,
  nodes: Array<{
    parentId?: string | null;
    type: 'module' | 'chapter' | 'topic';
    title: string;
    description?: string | null;
    orderIndex?: number;
    origin?: 'model' | 'user';
    confidence?: number | null;
    needsReview?: 'yes' | 'no';
  }>,
): Promise<AcademicNode[]> {
  const res = await fetch(`${API_BASE}/courses/${courseId}/map`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ nodes }),
  });
  if (!res.ok) throw new Error('Failed to create academic nodes');
  return await res.json();
}

export async function updateAcademicNode(
  courseId: string,
  nodeId: string,
  updates: {
    title?: string;
    description?: string | null;
    needsReview?: 'yes' | 'no';
    orderIndex?: number;
    parentId?: string | null;
  },
): Promise<AcademicNode> {
  const res = await fetch(`${API_BASE}/courses/${courseId}/map/nodes/${nodeId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update academic node');
  return await res.json();
}

export async function deleteAcademicNode(courseId: string, nodeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/courses/${courseId}/map/nodes/${nodeId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete academic node');
}

export async function linkResourceToTopic(
  courseId: string,
  nodeId: string,
  data: {
    resourceId: string;
    pageStart?: number | null;
    pageEnd?: number | null;
    relevanceSummary?: string | null;
  },
): Promise<AcademicNodeResourceLink> {
  const res = await fetch(`${API_BASE}/courses/${courseId}/map/nodes/${nodeId}/resources`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to link resource to topic');
  return await res.json();
}

export async function unlinkResourceFromTopic(courseId: string, linkId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/courses/${courseId}/map/links/${linkId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to unlink resource from topic');
}

export async function searchContent(
  query: string,
  courseId?: string,
): Promise<SearchQueryResponse> {
  const url = courseId
    ? `${API_BASE}/search?q=${encodeURIComponent(query)}&courseId=${courseId}`
    : `${API_BASE}/search?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    return { query, totalResults: 0, results: [] };
  }
  return await res.json();
}

// ==========================================
// Opportunity Intelligence API
// ==========================================

export async function fetchOpportunities(filters?: {
  roleFamilyId?: string;
  status?: string;
}): Promise<Opportunity[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.roleFamilyId) params.set('roleFamilyId', filters.roleFamilyId);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`${API_BASE}/opportunities${qs}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch opportunities');
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export interface OpportunityWithRelations extends Opportunity {
  requirements?: OpportunityRequirement[];
  skillRequirements?: Array<OpportunitySkillRequirement & { skill?: Skill }>;
  locations?: OpportunityLocation[];
  programRules?: OpportunityProgramRule[];
  sources?: OpportunitySource[];
}

export async function fetchOpportunityDetail(id: string): Promise<OpportunityWithRelations | null> {
  try {
    const res = await fetch(`${API_BASE}/opportunities/${id}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function evaluateOpportunity(id: string): Promise<OpportunityEvaluation | null> {
  try {
    const res = await fetch(`${API_BASE}/opportunities/${id}/evaluate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchPredictionTransparency(
  id: string,
): Promise<PredictionTransparencyRecord | null> {
  try {
    const res = await fetch(`${API_BASE}/opportunities/${id}/transparency`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchCareerProfile(): Promise<StudentCareerProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/career/profile`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveCareerProfile(
  data: StudentCareerProfileInput,
): Promise<StudentCareerProfile> {
  const res = await fetch(`${API_BASE}/career/profile`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update profile' }));
    throw new Error(err.detail || 'Failed to update profile');
  }
  return await res.json();
}

export async function fetchRoleFamilies(): Promise<RoleFamily[]> {
  try {
    const res = await fetch(`${API_BASE}/career/role-families`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchTargetRoles(): Promise<
  Array<StudentTargetRole & { roleFamily?: RoleFamily }>
> {
  try {
    const res = await fetch(`${API_BASE}/career/target-roles`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function addTargetRole(
  roleFamilyId: string,
  priority = 1,
): Promise<StudentTargetRole> {
  const res = await fetch(`${API_BASE}/career/target-roles`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ roleFamilyId, priority }),
  });
  if (!res.ok) throw new Error('Failed to add target role');
  return await res.json();
}

export async function removeTargetRole(roleFamilyId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/career/target-roles/${roleFamilyId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove target role');
}

export async function fetchSkillEvidence(): Promise<StudentSkillEvidence[]> {
  try {
    const res = await fetch(`${API_BASE}/career/evidence`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function addSkillEvidence(
  data: Omit<StudentSkillEvidence, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<StudentSkillEvidence> {
  const res = await fetch(`${API_BASE}/career/evidence`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to add skill evidence' }));
    throw new Error(err.detail || 'Failed to add skill evidence');
  }
  return await res.json();
}

export async function deleteSkillEvidence(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/career/evidence/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete skill evidence');
}

export async function fetchActionPlan(): Promise<{
  items: ActionOptimizerItem[];
  targetRolesCount: number;
  opportunitiesAnalyzed: number;
  disclaimer: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/career/action-plan`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch action plan');
    return await res.json();
  } catch {
    return {
      items: [],
      targetRolesCount: 0,
      opportunitiesAnalyzed: 0,
      disclaimer: 'Action recommendations identify highest-impact skill gaps across target roles.',
    };
  }
}

export async function fetchApplications(): Promise<
  Array<ApplicationRecord & { opportunity?: Opportunity }>
> {
  try {
    const res = await fetch(`${API_BASE}/applications`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function createApplication(
  opportunityId: string,
  notes?: string,
): Promise<ApplicationRecord> {
  const res = await fetch(`${API_BASE}/applications`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ opportunityId, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create application record' }));
    throw new Error(err.detail || 'Failed to create application record');
  }
  return await res.json();
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  notes?: string,
): Promise<ApplicationRecord> {
  const res = await fetch(`${API_BASE}/applications/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ status, notes }),
  });
  if (!res.ok) throw new Error('Failed to update application status');
  return await res.json();
}

export async function fetchOpportunityLandscape(): Promise<OpportunityLandscapeSummary> {
  try {
    const res = await fetch(`${API_BASE}/opportunities/landscape`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch opportunity landscape');
    return await res.json();
  } catch {
    return {
      totalDiscovered: 0,
      eligibleCount: 0,
      strongMatchesCount: 0,
      preparationRequiredCount: 0,
      ineligibleCount: 0,
    };
  }
}

export async function fetchStudentSavedOpportunities(): Promise<
  Array<StudentSavedOpportunity & { opportunity?: Opportunity }>
> {
  try {
    const res = await fetch(`${API_BASE}/career/saved-opportunities`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function createStudentSavedOpportunity(
  data: StudentSavedOpportunityInput,
): Promise<StudentSavedOpportunity> {
  const res = await fetch(`${API_BASE}/career/saved-opportunities`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to save opportunity' }));
    throw new Error(err.detail || 'Failed to save opportunity');
  }
  return await res.json();
}

export async function updateStudentSavedOpportunity(
  id: string,
  updates: Partial<StudentSavedOpportunityInput>,
): Promise<StudentSavedOpportunity> {
  const res = await fetch(`${API_BASE}/career/saved-opportunities/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update saved opportunity');
  return await res.json();
}

export async function deleteStudentSavedOpportunity(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/career/saved-opportunities/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete saved opportunity');
}

export async function syncAcademicEvidence(): Promise<{
  syncedCount: number;
  evidence: StudentSkillEvidence[];
}> {
  const res = await fetch(`${API_BASE}/career/evidence/sync-academic`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to sync academic evidence' }));
    throw new Error(err.detail || 'Failed to sync academic evidence');
  }
  return await res.json();
}

// ==========================================
// Assessment & Topic Linkage API
// ==========================================

export async function fetchAssessments(courseId?: string): Promise<AssessmentWithTopics[]> {
  try {
    const url = courseId
      ? `${API_BASE}/assessments?courseId=${courseId}`
      : `${API_BASE}/assessments`;
    const res = await fetch(url, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch assessments');
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchAssessment(id: string): Promise<AssessmentWithTopics | null> {
  try {
    const res = await fetch(`${API_BASE}/assessments/${id}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function createAssessment(data: {
  courseId: string;
  title: string;
  type: Assessment['type'];
  date?: string | null;
  totalMarks?: number | null;
  weightage?: string | null;
  status?: Assessment['status'];
}): Promise<Assessment> {
  const res = await fetch(`${API_BASE}/assessments`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create assessment' }));
    throw new Error(err.detail || 'Failed to create assessment');
  }
  return await res.json();
}

export async function updateAssessment(
  id: string,
  updates: {
    title?: string;
    type?: Assessment['type'];
    date?: string | null;
    totalMarks?: number | null;
    weightage?: string | null;
    status?: Assessment['status'];
  },
): Promise<Assessment> {
  const res = await fetch(`${API_BASE}/assessments/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update assessment' }));
    throw new Error(err.detail || 'Failed to update assessment');
  }
  return await res.json();
}

export async function deleteAssessment(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/assessments/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error('Failed to delete assessment');
  }
}

export async function linkTopicToAssessment(
  assessmentId: string,
  data: {
    topicId: string;
    weight?: number | null;
    source?: AssessmentTopicSource;
    notes?: string | null;
  },
): Promise<AssessmentTopicLink> {
  const res = await fetch(`${API_BASE}/assessments/${assessmentId}/topics`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to link topic' }));
    throw new Error(err.detail || 'Failed to link topic');
  }
  return await res.json();
}

export async function unlinkTopicFromAssessment(
  assessmentId: string,
  topicId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/assessments/${assessmentId}/topics/${topicId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error('Failed to unlink topic from assessment');
  }
}

// ==========================================
// Study State & Study Events API
// ==========================================

export async function fetchCourseStudyStates(courseId: string): Promise<TopicStudyState[]> {
  try {
    const res = await fetch(`${API_BASE}/courses/${courseId}/study-state`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchTopicStudyState(
  courseId: string,
  topicId: string,
): Promise<TopicStudyState | null> {
  try {
    const res = await fetch(`${API_BASE}/courses/${courseId}/topics/${topicId}/study-state`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function updateTopicStudyState(
  courseId: string,
  topicId: string,
  state: StudyStateValue,
  eventType?: StudyEventType,
  metadata?: Record<string, unknown> | null,
): Promise<{ studyState: TopicStudyState; event: StudyEvent }> {
  const res = await fetch(`${API_BASE}/courses/${courseId}/topics/${topicId}/study-state`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ state, eventType, metadata }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update study state' }));
    throw new Error(err.detail || 'Failed to update study state');
  }
  return await res.json();
}

export async function fetchTopicStudyEvents(
  courseId: string,
  topicId: string,
): Promise<StudyEvent[]> {
  try {
    const res = await fetch(`${API_BASE}/courses/${courseId}/topics/${topicId}/study-events`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function recordTopicStudyEvent(
  courseId: string,
  topicId: string,
  type: StudyEventType,
  metadata?: Record<string, unknown> | null,
): Promise<{ studyState: TopicStudyState; event: StudyEvent }> {
  const res = await fetch(`${API_BASE}/courses/${courseId}/topics/${topicId}/study-events`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ type, metadata }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to record study event' }));
    throw new Error(err.detail || 'Failed to record study event');
  }
  return await res.json();
}

export async function fetchTodayOverview(timezone?: string): Promise<TodayOverviewResponse | null> {
  try {
    const tz =
      timezone ||
      (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
    const url = `${API_BASE}/today${tz ? `?timezone=${encodeURIComponent(tz)}` : ''}`;
    const res = await fetch(url, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
