import {
  type Course,
  type Assessment,
  type AssessmentTopicLink,
  type AssessmentLinkedTopic,
  type AssessmentWithTopics,
  type Resource,
  type User,
  type ResourceChunk,
  type AcademicNode,
  type AcademicNodeResourceLink,
  type AcademicNodeWithResources,
  type SearchResultItem,
  type Company,
  type RoleFamily,
  type Opportunity,
  type OpportunityRequirement,
  type Skill,
  type OpportunitySkillRequirement,
  type OpportunityLocation,
  type OpportunityProgramRule,
  type OpportunitySource,
  type StudentCareerProfile,
  type StudentCareerProfileInput,
  type StudentTargetRole,
  type StudentTargetCompany,
  type StudentSkillEvidence,
  type ApplicationRecord,
  type ApplicationStatus,
  type StudentSavedOpportunity,
  type StudentSavedOpportunityInput,
  type ConceptSkillMapping,
  type ConceptSkillMappingSeed,
  type VerifiedCompanySeed,
  type PredictionSnapshot,
  type OpportunitySnapshot,
  type ModelRegistryEntry,
  type ModelCard,
  type ModelApprovalStatus,
  type OutcomeTarget,
  type JobOutboxRecord,
  INITIAL_ROLE_FAMILIES,
  VERIFIED_COMPANIES_SEED,
  CANONICAL_CONCEPT_SKILL_MAPPINGS,
  TopicStudyState,
  StudyEvent,
  StudyStateValue,
  StudyEventType,
} from '@campusflow/types';
import {
  AppError,
  isValidUuid,
  assertOwnership,
  sanitizeSearchQuery,
  type EnqueueJobOptions,
  type OutboxStore,
  InMemoryOutboxStore,
} from '@campusflow/shared';

/**
 * DataStore abstraction: provides atomic, validated data access with strict
 * ownership, UUID validation, and Full-Text Search.
 */
export interface DataStore {
  // Users
  getUser(id: string): Promise<User | null>;
  createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<User>;

  // Courses
  getCourse(id: string, requesterUserId: string): Promise<Course>;
  listCourses(userId: string): Promise<Course[]>;
  createCourse(course: {
    userId: string;
    code: string;
    title: string;
    term?: string | null | undefined;
  }): Promise<Course>;
  deleteCourse(id: string, requesterUserId: string): Promise<void>;

  // Assessments
  getAssessment(id: string, requesterUserId: string): Promise<AssessmentWithTopics>;
  listAssessments(userId: string, courseId?: string): Promise<AssessmentWithTopics[]>;
  createAssessment(assessment: {
    userId: string;
    courseId: string;
    title: string;
    type: Assessment['type'];
    date?: Date | null | undefined;
    totalMarks?: number | null | undefined;
    weightage?: string | null | undefined;
    status?: Assessment['status'] | undefined;
  }): Promise<Assessment>;
  updateAssessment(
    id: string,
    requesterUserId: string,
    updates: Partial<Assessment>,
  ): Promise<Assessment>;
  deleteAssessment(id: string, requesterUserId: string): Promise<void>;
  linkTopicToAssessment(
    link: Omit<AssessmentTopicLink, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AssessmentTopicLink>;
  listTopicsForAssessment(
    assessmentId: string,
    requesterUserId: string,
  ): Promise<AssessmentTopicLink[]>;
  unlinkTopicFromAssessment(
    assessmentId: string,
    topicId: string,
    requesterUserId: string,
  ): Promise<void>;

  // Resources
  getResource(id: string, requesterUserId: string): Promise<Resource>;
  listResources(userId: string, courseId?: string): Promise<Resource[]>;
  findResourceByHash(userId: string, contentHash: string): Promise<Resource | null>;
  createResource(resource: {
    userId: string;
    courseId?: string | null | undefined;
    title: string;
    type: Resource['type'];
    objectKey: string;
    mimeType: string;
    sizeBytes?: number | null | undefined;
    contentHash?: string | null | undefined;
    pageCount?: number | null | undefined;
    processingStatus?: Resource['processingStatus'];
  }): Promise<Resource>;
  createResourceWithOutbox(
    resource: {
      userId: string;
      courseId?: string | null | undefined;
      title: string;
      type: Resource['type'];
      objectKey: string;
      mimeType: string;
      sizeBytes?: number | null | undefined;
      contentHash?: string | null | undefined;
      pageCount?: number | null | undefined;
      processingStatus?: Resource['processingStatus'];
    },
    outboxJob: EnqueueJobOptions,
  ): Promise<{ resource: Resource; job: JobOutboxRecord }>;
  updateResource(
    id: string,
    requesterUserId: string,
    updates: Partial<Resource>,
  ): Promise<Resource>;
  updateResourceStatus(
    id: string,
    requesterUserId: string,
    status: Resource['processingStatus'],
    extra?: { errorMessage?: string | null; pageCount?: number | null },
  ): Promise<Resource>;
  retryResourceWithOutbox(
    resourceId: string,
    requesterUserId: string,
    outboxJob: EnqueueJobOptions,
  ): Promise<{ resource: Resource; job: JobOutboxRecord }>;
  deleteResource(id: string, requesterUserId: string): Promise<void>;
  deleteResourceWithOutbox(
    resourceId: string,
    requesterUserId: string,
    outboxJob: EnqueueJobOptions,
  ): Promise<{ job: JobOutboxRecord }>;

  // Chunks & FTS
  createChunks(chunks: Array<Omit<ResourceChunk, 'id' | 'createdAt'>>): Promise<ResourceChunk[]>;
  listChunks(resourceId: string, requesterUserId: string): Promise<ResourceChunk[]>;
  deleteChunksByResource(resourceId: string): Promise<void>;
  searchChunks(
    userId: string,
    query: string,
    courseId?: string | null | undefined,
  ): Promise<SearchResultItem[]>;

  // Academic Nodes (Map)
  listAcademicNodes(courseId: string, requesterUserId: string): Promise<AcademicNode[]>;
  createAcademicNodes(
    nodes: Array<Omit<AcademicNode, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<AcademicNode[]>;
  updateAcademicNode(
    id: string,
    requesterUserId: string,
    updates: Partial<AcademicNode>,
  ): Promise<AcademicNode>;
  deleteAcademicNode(id: string, requesterUserId: string): Promise<void>;
  linkResourceToAcademicNode(
    link: Omit<AcademicNodeResourceLink, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AcademicNodeResourceLink>;
  listResourceLinksForNode(
    nodeId: string,
    requesterUserId: string,
  ): Promise<AcademicNodeResourceLink[]>;
  listResourceLinksForCourse(
    courseId: string,
    requesterUserId: string,
  ): Promise<AcademicNodeResourceLink[]>;
  listNodeLinksForResource(
    resourceId: string,
    requesterUserId: string,
  ): Promise<AcademicNodeResourceLink[]>;
  deleteResourceLink(id: string, requesterUserId: string): Promise<void>;
  listAcademicNodesWithResources(
    courseId: string,
    requesterUserId: string,
  ): Promise<AcademicNodeWithResources[]>;

  // Study State & Events
  getTopicStudyState(
    courseId: string,
    topicId: string,
    requesterUserId: string,
  ): Promise<TopicStudyState>;
  listCourseStudyStates(courseId: string, requesterUserId: string): Promise<TopicStudyState[]>;
  setTopicStudyState(
    courseId: string,
    topicId: string,
    requesterUserId: string,
    state: StudyStateValue,
    eventType?: StudyEventType,
    metadata?: Record<string, unknown> | null,
  ): Promise<{ studyState: TopicStudyState; event: StudyEvent }>;
  recordStudyEvent(
    courseId: string,
    topicId: string,
    requesterUserId: string,
    type: StudyEventType,
    metadata?: Record<string, unknown> | null,
  ): Promise<{ studyState: TopicStudyState; event: StudyEvent }>;
  listStudyEvents(
    courseId: string,
    topicId: string,
    requesterUserId: string,
  ): Promise<StudyEvent[]>;

  deleteUser(id: string): Promise<void>;

  // Role Families
  listRoleFamilies(): Promise<RoleFamily[]>;
  getRoleFamily(id: string): Promise<RoleFamily | null>;
  ensureInitialRoleFamilies(names: readonly string[]): Promise<void>;

  // Companies
  listCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | null>;
  createCompany(data: {
    name: string;
    slug: string;
    websiteUrl?: string | null;
    description?: string | null;
    industry?: string | null;
    isVerified?: boolean;
  }): Promise<Company>;
  ensureVerifiedCompanies(seeds: readonly VerifiedCompanySeed[]): Promise<void>;

  // Skills
  listSkills(category?: string): Promise<Skill[]>;
  getSkill(id: string): Promise<Skill | null>;
  createSkill(data: {
    name: string;
    category?: Skill['category'];
    synonyms?: string[];
  }): Promise<Skill>;

  // Opportunities
  listOpportunities(filters?: {
    roleFamilyId?: string;
    opportunityType?: string;
    status?: string;
    companyId?: string;
  }): Promise<Opportunity[]>;
  getOpportunity(id: string): Promise<Opportunity | null>;
  findOpportunityBySourceUrl(sourceUrl: string): Promise<Opportunity | null>;
  createOpportunity(
    data: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<Opportunity>;
  updateOpportunity(id: string, data: Partial<Opportunity>): Promise<Opportunity>;
  deleteOpportunity(id: string): Promise<void>;
  getOpportunityRequirements(opportunityId: string): Promise<OpportunityRequirement[]>;
  getOpportunitySkillRequirements(
    opportunityId: string,
  ): Promise<Array<OpportunitySkillRequirement & { skill?: Skill }>>;
  getOpportunityLocations(opportunityId: string): Promise<OpportunityLocation[]>;
  getOpportunityProgramRules(opportunityId: string): Promise<OpportunityProgramRule[]>;
  getOpportunitySources(opportunityId: string): Promise<OpportunitySource[]>;
  createOpportunityRequirement(
    data: Omit<OpportunityRequirement, 'id' | 'createdAt'>,
  ): Promise<OpportunityRequirement>;
  createOpportunitySkillRequirement(
    data: Omit<OpportunitySkillRequirement, 'id' | 'createdAt'>,
  ): Promise<OpportunitySkillRequirement>;
  createOpportunityLocation(
    data: Omit<OpportunityLocation, 'id' | 'createdAt'>,
  ): Promise<OpportunityLocation>;
  createOpportunityProgramRule(
    data: Omit<OpportunityProgramRule, 'id' | 'createdAt'>,
  ): Promise<OpportunityProgramRule>;
  createOpportunitySource(
    data: Omit<OpportunitySource, 'id' | 'createdAt'>,
  ): Promise<OpportunitySource>;

  // Student Career Profile
  getStudentCareerProfile(userId: string): Promise<StudentCareerProfile | null>;
  upsertStudentCareerProfile(
    userId: string,
    data: StudentCareerProfileInput,
  ): Promise<StudentCareerProfile>;

  // Student Target Roles & Companies
  listStudentTargetRoles(
    userId: string,
  ): Promise<Array<StudentTargetRole & { roleFamily?: RoleFamily }>>;
  addStudentTargetRole(
    userId: string,
    roleFamilyId: string,
    priority?: number,
  ): Promise<StudentTargetRole>;
  removeStudentTargetRole(userId: string, roleFamilyId: string): Promise<void>;
  listStudentTargetCompanies(
    userId: string,
  ): Promise<Array<StudentTargetCompany & { company?: Company }>>;
  addStudentTargetCompany(
    userId: string,
    companyId: string,
    priority?: number,
    notes?: string | null,
  ): Promise<StudentTargetCompany>;
  removeStudentTargetCompany(userId: string, companyId: string): Promise<void>;

  // Student Saved Opportunities (Strict User Ownership)
  listStudentSavedOpportunities(userId: string): Promise<
    Array<
      StudentSavedOpportunity & {
        opportunity?: Opportunity & { company?: Company; roleFamily?: RoleFamily };
      }
    >
  >;
  getStudentSavedOpportunity(id: string, userId: string): Promise<StudentSavedOpportunity | null>;
  createStudentSavedOpportunity(
    userId: string,
    data: StudentSavedOpportunityInput,
  ): Promise<StudentSavedOpportunity>;
  updateStudentSavedOpportunity(
    id: string,
    userId: string,
    updates: Partial<StudentSavedOpportunityInput>,
  ): Promise<StudentSavedOpportunity>;
  deleteStudentSavedOpportunity(id: string, userId: string): Promise<void>;

  // Concept Skill Mappings
  listConceptSkillMappings(conceptName?: string): Promise<ConceptSkillMapping[]>;
  createConceptSkillMapping(
    data: Omit<ConceptSkillMapping, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ConceptSkillMapping>;
  ensureInitialConceptSkillMappings(mappings: readonly ConceptSkillMappingSeed[]): Promise<void>;

  // Student Skill Evidence
  listStudentSkillEvidence(userId: string): Promise<
    Array<
      StudentSkillEvidence & {
        skill?: Skill;
        course?: Course | null;
        academicNode?: AcademicNode | null;
      }
    >
  >;
  createStudentSkillEvidence(
    data: Omit<StudentSkillEvidence, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<StudentSkillEvidence>;
  upsertStudentSkillEvidence(
    data: Omit<StudentSkillEvidence, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<StudentSkillEvidence>;
  deleteStudentSkillEvidence(id: string, userId: string): Promise<void>;
  listAssessmentsForUser(userId: string): Promise<Assessment[]>;
  listAllAcademicNodesForUser(userId: string): Promise<AcademicNode[]>;

  // Application Records
  listApplicationRecords(userId: string): Promise<
    Array<
      ApplicationRecord & {
        opportunity?: Opportunity & { company?: Company; roleFamily?: RoleFamily };
      }
    >
  >;
  getApplicationRecord(id: string, userId: string): Promise<ApplicationRecord | null>;
  createApplicationRecord(
    userId: string,
    opportunityId: string,
    notes?: string | null,
  ): Promise<ApplicationRecord>;
  updateApplicationStatus(
    id: string,
    userId: string,
    newStatus: ApplicationStatus,
    notes?: string | null,
  ): Promise<ApplicationRecord>;

  // Prediction Snapshots
  createPredictionSnapshot(snapshot: PredictionSnapshot): Promise<PredictionSnapshot>;
  getPredictionSnapshot(id: string): Promise<PredictionSnapshot | null>;
  listPredictionSnapshots(userId: string, opportunityId?: string): Promise<PredictionSnapshot[]>;

  // Opportunity Snapshots
  createOpportunitySnapshot(snapshot: OpportunitySnapshot): Promise<OpportunitySnapshot>;
  getOpportunitySnapshot(id: string): Promise<OpportunitySnapshot | null>;
  listOpportunitySnapshots(opportunityId: string): Promise<OpportunitySnapshot[]>;

  // Model Registry
  createModelRegistryEntry(entry: ModelRegistryEntry): Promise<ModelRegistryEntry>;
  getModelRegistryEntry(modelVersion: string): Promise<ModelRegistryEntry | null>;
  listModelRegistryEntries(filter?: {
    approvalStatus?: ModelApprovalStatus;
    target?: OutcomeTarget;
  }): Promise<ModelRegistryEntry[]>;
  updateModelApprovalStatus(
    modelVersion: string,
    status: ModelApprovalStatus,
    approvedBy?: string | null,
  ): Promise<ModelRegistryEntry>;

  // Model Cards
  createModelCard(card: ModelCard): Promise<ModelCard>;
  getModelCard(modelVersion: string): Promise<ModelCard | null>;
}

export class InMemoryDataStore implements DataStore {
  private users: Map<string, User> = new Map();
  private courses: Map<string, Course> = new Map();
  private assessments: Map<string, Assessment> = new Map();
  private assessmentTopics: Map<string, AssessmentTopicLink> = new Map();
  private resources: Map<string, Resource> = new Map();
  private chunks: Map<string, ResourceChunk> = new Map();
  private academicNodes: Map<string, AcademicNode> = new Map();
  private academicNodeResources: Map<string, AcademicNodeResourceLink> = new Map();
  private topicStudyStates: Map<string, TopicStudyState> = new Map();
  private studyEvents: Map<string, StudyEvent> = new Map();
  private roleFamilies: Map<string, RoleFamily> = new Map();
  private companies: Map<string, Company> = new Map();
  private skills: Map<string, Skill> = new Map();
  private opportunities: Map<string, Opportunity> = new Map();
  private opportunityRequirements: Map<string, OpportunityRequirement> = new Map();
  private opportunitySkillRequirements: Map<string, OpportunitySkillRequirement> = new Map();
  private opportunityLocations: Map<string, OpportunityLocation> = new Map();
  private opportunityProgramRules: Map<string, OpportunityProgramRule> = new Map();
  private opportunitySources: Map<string, OpportunitySource> = new Map();
  private studentCareerProfiles: Map<string, StudentCareerProfile> = new Map();
  private studentTargetRoles: Map<string, StudentTargetRole> = new Map();
  private studentTargetCompanies: Map<string, StudentTargetCompany> = new Map();
  private studentSkillEvidence: Map<string, StudentSkillEvidence> = new Map();
  private studentSavedOpportunities: Map<string, StudentSavedOpportunity> = new Map();
  private conceptMappings: Map<string, ConceptSkillMapping> = new Map();
  private applicationRecords: Map<string, ApplicationRecord> = new Map();
  private predictionSnapshots: Map<string, PredictionSnapshot> = new Map();
  private opportunitySnapshots: Map<string, OpportunitySnapshot> = new Map();
  private modelRegistryEntries: Map<string, ModelRegistryEntry> = new Map();
  private modelCards: Map<string, ModelCard> = new Map();
  private outboxStore: OutboxStore;

  constructor(outboxStore?: OutboxStore) {
    this.outboxStore = outboxStore || new InMemoryOutboxStore();
    this.seedInitialRoleFamilies();
    this.seedVerifiedCompanies();
    this.seedConceptSkillMappings();
    this.seedCanonicalSkills();
  }

  setOutboxStore(store: OutboxStore): void {
    this.outboxStore = store;
  }

  getOutboxStore(): OutboxStore {
    return this.outboxStore;
  }

  private seedInitialRoleFamilies(): void {
    const now = new Date();
    for (const name of INITIAL_ROLE_FAMILIES) {
      const id = crypto.randomUUID();
      this.roleFamilies.set(id, {
        id,
        name,
        description: `Career family for ${name}`,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  private seedVerifiedCompanies(): void {
    const now = new Date();
    for (const s of VERIFIED_COMPANIES_SEED) {
      const existing = Array.from(this.companies.values()).find((c) => c.slug === s.slug);
      if (!existing) {
        const id = crypto.randomUUID();
        this.companies.set(id, {
          id,
          name: s.name,
          slug: s.slug,
          websiteUrl: s.websiteUrl,
          description: s.description,
          industry: s.industry,
          isVerified: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  private seedConceptSkillMappings(): void {
    const now = new Date();
    for (const m of CANONICAL_CONCEPT_SKILL_MAPPINGS) {
      const existing = Array.from(this.conceptMappings.values()).find(
        (cm) =>
          cm.conceptName.toLowerCase() === m.conceptName.toLowerCase() &&
          cm.skillName.toLowerCase() === m.skillName.toLowerCase(),
      );
      if (!existing) {
        const id = crypto.randomUUID();
        this.conceptMappings.set(id, {
          id,
          conceptName: m.conceptName,
          skillName: m.skillName,
          skillCategory: m.skillCategory,
          relevanceScore: m.relevanceScore,
          provenance: m.provenance,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  private seedCanonicalSkills(): void {
    const now = new Date();
    const uniqueSkills = new Map<string, Skill['category']>();
    for (const m of CANONICAL_CONCEPT_SKILL_MAPPINGS) {
      if (!uniqueSkills.has(m.skillName)) {
        uniqueSkills.set(m.skillName, m.skillCategory);
      }
    }
    for (const [name, category] of uniqueSkills.entries()) {
      const existing = Array.from(this.skills.values()).find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      );
      if (!existing) {
        const id = crypto.randomUUID();
        this.skills.set(id, {
          id,
          name,
          category,
          synonyms: [],
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  async getUser(id: string): Promise<User | null> {
    if (!isValidUuid(id)) {
      throw AppError.badRequest('Invalid user ID format.');
    }
    return this.users.get(id) || null;
  }

  async createUser(
    data: Omit<User, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<User> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const user: User = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  async getCourse(id: string, requesterUserId: string): Promise<Course> {
    if (!isValidUuid(id)) {
      throw AppError.badRequest('Invalid course ID format: must be a valid UUID.');
    }
    const course = this.courses.get(id);
    if (!course) {
      throw AppError.notFound('Course not found.');
    }
    assertOwnership(course.userId, requesterUserId, 'Course');
    return course;
  }

  async listCourses(userId: string): Promise<Course[]> {
    if (!isValidUuid(userId)) {
      throw AppError.badRequest('Invalid user ID format.');
    }
    return Array.from(this.courses.values()).filter((c) => c.userId === userId);
  }

  async createCourse(data: {
    userId: string;
    code: string;
    title: string;
    term?: string | null | undefined;
  }): Promise<Course> {
    if (!isValidUuid(data.userId)) {
      throw AppError.badRequest('Invalid user ID format.');
    }

    const existing = Array.from(this.courses.values()).find(
      (c) =>
        c.userId === data.userId &&
        c.code.toLowerCase() === data.code.toLowerCase() &&
        (c.term || '') === (data.term || ''),
    );
    if (existing) {
      throw new AppError(
        'CONFLICT',
        `Course with code ${data.code} already exists for term ${data.term || 'default'}.`,
        409,
      );
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const course: Course = {
      id,
      userId: data.userId,
      code: data.code,
      title: data.title,
      term: data.term || null,
      syllabusStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.courses.set(id, course);
    return course;
  }

  async deleteCourse(id: string, requesterUserId: string): Promise<void> {
    const course = await this.getCourse(id, requesterUserId);
    this.courses.delete(course.id);

    // Cascade delete child assessments and assessment topic links
    for (const [aId, assessment] of this.assessments.entries()) {
      if (assessment.courseId === course.id) {
        this.assessments.delete(aId);
      }
    }
    for (const [atId, link] of this.assessmentTopics.entries()) {
      if (link.courseId === course.id) {
        this.assessmentTopics.delete(atId);
      }
    }

    // Cascade delete academic nodes & links
    for (const [nId, node] of this.academicNodes.entries()) {
      if (node.courseId === course.id) {
        this.academicNodes.delete(nId);
      }
    }
    for (const [lId, link] of this.academicNodeResources.entries()) {
      if (link.courseId === course.id) {
        this.academicNodeResources.delete(lId);
      }
    }
    for (const [sId, state] of this.topicStudyStates.entries()) {
      if (state.courseId === course.id) {
        this.topicStudyStates.delete(sId);
      }
    }
    for (const [eId, event] of this.studyEvents.entries()) {
      if (event.courseId === course.id) {
        this.studyEvents.delete(eId);
      }
    }

    // Retain resources in user second brain with courseId = null (mirrors DB onDelete: 'set null')
    for (const resource of this.resources.values()) {
      if (resource.courseId === course.id) {
        resource.courseId = null;
        resource.updatedAt = new Date();
      }
    }
  }

  private buildAssessmentWithTopics(
    assessment: Assessment,
    requesterUserId: string,
  ): AssessmentWithTopics {
    const links = Array.from(this.assessmentTopics.values()).filter(
      (l) => l.assessmentId === assessment.id && l.userId === requesterUserId,
    );
    const topics: AssessmentLinkedTopic[] = [];
    for (const l of links) {
      const node = this.academicNodes.get(l.topicId);
      const parentModule = node?.parentId ? this.academicNodes.get(node.parentId) : null;
      topics.push({
        linkId: l.id,
        topicId: l.topicId,
        topicTitle: node?.title || 'Unknown Topic',
        parentModuleId: node?.parentId || null,
        parentModuleTitle: parentModule?.title || null,
        weight: l.weight,
        source: l.source,
        notes: l.notes,
      });
    }
    return {
      ...assessment,
      topics,
      topicCount: topics.length,
    };
  }

  async getAssessment(id: string, requesterUserId: string): Promise<AssessmentWithTopics> {
    if (!isValidUuid(id)) {
      throw AppError.badRequest('Invalid assessment ID format: must be a valid UUID.');
    }
    const assessment = this.assessments.get(id);
    if (!assessment) {
      throw AppError.notFound('Assessment not found.');
    }
    assertOwnership(assessment.userId, requesterUserId, 'Assessment');
    return this.buildAssessmentWithTopics(assessment, requesterUserId);
  }

  async listAssessments(userId: string, courseId?: string): Promise<AssessmentWithTopics[]> {
    if (!isValidUuid(userId)) {
      throw AppError.badRequest('Invalid user ID format.');
    }
    const filtered = Array.from(this.assessments.values()).filter(
      (a) => a.userId === userId && (!courseId || a.courseId === courseId),
    );
    return filtered.map((a) => this.buildAssessmentWithTopics(a, userId));
  }

  async createAssessment(data: {
    userId: string;
    courseId: string;
    title: string;
    type: Assessment['type'];
    date?: Date | null | undefined;
    totalMarks?: number | null | undefined;
    weightage?: string | null | undefined;
    status?: Assessment['status'] | undefined;
  }): Promise<Assessment> {
    await this.getCourse(data.courseId, data.userId);

    const id = crypto.randomUUID();
    const now = new Date();
    const assessment: Assessment = {
      id,
      userId: data.userId,
      courseId: data.courseId,
      title: data.title,
      type: data.type,
      date: data.date || null,
      totalMarks: data.totalMarks ?? null,
      weightage: data.weightage || null,
      status: data.status || 'upcoming',
      createdAt: now,
      updatedAt: now,
    };
    this.assessments.set(id, assessment);
    return assessment;
  }

  async updateAssessment(
    id: string,
    requesterUserId: string,
    updates: Partial<Assessment>,
  ): Promise<Assessment> {
    if (!isValidUuid(id)) {
      throw AppError.badRequest('Invalid assessment ID format: must be a valid UUID.');
    }
    const existing = this.assessments.get(id);
    if (!existing) {
      throw AppError.notFound('Assessment not found.');
    }
    assertOwnership(existing.userId, requesterUserId, 'Assessment');

    const updated: Assessment = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      courseId: existing.courseId,
      updatedAt: new Date(),
    };
    this.assessments.set(id, updated);
    return updated;
  }

  async deleteAssessment(id: string, requesterUserId: string): Promise<void> {
    if (!isValidUuid(id)) {
      throw AppError.badRequest('Invalid assessment ID format: must be a valid UUID.');
    }
    const assessment = this.assessments.get(id);
    if (!assessment) {
      throw AppError.notFound('Assessment not found.');
    }
    assertOwnership(assessment.userId, requesterUserId, 'Assessment');

    this.assessments.delete(id);

    // Cascade delete assessment topic links
    for (const [linkId, link] of this.assessmentTopics.entries()) {
      if (link.assessmentId === id) {
        this.assessmentTopics.delete(linkId);
      }
    }
  }

  async linkTopicToAssessment(
    link: Omit<AssessmentTopicLink, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AssessmentTopicLink> {
    if (
      !isValidUuid(link.assessmentId) ||
      !isValidUuid(link.topicId) ||
      !isValidUuid(link.userId) ||
      !isValidUuid(link.courseId)
    ) {
      throw AppError.badRequest('Invalid ID format for assessment topic linking.');
    }

    const assessment = this.assessments.get(link.assessmentId);
    if (!assessment) {
      throw AppError.notFound('Assessment not found.');
    }
    assertOwnership(assessment.userId, link.userId, 'Assessment');

    const node = this.academicNodes.get(link.topicId);
    if (!node) {
      throw AppError.notFound('Topic node not found.');
    }
    assertOwnership(node.userId, link.userId, 'AcademicNode');

    if (node.courseId !== assessment.courseId || link.courseId !== assessment.courseId) {
      throw AppError.badRequest('Topic does not belong to the assessment course.');
    }

    // Check if already linked
    for (const existingLink of this.assessmentTopics.values()) {
      if (
        existingLink.assessmentId === link.assessmentId &&
        existingLink.topicId === link.topicId
      ) {
        existingLink.weight = link.weight !== undefined ? link.weight : existingLink.weight;
        existingLink.source = link.source || existingLink.source;
        existingLink.notes = link.notes !== undefined ? link.notes : existingLink.notes;
        existingLink.updatedAt = new Date();
        return existingLink;
      }
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const record: AssessmentTopicLink = {
      id,
      assessmentId: link.assessmentId,
      topicId: link.topicId,
      userId: link.userId,
      courseId: link.courseId,
      weight: link.weight !== undefined ? link.weight : null,
      source: link.source || 'user',
      notes: link.notes || null,
      createdAt: now,
      updatedAt: now,
    };
    this.assessmentTopics.set(id, record);
    return record;
  }

  async listTopicsForAssessment(
    assessmentId: string,
    requesterUserId: string,
  ): Promise<AssessmentTopicLink[]> {
    await this.getAssessment(assessmentId, requesterUserId);
    return Array.from(this.assessmentTopics.values()).filter(
      (l) => l.assessmentId === assessmentId && l.userId === requesterUserId,
    );
  }

  async unlinkTopicFromAssessment(
    assessmentId: string,
    topicId: string,
    requesterUserId: string,
  ): Promise<void> {
    await this.getAssessment(assessmentId, requesterUserId);
    for (const [linkId, link] of this.assessmentTopics.entries()) {
      if (
        link.assessmentId === assessmentId &&
        link.topicId === topicId &&
        link.userId === requesterUserId
      ) {
        this.assessmentTopics.delete(linkId);
        return;
      }
    }
  }

  async getResource(id: string, requesterUserId: string): Promise<Resource> {
    if (!isValidUuid(id)) {
      throw AppError.badRequest('Invalid resource ID format: must be a valid UUID.');
    }
    const resource = this.resources.get(id);
    if (!resource) {
      throw AppError.notFound('Resource not found.');
    }
    assertOwnership(resource.userId, requesterUserId, 'Resource');
    return resource;
  }

  async listResources(userId: string, courseId?: string): Promise<Resource[]> {
    if (!isValidUuid(userId)) {
      throw AppError.badRequest('Invalid user ID format.');
    }
    return Array.from(this.resources.values()).filter(
      (r) => r.userId === userId && (!courseId || r.courseId === courseId),
    );
  }

  async findResourceByHash(userId: string, contentHash: string): Promise<Resource | null> {
    if (!contentHash) return null;
    for (const r of this.resources.values()) {
      if (r.userId === userId && r.contentHash === contentHash) {
        return r;
      }
    }
    return null;
  }

  async createResource(data: {
    userId: string;
    courseId?: string | null | undefined;
    title: string;
    type: Resource['type'];
    objectKey: string;
    mimeType: string;
    sizeBytes?: number | null | undefined;
    contentHash?: string | null | undefined;
    pageCount?: number | null | undefined;
    processingStatus?: Resource['processingStatus'];
  }): Promise<Resource> {
    if (!isValidUuid(data.userId)) {
      throw AppError.badRequest('Invalid user ID format.');
    }

    if (!data.objectKey.startsWith(`users/${data.userId}/`)) {
      throw AppError.forbidden('Object key does not belong to the authenticated user.');
    }

    if (data.courseId) {
      await this.getCourse(data.courseId, data.userId);
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const resource: Resource = {
      id,
      userId: data.userId,
      courseId: data.courseId || null,
      title: data.title,
      type: data.type,
      objectKey: data.objectKey,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes || null,
      contentHash: data.contentHash || null,
      pageCount: data.pageCount || null,
      errorMessage: null,
      failedAt: null,
      processedAt: null,
      extractionVersion: 'v1.0',
      processingStatus: data.processingStatus || 'created',
      createdAt: now,
      updatedAt: now,
    };
    this.resources.set(id, resource);
    return resource;
  }

  async updateResource(
    id: string,
    requesterUserId: string,
    updates: Partial<Resource>,
  ): Promise<Resource> {
    const resource = await this.getResource(id, requesterUserId);
    const updated: Resource = {
      ...resource,
      ...updates,
      updatedAt: new Date(),
    };
    this.resources.set(id, updated);
    return updated;
  }

  async updateResourceStatus(
    id: string,
    requesterUserId: string,
    status: Resource['processingStatus'],
    extra?: { errorMessage?: string | null; pageCount?: number | null },
  ): Promise<Resource> {
    const resource = await this.getResource(id, requesterUserId);
    resource.processingStatus = status;
    resource.updatedAt = new Date();

    if (status === 'ready') {
      resource.processedAt = new Date();
      resource.errorMessage = null;
    } else if (status === 'failed') {
      resource.failedAt = new Date();
      resource.errorMessage = extra?.errorMessage || 'Processing failed.';
    }

    if (extra?.pageCount !== undefined) {
      resource.pageCount = extra.pageCount;
    }

    return resource;
  }

  async deleteResource(id: string, requesterUserId: string): Promise<void> {
    const resource = await this.getResource(id, requesterUserId);
    this.resources.delete(resource.id);
    await this.deleteChunksByResource(resource.id);
    for (const [lId, link] of this.academicNodeResources.entries()) {
      if (link.resourceId === resource.id) {
        this.academicNodeResources.delete(lId);
      }
    }
  }

  async createResourceWithOutbox(
    data: {
      userId: string;
      courseId?: string | null | undefined;
      title: string;
      type: Resource['type'];
      objectKey: string;
      mimeType: string;
      sizeBytes?: number | null | undefined;
      contentHash?: string | null | undefined;
      pageCount?: number | null | undefined;
      processingStatus?: Resource['processingStatus'];
    },
    outboxJob: EnqueueJobOptions,
  ): Promise<{ resource: Resource; job: JobOutboxRecord }> {
    const resource = await this.createResource(data);
    let job: JobOutboxRecord | undefined;
    let createdNewJob = false;

    try {
      const payload: Record<string, unknown> = {
        ...(outboxJob.payload || {}),
        resourceId: resource.id,
        userId: resource.userId,
        courseId: resource.courseId,
        objectKey: resource.objectKey,
        mimeType: resource.mimeType,
      };
      const idempotencyKey = outboxJob.idempotencyKey || `process_${resource.id}`;

      // Check if job already exists with this idempotency key
      const existing = await this.outboxStore.getJobByIdempotencyKey(
        outboxJob.queueName,
        idempotencyKey,
      );
      if (existing) {
        job = existing;
      } else {
        job = await this.outboxStore.createJob({
          queueName: outboxJob.queueName,
          payload,
          idempotencyKey,
          status: 'pending',
          attempts: 0,
          maxAttempts: outboxJob.maxAttempts ?? 3,
          scheduledAt: outboxJob.scheduledAt ?? new Date(),
        });
        createdNewJob = true;
      }

      if (outboxJob.simulateFailure) {
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      }

      return { resource, job };
    } catch (err) {
      // Rollback in-memory mutations
      this.resources.delete(resource.id);
      if (createdNewJob && job && this.outboxStore.deleteJob) {
        await this.outboxStore.deleteJob(job.id);
      }
      throw err;
    }
  }

  async retryResourceWithOutbox(
    resourceId: string,
    requesterUserId: string,
    outboxJob: EnqueueJobOptions,
  ): Promise<{ resource: Resource; job: JobOutboxRecord }> {
    const resource = await this.getResource(resourceId, requesterUserId);
    if (resource.processingStatus !== 'failed') {
      throw AppError.badRequest(
        `Cannot retry resource with status '${resource.processingStatus}'. Only failed resources can be retried.`,
      );
    }

    const previousStatus = resource.processingStatus;
    const previousUpdatedAt = resource.updatedAt;

    resource.processingStatus = 'queued';
    resource.updatedAt = new Date();

    let job: JobOutboxRecord | undefined;

    try {
      const payload: Record<string, unknown> = {
        ...(outboxJob.payload || {}),
        resourceId: resource.id,
        userId: resource.userId,
        courseId: resource.courseId,
        objectKey: resource.objectKey,
        mimeType: resource.mimeType,
      };
      const idempotencyKey = outboxJob.idempotencyKey || `retry_${resourceId}_${Date.now()}`;

      job = await this.outboxStore.createJob({
        queueName: outboxJob.queueName,
        payload,
        idempotencyKey,
        status: 'pending',
        attempts: 0,
        maxAttempts: outboxJob.maxAttempts ?? 3,
        scheduledAt: outboxJob.scheduledAt ?? new Date(),
      });

      if (outboxJob.simulateFailure) {
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      }

      return { resource, job };
    } catch (err) {
      // Rollback status
      resource.processingStatus = previousStatus;
      resource.updatedAt = previousUpdatedAt;
      if (job && this.outboxStore.deleteJob) {
        await this.outboxStore.deleteJob(job.id);
      }
      throw err;
    }
  }

  async deleteResourceWithOutbox(
    resourceId: string,
    requesterUserId: string,
    outboxJob: EnqueueJobOptions,
  ): Promise<{ job: JobOutboxRecord }> {
    const resource = await this.getResource(resourceId, requesterUserId);
    const existingChunks = Array.from(this.chunks.values()).filter(
      (c) => c.resourceId === resourceId,
    );

    this.resources.delete(resource.id);
    for (const chunk of existingChunks) {
      this.chunks.delete(chunk.id);
    }

    let job: JobOutboxRecord | undefined;

    try {
      const payload: Record<string, unknown> = {
        ...(outboxJob.payload || {}),
        action: 'delete_storage_object',
        objectKey: resource.objectKey,
        userId: requesterUserId,
      };
      const idempotencyKey = outboxJob.idempotencyKey || `delete_storage_${resourceId}`;

      job = await this.outboxStore.createJob({
        queueName: outboxJob.queueName,
        payload,
        idempotencyKey,
        status: 'pending',
        attempts: 0,
        maxAttempts: outboxJob.maxAttempts ?? 3,
        scheduledAt: outboxJob.scheduledAt ?? new Date(),
      });

      if (outboxJob.simulateFailure) {
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      }

      return { job };
    } catch (err) {
      // Rollback resource and chunks
      this.resources.set(resource.id, resource);
      for (const chunk of existingChunks) {
        this.chunks.set(chunk.id, chunk);
      }
      if (job && this.outboxStore.deleteJob) {
        await this.outboxStore.deleteJob(job.id);
      }
      throw err;
    }
  }

  // Chunks & FTS
  async createChunks(
    chunksData: Array<Omit<ResourceChunk, 'id' | 'createdAt'>>,
  ): Promise<ResourceChunk[]> {
    const created: ResourceChunk[] = [];
    const now = new Date();

    for (const chunk of chunksData) {
      const id = crypto.randomUUID();
      const record: ResourceChunk = {
        ...chunk,
        id,
        createdAt: now,
      };
      this.chunks.set(id, record);
      created.push(record);
    }
    return created;
  }

  async listChunks(resourceId: string, requesterUserId: string): Promise<ResourceChunk[]> {
    await this.getResource(resourceId, requesterUserId);
    return Array.from(this.chunks.values())
      .filter((c) => c.resourceId === resourceId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  async deleteChunksByResource(resourceId: string): Promise<void> {
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.resourceId === resourceId) {
        this.chunks.delete(id);
      }
    }
  }

  async searchChunks(
    userId: string,
    query: string,
    courseId?: string | null | undefined,
  ): Promise<SearchResultItem[]> {
    if (!isValidUuid(userId)) {
      throw AppError.badRequest('Invalid user ID format.');
    }

    const cleanQuery = sanitizeSearchQuery(query).toLowerCase();
    if (!cleanQuery) return [];

    const queryTokens = cleanQuery.split(/\s+/).filter(Boolean);
    const results: SearchResultItem[] = [];

    // Filter user's chunks (and optional courseId)
    const userChunks = Array.from(this.chunks.values()).filter(
      (c) => c.userId === userId && (!courseId || c.courseId === courseId),
    );

    for (const chunk of userChunks) {
      const contentLower = chunk.content.toLowerCase();
      let matchScore = 0;

      for (const token of queryTokens) {
        if (contentLower.includes(token)) {
          // Count occurrences
          const occurrences = contentLower.split(token).length - 1;
          matchScore += occurrences;
        }
      }

      if (matchScore > 0) {
        const resource = this.resources.get(chunk.resourceId);
        const resourceTitle = resource?.title || 'Unknown Document';

        // Extract snippet around first match
        let snippet = chunk.content.slice(0, 200);
        const firstMatchIndex = contentLower.indexOf(queryTokens[0] || '');
        if (firstMatchIndex !== -1) {
          const start = Math.max(0, firstMatchIndex - 60);
          const end = Math.min(chunk.content.length, firstMatchIndex + 140);
          snippet =
            (start > 0 ? '...' : '') +
            chunk.content.slice(start, end).trim() +
            (end < chunk.content.length ? '...' : '');
        }

        const pageLabel = chunk.pageStart
          ? chunk.pageStart === chunk.pageEnd
            ? `Page ${chunk.pageStart}`
            : `Pages ${chunk.pageStart}–${chunk.pageEnd}`
          : 'Document';

        results.push({
          resourceId: chunk.resourceId,
          resourceTitle,
          chunkId: chunk.id,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          matchedText: snippet,
          rank: matchScore,
          citation: `${resourceTitle} (${pageLabel})`,
          courseId: chunk.courseId,
        });
      }
    }

    // Sort by rank descending
    return results.sort((a, b) => b.rank - a.rank);
  }

  // Academic Nodes
  async listAcademicNodes(courseId: string, requesterUserId: string): Promise<AcademicNode[]> {
    await this.getCourse(courseId, requesterUserId);
    return Array.from(this.academicNodes.values())
      .filter((n) => n.courseId === courseId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async createAcademicNodes(
    nodes: Array<Omit<AcademicNode, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<AcademicNode[]> {
    const created: AcademicNode[] = [];
    const now = new Date();

    for (const node of nodes) {
      const id = crypto.randomUUID();
      const record: AcademicNode = {
        ...node,
        id,
        createdAt: now,
        updatedAt: now,
      };
      this.academicNodes.set(id, record);
      created.push(record);
    }
    return created;
  }

  async updateAcademicNode(
    id: string,
    requesterUserId: string,
    updates: Partial<AcademicNode>,
  ): Promise<AcademicNode> {
    if (!isValidUuid(id)) {
      throw AppError.badRequest('Invalid node ID format.');
    }
    const node = this.academicNodes.get(id);
    if (!node) {
      throw AppError.notFound('Academic node not found.');
    }
    assertOwnership(node.userId, requesterUserId, 'AcademicNode');

    const updated: AcademicNode = {
      ...node,
      ...updates,
      origin: 'user', // User edit overrides model inference
      updatedAt: new Date(),
    };
    this.academicNodes.set(id, updated);
    return updated;
  }

  async deleteAcademicNode(id: string, requesterUserId: string): Promise<void> {
    if (!isValidUuid(id)) {
      throw AppError.badRequest('Invalid node ID format.');
    }
    const node = this.academicNodes.get(id);
    if (!node) {
      throw AppError.notFound('Academic node not found.');
    }
    assertOwnership(node.userId, requesterUserId, 'AcademicNode');
    this.academicNodes.delete(id);

    // Cascade delete child nodes (topics) if module is deleted
    for (const [childId, childNode] of this.academicNodes.entries()) {
      if (childNode.parentId === id) {
        this.academicNodes.delete(childId);
      }
    }

    // Cascade delete links, assessment topics, and study states
    for (const [linkId, link] of this.academicNodeResources.entries()) {
      if (link.nodeId === id) {
        this.academicNodeResources.delete(linkId);
      }
    }
    for (const [atId, link] of this.assessmentTopics.entries()) {
      if (link.topicId === id) {
        this.assessmentTopics.delete(atId);
      }
    }
    for (const [sId, state] of this.topicStudyStates.entries()) {
      if (state.topicId === id) {
        this.topicStudyStates.delete(sId);
      }
    }
    for (const [eId, event] of this.studyEvents.entries()) {
      if (event.topicId === id) {
        this.studyEvents.delete(eId);
      }
    }
  }

  // --- Academic Node <-> Resource Linking ---
  async linkResourceToAcademicNode(
    link: Omit<AcademicNodeResourceLink, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AcademicNodeResourceLink> {
    const id = crypto.randomUUID();
    const now = new Date();
    const record: AcademicNodeResourceLink = {
      ...link,
      id,
      pageStart: link.pageStart ?? null,
      pageEnd: link.pageEnd ?? null,
      relevanceSummary: link.relevanceSummary ?? null,
      origin: link.origin || 'model',
      createdAt: now,
      updatedAt: now,
    };
    this.academicNodeResources.set(id, record);
    return record;
  }

  async listResourceLinksForNode(
    nodeId: string,
    requesterUserId: string,
  ): Promise<AcademicNodeResourceLink[]> {
    return Array.from(this.academicNodeResources.values()).filter(
      (l) => l.nodeId === nodeId && l.userId === requesterUserId,
    );
  }

  async listResourceLinksForCourse(
    courseId: string,
    requesterUserId: string,
  ): Promise<AcademicNodeResourceLink[]> {
    return Array.from(this.academicNodeResources.values()).filter(
      (l) => l.courseId === courseId && l.userId === requesterUserId,
    );
  }

  async listNodeLinksForResource(
    resourceId: string,
    requesterUserId: string,
  ): Promise<AcademicNodeResourceLink[]> {
    return Array.from(this.academicNodeResources.values()).filter(
      (l) => l.resourceId === resourceId && l.userId === requesterUserId,
    );
  }

  async deleteResourceLink(id: string, requesterUserId: string): Promise<void> {
    const link = this.academicNodeResources.get(id);
    if (!link) return;
    assertOwnership(link.userId, requesterUserId, 'AcademicNodeResourceLink');
    this.academicNodeResources.delete(id);
  }

  async listAcademicNodesWithResources(
    courseId: string,
    requesterUserId: string,
  ): Promise<AcademicNodeWithResources[]> {
    const nodes = await this.listAcademicNodes(courseId, requesterUserId);
    if (nodes.length === 0) return [];

    const links = await this.listResourceLinksForCourse(courseId, requesterUserId);
    const resources = await this.listResources(requesterUserId, courseId);
    const resourceMap = new Map(resources.map((r) => [r.id, r]));

    return nodes.map((node) => {
      const nodeLinks = links.filter((l) => l.nodeId === node.id);
      const linkedResources = nodeLinks.map((link) => {
        const res = resourceMap.get(link.resourceId);
        return {
          linkId: link.id,
          resourceId: link.resourceId,
          resourceTitle: res?.title || 'Unknown Resource',
          resourceType: res?.type || 'document',
          pageStart: link.pageStart,
          pageEnd: link.pageEnd,
          origin: link.origin,
        };
      });

      const studyStateKey = `${requesterUserId}_${node.id}`;
      const state = this.topicStudyStates.get(studyStateKey) || null;

      return {
        ...node,
        resources: linkedResources,
        studyState: state,
      };
    });
  }

  // --- Study State & Events ---
  async getTopicStudyState(
    courseId: string,
    topicId: string,
    requesterUserId: string,
  ): Promise<TopicStudyState> {
    if (!isValidUuid(courseId) || !isValidUuid(topicId) || !isValidUuid(requesterUserId)) {
      throw AppError.badRequest('Invalid UUID format.');
    }
    await this.getCourse(courseId, requesterUserId);

    const node = this.academicNodes.get(topicId);
    if (!node) {
      throw AppError.notFound('Topic node not found.');
    }
    assertOwnership(node.userId, requesterUserId, 'AcademicNode');
    if (node.courseId !== courseId) {
      throw AppError.badRequest('Topic does not belong to the requested course.');
    }

    const key = `${requesterUserId}_${topicId}`;
    const existing = this.topicStudyStates.get(key);
    if (existing) {
      return existing;
    }

    const now = new Date();
    return {
      id: crypto.randomUUID(),
      userId: requesterUserId,
      courseId,
      topicId,
      state: 'not_started',
      lastStudiedAt: null,
      lastReviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async listCourseStudyStates(
    courseId: string,
    requesterUserId: string,
  ): Promise<TopicStudyState[]> {
    if (!isValidUuid(courseId) || !isValidUuid(requesterUserId)) {
      throw AppError.badRequest('Invalid UUID format.');
    }
    await this.getCourse(courseId, requesterUserId);

    const nodes = Array.from(this.academicNodes.values()).filter(
      (n) => n.courseId === courseId && n.userId === requesterUserId && n.type === 'topic',
    );

    return nodes.map((node) => {
      const key = `${requesterUserId}_${node.id}`;
      const existing = this.topicStudyStates.get(key);
      if (existing) return existing;
      const now = new Date();
      return {
        id: crypto.randomUUID(),
        userId: requesterUserId,
        courseId,
        topicId: node.id,
        state: 'not_started',
        lastStudiedAt: null,
        lastReviewedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  async setTopicStudyState(
    courseId: string,
    topicId: string,
    requesterUserId: string,
    state: StudyStateValue,
    eventType?: StudyEventType,
    metadata?: Record<string, unknown> | null,
  ): Promise<{ studyState: TopicStudyState; event: StudyEvent }> {
    if (!isValidUuid(courseId) || !isValidUuid(topicId) || !isValidUuid(requesterUserId)) {
      throw AppError.badRequest('Invalid UUID format.');
    }
    await this.getCourse(courseId, requesterUserId);

    const node = this.academicNodes.get(topicId);
    if (!node) {
      throw AppError.notFound('Topic node not found.');
    }
    assertOwnership(node.userId, requesterUserId, 'AcademicNode');
    if (node.courseId !== courseId) {
      throw AppError.badRequest('Topic does not belong to the requested course.');
    }

    const key = `${requesterUserId}_${topicId}`;
    const existing = this.topicStudyStates.get(key);
    const now = new Date();

    let lastStudiedAt = existing?.lastStudiedAt ?? null;
    let lastReviewedAt = existing?.lastReviewedAt ?? null;

    if (state === 'learning') {
      lastStudiedAt = now;
    } else if (state === 'reviewed') {
      lastReviewedAt = now;
      lastStudiedAt = now;
    }

    const studyState: TopicStudyState = {
      id: existing?.id || crypto.randomUUID(),
      userId: requesterUserId,
      courseId,
      topicId,
      state,
      lastStudiedAt,
      lastReviewedAt,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.topicStudyStates.set(key, studyState);

    const effectiveEventType: StudyEventType =
      eventType ||
      (state === 'reviewed'
        ? 'reviewed'
        : state === 'needs_review'
          ? 'marked_needs_review'
          : state === 'learning'
            ? 'study_started'
            : 'state_changed');

    const event: StudyEvent = {
      id: crypto.randomUUID(),
      userId: requesterUserId,
      courseId,
      topicId,
      type: effectiveEventType,
      occurredAt: now,
      metadata: metadata || null,
      createdAt: now,
    };
    this.studyEvents.set(event.id, event);

    return { studyState, event };
  }

  async recordStudyEvent(
    courseId: string,
    topicId: string,
    requesterUserId: string,
    type: StudyEventType,
    metadata?: Record<string, unknown> | null,
  ): Promise<{ studyState: TopicStudyState; event: StudyEvent }> {
    let targetState: StudyStateValue = 'learning';
    if (type === 'reviewed') {
      targetState = 'reviewed';
    } else if (type === 'marked_needs_review') {
      targetState = 'needs_review';
    } else if (type === 'study_completed') {
      targetState = 'learning';
    }

    return this.setTopicStudyState(courseId, topicId, requesterUserId, targetState, type, metadata);
  }

  async listStudyEvents(
    courseId: string,
    topicId: string,
    requesterUserId: string,
  ): Promise<StudyEvent[]> {
    if (!isValidUuid(courseId) || !isValidUuid(topicId) || !isValidUuid(requesterUserId)) {
      throw AppError.badRequest('Invalid UUID format.');
    }
    await this.getCourse(courseId, requesterUserId);

    const node = this.academicNodes.get(topicId);
    if (!node) {
      throw AppError.notFound('Topic node not found.');
    }
    assertOwnership(node.userId, requesterUserId, 'AcademicNode');
    if (node.courseId !== courseId) {
      throw AppError.badRequest('Topic does not belong to the requested course.');
    }

    return Array.from(this.studyEvents.values())
      .filter((e) => e.topicId === topicId && e.userId === requesterUserId)
      .reverse()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  }

  async deleteUser(id: string): Promise<void> {
    if (!isValidUuid(id)) {
      throw AppError.badRequest('Invalid user ID format.');
    }
    const user = this.users.get(id);
    if (!user) {
      throw AppError.notFound('User not found.');
    }
    this.users.delete(id);

    // Cascade delete courses (which cascades assessments and unlinks resources)
    for (const [cId, course] of this.courses.entries()) {
      if (course.userId === id) {
        this.courses.delete(cId);
      }
    }
    for (const [aId, assessment] of this.assessments.entries()) {
      if (assessment.userId === id) {
        this.assessments.delete(aId);
      }
    }
    for (const [rId, resource] of this.resources.entries()) {
      if (resource.userId === id) {
        this.resources.delete(rId);
        await this.deleteChunksByResource(rId);
      }
    }
    for (const [nId, node] of this.academicNodes.entries()) {
      if (node.userId === id) {
        this.academicNodes.delete(nId);
      }
    }
  }

  // --- Role Families ---
  async ensureInitialRoleFamilies(names: readonly string[]): Promise<void> {
    const now = new Date();
    for (const name of names) {
      const exists = Array.from(this.roleFamilies.values()).some((rf) => rf.name === name);
      if (!exists) {
        const id = crypto.randomUUID();
        this.roleFamilies.set(id, {
          id,
          name,
          description: `Career family for ${name}`,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  async listRoleFamilies(): Promise<RoleFamily[]> {
    return Array.from(this.roleFamilies.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getRoleFamily(id: string): Promise<RoleFamily | null> {
    return this.roleFamilies.get(id) || null;
  }

  // --- Companies ---
  async listCompanies(): Promise<Company[]> {
    return Array.from(this.companies.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCompany(id: string): Promise<Company | null> {
    return this.companies.get(id) || null;
  }

  async createCompany(data: {
    name: string;
    slug: string;
    websiteUrl?: string | null;
    description?: string | null;
    industry?: string | null;
    isVerified?: boolean;
  }): Promise<Company> {
    const id = crypto.randomUUID();
    const now = new Date();
    const comp: Company = {
      id,
      name: data.name,
      slug: data.slug,
      websiteUrl: data.websiteUrl ?? null,
      description: data.description ?? null,
      industry: data.industry ?? null,
      isVerified: data.isVerified ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.companies.set(id, comp);
    return comp;
  }

  async ensureVerifiedCompanies(seeds: readonly VerifiedCompanySeed[]): Promise<void> {
    const now = new Date();
    for (const s of seeds) {
      const existing = Array.from(this.companies.values()).find((c) => c.slug === s.slug);
      if (!existing) {
        const id = crypto.randomUUID();
        this.companies.set(id, {
          id,
          name: s.name,
          slug: s.slug,
          websiteUrl: s.websiteUrl,
          description: s.description,
          industry: s.industry,
          isVerified: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // --- Skills ---
  async listSkills(category?: string): Promise<Skill[]> {
    const all = Array.from(this.skills.values());
    if (category) {
      return all
        .filter((s) => s.category === category)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSkill(id: string): Promise<Skill | null> {
    return this.skills.get(id) || null;
  }

  async createSkill(data: {
    name: string;
    category?: Skill['category'];
    synonyms?: string[];
  }): Promise<Skill> {
    const id = crypto.randomUUID();
    const now = new Date();
    const skill: Skill = {
      id,
      name: data.name,
      category: data.category || 'concept',
      synonyms: data.synonyms || [],
      createdAt: now,
      updatedAt: now,
    };
    this.skills.set(id, skill);
    return skill;
  }

  // --- Opportunities ---
  async listOpportunities(filters?: {
    roleFamilyId?: string;
    opportunityType?: string;
    status?: string;
    companyId?: string;
  }): Promise<Opportunity[]> {
    let list = Array.from(this.opportunities.values());
    if (filters?.roleFamilyId) {
      list = list.filter((o) => o.roleFamilyId === filters.roleFamilyId);
    }
    if (filters?.opportunityType) {
      list = list.filter((o) => o.opportunityType === filters.opportunityType);
    }
    if (filters?.status) {
      list = list.filter((o) => o.status === filters.status);
    }
    if (filters?.companyId) {
      list = list.filter((o) => o.companyId === filters.companyId);
    }
    return list.sort((a, b) => b.retrievalTimestamp.getTime() - a.retrievalTimestamp.getTime());
  }

  async getOpportunity(id: string): Promise<Opportunity | null> {
    return this.opportunities.get(id) || null;
  }

  async findOpportunityBySourceUrl(sourceUrl: string): Promise<Opportunity | null> {
    for (const opp of this.opportunities.values()) {
      if (opp.sourceUrl === sourceUrl) {
        return opp;
      }
    }
    return null;
  }

  async updateOpportunity(id: string, data: Partial<Opportunity>): Promise<Opportunity> {
    const existing = this.opportunities.get(id);
    if (!existing) {
      throw AppError.notFound(`Opportunity ${id} not found.`);
    }
    const updated: Opportunity = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.opportunities.set(id, updated);
    return updated;
  }

  async deleteOpportunity(id: string): Promise<void> {
    this.opportunities.delete(id);
  }

  async createOpportunity(
    data: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<Opportunity> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const opp: Opportunity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.opportunities.set(id, opp);
    return opp;
  }

  async getOpportunityRequirements(opportunityId: string): Promise<OpportunityRequirement[]> {
    return Array.from(this.opportunityRequirements.values()).filter(
      (r) => r.opportunityId === opportunityId,
    );
  }

  async getOpportunitySkillRequirements(
    opportunityId: string,
  ): Promise<Array<OpportunitySkillRequirement & { skill?: Skill }>> {
    const reqs = Array.from(this.opportunitySkillRequirements.values()).filter(
      (r) => r.opportunityId === opportunityId,
    );
    return reqs.map((r) => {
      const s = this.skills.get(r.skillId);
      return {
        ...r,
        ...(s ? { skill: s } : {}),
      };
    });
  }

  async getOpportunityLocations(opportunityId: string): Promise<OpportunityLocation[]> {
    return Array.from(this.opportunityLocations.values()).filter(
      (l) => l.opportunityId === opportunityId,
    );
  }

  async getOpportunityProgramRules(opportunityId: string): Promise<OpportunityProgramRule[]> {
    return Array.from(this.opportunityProgramRules.values()).filter(
      (p) => p.opportunityId === opportunityId,
    );
  }

  async getOpportunitySources(opportunityId: string): Promise<OpportunitySource[]> {
    return Array.from(this.opportunitySources.values()).filter(
      (s) => s.opportunityId === opportunityId,
    );
  }

  async createOpportunityRequirement(
    data: Omit<OpportunityRequirement, 'id' | 'createdAt'>,
  ): Promise<OpportunityRequirement> {
    const id = crypto.randomUUID();
    const req: OpportunityRequirement = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.opportunityRequirements.set(id, req);
    return req;
  }

  async createOpportunitySkillRequirement(
    data: Omit<OpportunitySkillRequirement, 'id' | 'createdAt'>,
  ): Promise<OpportunitySkillRequirement> {
    const id = crypto.randomUUID();
    const req: OpportunitySkillRequirement = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.opportunitySkillRequirements.set(id, req);
    return req;
  }

  async createOpportunityLocation(
    data: Omit<OpportunityLocation, 'id' | 'createdAt'>,
  ): Promise<OpportunityLocation> {
    const id = crypto.randomUUID();
    const loc: OpportunityLocation = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.opportunityLocations.set(id, loc);
    return loc;
  }

  async createOpportunityProgramRule(
    data: Omit<OpportunityProgramRule, 'id' | 'createdAt'>,
  ): Promise<OpportunityProgramRule> {
    const id = crypto.randomUUID();
    const rule: OpportunityProgramRule = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.opportunityProgramRules.set(id, rule);
    return rule;
  }

  async createOpportunitySource(
    data: Omit<OpportunitySource, 'id' | 'createdAt'>,
  ): Promise<OpportunitySource> {
    const id = crypto.randomUUID();
    const src: OpportunitySource = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.opportunitySources.set(id, src);
    return src;
  }

  // --- Student Career Profile ---
  async getStudentCareerProfile(userId: string): Promise<StudentCareerProfile | null> {
    return this.studentCareerProfiles.get(userId) || null;
  }

  async upsertStudentCareerProfile(
    userId: string,
    data: StudentCareerProfileInput,
  ): Promise<StudentCareerProfile> {
    const existing = this.studentCareerProfiles.get(userId);
    const now = new Date();
    if (!existing) {
      const profile: StudentCareerProfile = {
        id: crypto.randomUUID(),
        userId,
        targetCareerPath: data.targetCareerPath ?? null,
        targetGeography: data.targetGeography ?? [],
        targetRecruitingPeriod: data.targetRecruitingPeriod ?? null,
        degreeLevel: data.degreeLevel ?? null,
        major: data.major ?? null,
        university: data.university ?? null,
        graduationYear: data.graduationYear ?? null,
        graduationMonth: data.graduationMonth ?? null,
        currentYearOfStudy: data.currentYearOfStudy ?? null,
        isEnrolled: data.isEnrolled ?? true,
        workAuthorization: data.workAuthorization ?? null,
        gpa: data.gpa ?? null,
        yearsExperience: data.yearsExperience ?? '0.0',
        createdAt: now,
        updatedAt: now,
      };
      this.studentCareerProfiles.set(userId, profile);
      return profile;
    } else {
      const updated: StudentCareerProfile = {
        id: existing.id,
        userId: existing.userId,
        targetCareerPath:
          data.targetCareerPath !== undefined
            ? (data.targetCareerPath ?? null)
            : existing.targetCareerPath,
        targetGeography:
          data.targetGeography !== undefined ? data.targetGeography : existing.targetGeography,
        targetRecruitingPeriod:
          data.targetRecruitingPeriod !== undefined
            ? (data.targetRecruitingPeriod ?? null)
            : existing.targetRecruitingPeriod,
        degreeLevel:
          data.degreeLevel !== undefined ? (data.degreeLevel ?? null) : existing.degreeLevel,
        major: data.major !== undefined ? (data.major ?? null) : existing.major,
        university: data.university !== undefined ? (data.university ?? null) : existing.university,
        graduationYear:
          data.graduationYear !== undefined
            ? (data.graduationYear ?? null)
            : existing.graduationYear,
        graduationMonth:
          data.graduationMonth !== undefined
            ? (data.graduationMonth ?? null)
            : existing.graduationMonth,
        currentYearOfStudy:
          data.currentYearOfStudy !== undefined
            ? (data.currentYearOfStudy ?? null)
            : existing.currentYearOfStudy,
        isEnrolled: data.isEnrolled !== undefined ? data.isEnrolled : existing.isEnrolled,
        workAuthorization:
          data.workAuthorization !== undefined
            ? (data.workAuthorization ?? null)
            : existing.workAuthorization,
        gpa: data.gpa !== undefined ? (data.gpa ?? null) : existing.gpa,
        yearsExperience:
          data.yearsExperience !== undefined
            ? (data.yearsExperience ?? '0.0')
            : existing.yearsExperience,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      this.studentCareerProfiles.set(userId, updated);
      return updated;
    }
  }

  // --- Student Target Roles ---
  async listStudentTargetRoles(
    userId: string,
  ): Promise<Array<StudentTargetRole & { roleFamily?: RoleFamily }>> {
    const roles = Array.from(this.studentTargetRoles.values()).filter((r) => r.userId === userId);
    return roles
      .map((r) => {
        const rf = this.roleFamilies.get(r.roleFamilyId);
        return {
          ...r,
          ...(rf ? { roleFamily: rf } : {}),
        };
      })
      .sort((a, b) => a.priority - b.priority);
  }

  async addStudentTargetRole(
    userId: string,
    roleFamilyId: string,
    priority = 1,
  ): Promise<StudentTargetRole> {
    const existingKey = Array.from(this.studentTargetRoles.entries()).find(
      ([, r]) => r.userId === userId && r.roleFamilyId === roleFamilyId,
    );
    if (existingKey) {
      const updated = { ...existingKey[1], priority };
      this.studentTargetRoles.set(existingKey[0], updated);
      return updated;
    }
    const id = crypto.randomUUID();
    const record: StudentTargetRole = {
      id,
      userId,
      roleFamilyId,
      priority,
      createdAt: new Date(),
    };
    this.studentTargetRoles.set(id, record);
    return record;
  }

  async removeStudentTargetRole(userId: string, roleFamilyId: string): Promise<void> {
    for (const [id, r] of this.studentTargetRoles.entries()) {
      if (r.userId === userId && r.roleFamilyId === roleFamilyId) {
        this.studentTargetRoles.delete(id);
      }
    }
  }

  // --- Student Target Companies ---
  async listStudentTargetCompanies(
    userId: string,
  ): Promise<Array<StudentTargetCompany & { company?: Company }>> {
    const targets = Array.from(this.studentTargetCompanies.values()).filter(
      (c) => c.userId === userId,
    );
    return targets
      .map((t) => {
        const comp = this.companies.get(t.companyId);
        return {
          ...t,
          ...(comp ? { company: comp } : {}),
        };
      })
      .sort((a, b) => a.priority - b.priority);
  }

  async addStudentTargetCompany(
    userId: string,
    companyId: string,
    priority = 1,
    notes?: string | null,
  ): Promise<StudentTargetCompany> {
    const existingKey = Array.from(this.studentTargetCompanies.entries()).find(
      ([, c]) => c.userId === userId && c.companyId === companyId,
    );
    if (existingKey) {
      const updated = { ...existingKey[1], priority, notes: notes ?? null };
      this.studentTargetCompanies.set(existingKey[0], updated);
      return updated;
    }
    const id = crypto.randomUUID();
    const record: StudentTargetCompany = {
      id,
      userId,
      companyId,
      priority,
      notes: notes ?? null,
      createdAt: new Date(),
    };
    this.studentTargetCompanies.set(id, record);
    return record;
  }

  async removeStudentTargetCompany(userId: string, companyId: string): Promise<void> {
    for (const [id, c] of this.studentTargetCompanies.entries()) {
      if (c.userId === userId && c.companyId === companyId) {
        this.studentTargetCompanies.delete(id);
      }
    }
  }

  // --- Student Skill Evidence ---
  async listStudentSkillEvidence(userId: string): Promise<
    Array<
      StudentSkillEvidence & {
        skill?: Skill;
        course?: Course | null;
        academicNode?: AcademicNode | null;
      }
    >
  > {
    const list = Array.from(this.studentSkillEvidence.values()).filter((e) => e.userId === userId);
    return list.map((e) => {
      const s = this.skills.get(e.skillId);
      const c = e.courseId ? this.courses.get(e.courseId) || null : null;
      const n = e.academicNodeId ? this.academicNodes.get(e.academicNodeId) || null : null;
      return {
        ...e,
        ...(s ? { skill: s } : {}),
        course: c,
        academicNode: n,
      };
    });
  }

  async createStudentSkillEvidence(
    data: Omit<StudentSkillEvidence, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<StudentSkillEvidence> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const evidence: StudentSkillEvidence = {
      ...data,
      id,
      assessmentId: data.assessmentId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.studentSkillEvidence.set(id, evidence);
    return evidence;
  }

  async upsertStudentSkillEvidence(
    data: Omit<StudentSkillEvidence, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<StudentSkillEvidence> {
    const rankMap: Record<string, number> = {
      verified: 5,
      strongly_demonstrated: 4,
      demonstrated: 3,
      weak: 2,
      claimed: 1,
      unknown: 0,
    };

    const existing = Array.from(this.studentSkillEvidence.values()).find(
      (e) => e.userId === data.userId && e.skillId === data.skillId,
    );

    if (existing) {
      const curRank = rankMap[existing.evidenceLevel] ?? 0;
      const newRank = rankMap[data.evidenceLevel] ?? 0;

      if (newRank >= curRank) {
        const updated: StudentSkillEvidence = {
          ...existing,
          evidenceLevel: data.evidenceLevel,
          evidenceSource: data.evidenceSource,
          academicNodeId: data.academicNodeId ?? existing.academicNodeId,
          courseId: data.courseId ?? existing.courseId,
          assessmentId:
            (data.assessmentId !== undefined ? data.assessmentId : existing.assessmentId) ?? null,
          title: data.title,
          description: data.description ?? existing.description,
          confidenceScore: data.confidenceScore,
          updatedAt: new Date(),
        };
        this.studentSkillEvidence.set(existing.id, updated);
        return updated;
      }
      return existing;
    }

    return this.createStudentSkillEvidence(data);
  }

  async deleteStudentSkillEvidence(id: string, userId: string): Promise<void> {
    const ev = this.studentSkillEvidence.get(id);
    if (ev && ev.userId === userId) {
      this.studentSkillEvidence.delete(id);
    }
  }

  async listAssessmentsForUser(userId: string): Promise<Assessment[]> {
    return Array.from(this.assessments.values()).filter((a) => a.userId === userId);
  }

  async listAllAcademicNodesForUser(userId: string): Promise<AcademicNode[]> {
    return Array.from(this.academicNodes.values()).filter((n) => n.userId === userId);
  }

  // --- Student Saved Opportunities ---
  async listStudentSavedOpportunities(userId: string): Promise<
    Array<
      StudentSavedOpportunity & {
        opportunity?: Opportunity & { company?: Company; roleFamily?: RoleFamily };
      }
    >
  > {
    const list = Array.from(this.studentSavedOpportunities.values()).filter(
      (s) => s.userId === userId,
    );
    return list
      .map((s) => {
        let oppWithRelations:
          (Opportunity & { company?: Company; roleFamily?: RoleFamily }) | undefined = undefined;
        if (s.opportunityId) {
          const opp = this.opportunities.get(s.opportunityId);
          if (opp) {
            const comp = this.companies.get(opp.companyId);
            const rf = this.roleFamilies.get(opp.roleFamilyId);
            oppWithRelations = {
              ...opp,
              ...(comp ? { company: comp } : {}),
              ...(rf ? { roleFamily: rf } : {}),
            };
          }
        }
        return {
          ...s,
          ...(oppWithRelations ? { opportunity: oppWithRelations } : {}),
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getStudentSavedOpportunity(
    id: string,
    userId: string,
  ): Promise<StudentSavedOpportunity | null> {
    const saved = this.studentSavedOpportunities.get(id);
    if (!saved || saved.userId !== userId) return null;
    return saved;
  }

  async createStudentSavedOpportunity(
    userId: string,
    data: StudentSavedOpportunityInput,
  ): Promise<StudentSavedOpportunity> {
    const now = new Date();
    const id = crypto.randomUUID();
    const record: StudentSavedOpportunity = {
      id,
      userId,
      opportunityId: data.opportunityId ?? null,
      customTitle: data.customTitle ?? null,
      customCompany: data.customCompany ?? null,
      sourceUrl: data.sourceUrl ?? null,
      notes: data.notes ?? null,
      status: data.status ?? 'saved',
      createdAt: now,
      updatedAt: now,
    };
    this.studentSavedOpportunities.set(id, record);
    return record;
  }

  async updateStudentSavedOpportunity(
    id: string,
    userId: string,
    updates: Partial<StudentSavedOpportunityInput>,
  ): Promise<StudentSavedOpportunity> {
    const existing = await this.getStudentSavedOpportunity(id, userId);
    if (!existing) {
      throw AppError.notFound('Saved opportunity not found.');
    }
    const updated: StudentSavedOpportunity = {
      ...existing,
      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.customTitle !== undefined ? { customTitle: updates.customTitle } : {}),
      ...(updates.customCompany !== undefined ? { customCompany: updates.customCompany } : {}),
      ...(updates.sourceUrl !== undefined ? { sourceUrl: updates.sourceUrl } : {}),
      updatedAt: new Date(),
    };
    this.studentSavedOpportunities.set(id, updated);
    return updated;
  }

  async deleteStudentSavedOpportunity(id: string, userId: string): Promise<void> {
    const existing = await this.getStudentSavedOpportunity(id, userId);
    if (!existing) {
      throw AppError.notFound('Saved opportunity not found.');
    }
    this.studentSavedOpportunities.delete(id);
  }

  // --- Concept Skill Mappings ---
  async listConceptSkillMappings(conceptName?: string): Promise<ConceptSkillMapping[]> {
    const all = Array.from(this.conceptMappings.values());
    if (!conceptName) return all;
    return all.filter((m) => m.conceptName.toLowerCase().includes(conceptName.toLowerCase()));
  }

  async createConceptSkillMapping(
    data: Omit<ConceptSkillMapping, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ConceptSkillMapping> {
    const now = new Date();
    const id = crypto.randomUUID();
    const record: ConceptSkillMapping = {
      id,
      conceptName: data.conceptName,
      skillName: data.skillName,
      skillCategory: data.skillCategory,
      relevanceScore: data.relevanceScore,
      provenance: data.provenance,
      createdAt: now,
      updatedAt: now,
    };
    this.conceptMappings.set(id, record);
    return record;
  }

  async ensureInitialConceptSkillMappings(
    mappings: readonly ConceptSkillMappingSeed[],
  ): Promise<void> {
    const now = new Date();
    for (const m of mappings) {
      const exists = Array.from(this.conceptMappings.values()).some(
        (cm) =>
          cm.conceptName.toLowerCase() === m.conceptName.toLowerCase() &&
          cm.skillName.toLowerCase() === m.skillName.toLowerCase(),
      );
      if (!exists) {
        const id = crypto.randomUUID();
        this.conceptMappings.set(id, {
          id,
          conceptName: m.conceptName,
          skillName: m.skillName,
          skillCategory: m.skillCategory,
          relevanceScore: m.relevanceScore,
          provenance: m.provenance,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // --- Application Records ---
  async listApplicationRecords(userId: string): Promise<
    Array<
      ApplicationRecord & {
        opportunity?: Opportunity & { company?: Company; roleFamily?: RoleFamily };
      }
    >
  > {
    const list = Array.from(this.applicationRecords.values()).filter((a) => a.userId === userId);
    return list
      .map((a) => {
        const opp = this.opportunities.get(a.opportunityId);
        let oppWithRelations:
          (Opportunity & { company?: Company; roleFamily?: RoleFamily }) | undefined = undefined;
        if (opp) {
          const comp = this.companies.get(opp.companyId);
          const rf = this.roleFamilies.get(opp.roleFamilyId);
          oppWithRelations = {
            ...opp,
            ...(comp ? { company: comp } : {}),
            ...(rf ? { roleFamily: rf } : {}),
          };
        }
        return {
          ...a,
          ...(oppWithRelations ? { opportunity: oppWithRelations } : {}),
        };
      })
      .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime());
  }

  async getApplicationRecord(id: string, userId: string): Promise<ApplicationRecord | null> {
    const rec = this.applicationRecords.get(id);
    if (!rec || rec.userId !== userId) return null;
    return rec;
  }

  async createApplicationRecord(
    userId: string,
    opportunityId: string,
    notes?: string | null,
  ): Promise<ApplicationRecord> {
    const now = new Date();
    const id = crypto.randomUUID();
    const rec: ApplicationRecord = {
      id,
      userId,
      opportunityId,
      status: 'applied',
      appliedAt: now,
      assessmentAt: null,
      interviewAt: null,
      finalInterviewAt: null,
      outcomeAt: null,
      outcomeNotes: notes ?? null,
      stateTransitions: [
        {
          from: 'applied',
          to: 'applied',
          timestamp: now.toISOString(),
          notes: notes ?? 'Application initiated by student',
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.applicationRecords.set(id, rec);
    return rec;
  }

  async updateApplicationStatus(
    id: string,
    userId: string,
    newStatus: ApplicationStatus,
    notes?: string | null,
  ): Promise<ApplicationRecord> {
    const existing = await this.getApplicationRecord(id, userId);
    if (!existing) {
      throw AppError.notFound('Application record not found.');
    }
    const now = new Date();
    const updatedTransitions = [
      ...existing.stateTransitions,
      {
        from: existing.status,
        to: newStatus,
        timestamp: now.toISOString(),
        notes: notes ?? null,
      },
    ];

    const updated: ApplicationRecord = {
      ...existing,
      status: newStatus,
      stateTransitions: updatedTransitions,
      updatedAt: now,
      ...(newStatus === 'assessment' && !existing.assessmentAt ? { assessmentAt: now } : {}),
      ...(newStatus === 'interview' && !existing.interviewAt ? { interviewAt: now } : {}),
      ...(newStatus === 'final_interview' && !existing.finalInterviewAt
        ? { finalInterviewAt: now }
        : {}),
      ...(newStatus === 'offer' || newStatus === 'rejection' || newStatus === 'withdrawn'
        ? { outcomeAt: now, outcomeNotes: notes ?? existing.outcomeNotes }
        : {}),
    };

    this.applicationRecords.set(id, updated);
    return updated;
  }

  // Prediction Snapshots
  async createPredictionSnapshot(snapshot: PredictionSnapshot): Promise<PredictionSnapshot> {
    this.predictionSnapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  async getPredictionSnapshot(id: string): Promise<PredictionSnapshot | null> {
    return this.predictionSnapshots.get(id) ?? null;
  }

  async listPredictionSnapshots(
    userId: string,
    opportunityId?: string,
  ): Promise<PredictionSnapshot[]> {
    return Array.from(this.predictionSnapshots.values()).filter((s) => {
      if (s.userId !== userId) return false;
      if (opportunityId && s.opportunityId !== opportunityId) return false;
      return true;
    });
  }

  // Opportunity Snapshots
  async createOpportunitySnapshot(snapshot: OpportunitySnapshot): Promise<OpportunitySnapshot> {
    this.opportunitySnapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  async getOpportunitySnapshot(id: string): Promise<OpportunitySnapshot | null> {
    return this.opportunitySnapshots.get(id) ?? null;
  }

  async listOpportunitySnapshots(opportunityId: string): Promise<OpportunitySnapshot[]> {
    return Array.from(this.opportunitySnapshots.values()).filter(
      (s) => s.opportunityId === opportunityId,
    );
  }

  // Model Registry
  async createModelRegistryEntry(entry: ModelRegistryEntry): Promise<ModelRegistryEntry> {
    this.modelRegistryEntries.set(entry.modelVersion, entry);
    return entry;
  }

  async getModelRegistryEntry(modelVersion: string): Promise<ModelRegistryEntry | null> {
    return this.modelRegistryEntries.get(modelVersion) ?? null;
  }

  async listModelRegistryEntries(filter?: {
    approvalStatus?: ModelApprovalStatus;
    target?: OutcomeTarget;
  }): Promise<ModelRegistryEntry[]> {
    return Array.from(this.modelRegistryEntries.values()).filter((entry) => {
      if (filter?.approvalStatus && entry.approvalStatus !== filter.approvalStatus) return false;
      if (filter?.target && entry.target !== filter.target) return false;
      return true;
    });
  }

  async updateModelApprovalStatus(
    modelVersion: string,
    status: ModelApprovalStatus,
    approvedBy?: string | null,
  ): Promise<ModelRegistryEntry> {
    const existing = this.modelRegistryEntries.get(modelVersion);
    if (!existing) {
      throw AppError.notFound(`Model version ${modelVersion} not found in registry.`);
    }

    const updated: ModelRegistryEntry = {
      ...existing,
      approvalStatus: status,
      approvedTimestamp:
        status === 'approved' ? new Date().toISOString() : existing.approvedTimestamp,
      approvedBy: status === 'approved' ? (approvedBy ?? null) : existing.approvedBy,
    };

    this.modelRegistryEntries.set(modelVersion, updated);
    return updated;
  }

  // Model Cards
  async createModelCard(card: ModelCard): Promise<ModelCard> {
    this.modelCards.set(card.modelVersion, card);
    return card;
  }

  async getModelCard(modelVersion: string): Promise<ModelCard | null> {
    return this.modelCards.get(modelVersion) ?? null;
  }

  clear(): void {
    this.users.clear();
    this.courses.clear();
    this.assessments.clear();
    this.resources.clear();
    this.chunks.clear();
    this.academicNodes.clear();
    this.companies.clear();
    this.skills.clear();
    this.opportunities.clear();
    this.opportunityRequirements.clear();
    this.opportunitySkillRequirements.clear();
    this.opportunityLocations.clear();
    this.opportunityProgramRules.clear();
    this.opportunitySources.clear();
    this.studentCareerProfiles.clear();
    this.studentTargetRoles.clear();
    this.studentTargetCompanies.clear();
    this.studentSkillEvidence.clear();
    this.studentSavedOpportunities.clear();
    this.conceptMappings.clear();
    this.applicationRecords.clear();
    this.roleFamilies.clear();
    this.predictionSnapshots.clear();
    this.opportunitySnapshots.clear();
    this.modelRegistryEntries.clear();
    this.modelCards.clear();
    this.seedInitialRoleFamilies();
    this.seedVerifiedCompanies();
    this.seedConceptSkillMappings();
    this.seedCanonicalSkills();
  }
}

import { PostgresDataStore } from '@campusflow/database';

export function createStore(): DataStore {
  if (process.env['NODE_ENV'] !== 'test' && process.env['DATABASE_URL']) {
    return new PostgresDataStore(process.env['DATABASE_URL']) as unknown as DataStore;
  }
  return new InMemoryDataStore();
}

export const defaultStore: DataStore = createStore();
