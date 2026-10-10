/**
 * CampusFlow Core Domain Types
 */

// ==========================================
// 1. Identity & Users
// ==========================================

export type UserRole = 'student' | 'admin';

export interface User {
  id: string; // Internal UUID
  clerkId: string; // External Clerk user ID
  email: string;
  fullName: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  userId: string; // Internal UUID mapped from Clerk
  clerkUserId: string;
  email: string;
  role: UserRole;
}

export interface OwnershipContext {
  userId: string;
}

// ==========================================
// 2. Academic Entities (MVP Core)
// ==========================================

export type SyllabusStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface Course {
  id: string;
  userId: string; // Strict owner
  code: string; // e.g. "CSE2001"
  title: string; // e.g. "Computer Organization & Architecture"
  term: string | null; // e.g. "Fall 2026"
  syllabusStatus: SyllabusStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type AssessmentType = 'CAT' | 'FAT' | 'Quiz' | 'Assignment' | 'Project' | 'Lab' | 'Other';
export type AssessmentStatus = 'upcoming' | 'completed' | 'cancelled';
export type AssessmentTopicSource = 'user' | 'syllabus' | 'question_paper' | 'inferred';

export interface Assessment {
  id: string;
  userId: string; // Strict owner
  courseId: string;
  title: string;
  type: AssessmentType;
  date: Date | null;
  totalMarks?: number | null | undefined;
  weightage?: string | null | undefined; // e.g. "15.00"
  status: AssessmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssessmentTopicLink {
  id: string;
  assessmentId: string;
  topicId: string;
  userId: string;
  courseId: string;
  weight?: number | null | undefined;
  source: AssessmentTopicSource;
  notes?: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssessmentLinkedTopic {
  linkId: string;
  topicId: string;
  topicTitle: string;
  parentModuleId?: string | null | undefined;
  parentModuleTitle?: string | null | undefined;
  weight?: number | null | undefined;
  source: AssessmentTopicSource;
  notes?: string | null | undefined;
}

export interface AssessmentWithTopics extends Assessment {
  topics?: AssessmentLinkedTopic[];
  topicCount?: number;
}

export type ResourceType = 'syllabus' | 'lecture_notes' | 'question_bank' | 'reference_material';
export type ResourceProcessingStatus =
  'created' | 'upload_pending' | 'uploaded' | 'queued' | 'processing' | 'ready' | 'failed';

export interface Resource {
  id: string;
  userId: string; // Strict owner
  courseId: string | null;
  title: string;
  type: ResourceType;
  objectKey: string; // S3 storage key
  mimeType: string;
  sizeBytes: number | null;
  contentHash?: string | null;
  pageCount?: number | null;
  errorMessage?: string | null;
  failedAt?: Date | null;
  processedAt?: Date | null;
  extractionVersion?: string;
  processingStatus: ResourceProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceChunk {
  id: string;
  resourceId: string;
  userId: string;
  courseId: string | null;
  sequence: number;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  charCount: number;
  tokenCount: number | null;
  extractionVersion: string;
  chunkingVersion: string;
  createdAt: Date;
}

export type AcademicNodeType = 'module' | 'chapter' | 'topic';
export type NodeOrigin = 'model' | 'user';

export interface AcademicNode {
  id: string;
  courseId: string;
  userId: string;
  parentId?: string | null | undefined;
  type: AcademicNodeType;
  title: string;
  description?: string | null | undefined;
  orderIndex: number;
  origin: NodeOrigin;
  confidence?: number | null | undefined;
  needsReview: 'yes' | 'no';
  createdAt: Date;
  updatedAt: Date;
}

export interface AcademicNodeResourceLink {
  id: string;
  nodeId: string;
  resourceId: string;
  userId: string;
  courseId: string;
  pageStart?: number | null | undefined;
  pageEnd?: number | null | undefined;
  relevanceSummary?: string | null | undefined;
  origin: NodeOrigin;
  createdAt: Date;
  updatedAt: Date;
}

export interface AcademicNodeLinkedResource {
  linkId: string;
  resourceId: string;
  resourceTitle: string;
  resourceType: string;
  pageStart?: number | null | undefined;
  pageEnd?: number | null | undefined;
  origin: NodeOrigin;
}

export type StudyStateValue = 'not_started' | 'learning' | 'needs_review' | 'reviewed';

export type StudyEventType =
  'study_started' | 'study_completed' | 'reviewed' | 'marked_needs_review' | 'state_changed';

export interface TopicStudyState {
  id: string;
  userId: string;
  courseId: string;
  topicId: string;
  state: StudyStateValue;
  lastStudiedAt: Date | null;
  lastReviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudyEvent {
  id: string;
  userId: string;
  courseId: string;
  topicId: string;
  type: StudyEventType;
  occurredAt: Date;
  metadata?: Record<string, unknown> | null | undefined;
  createdAt: Date;
}

export interface AcademicNodeWithResources extends AcademicNode {
  resources?: AcademicNodeLinkedResource[];
  studyState?: TopicStudyState | null | undefined;
}

export interface SearchResultItem {
  resourceId: string;
  resourceTitle: string;
  chunkId: string;
  pageStart: number | null;
  pageEnd: number | null;
  matchedText: string;
  rank: number;
  citation: string;
  courseId: string | null;
}

export interface SearchQueryResponse {
  query: string;
  totalResults: number;
  results: SearchResultItem[];
}

export interface FileValidationResult {
  isValid: boolean;
  detectedMimeType: string;
  fileExtension: string;
  sizeBytes: number;
  normalizedFileName: string;
  contentHash: string;
  error?: string | null;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  charCount: number;
}

export interface DocumentExtractionResult {
  text: string;
  pages: ExtractedPage[];
  pageCount: number;
  extractionVersion: string;
  hasExtractableText: boolean;
  metadata?: Record<string, unknown>;
}

export interface ChunkingOptions {
  targetChunkSize?: number;
  chunkOverlap?: number;
  minChunkSize?: number;
}

// ==========================================
// 3. AI Provider Abstraction Contracts
// ==========================================

export type AiTaskType =
  'extraction' | 'reasoning' | 'generation' | 'classification' | 'agent_orchestration';

export interface AiExtractionRequest {
  systemPrompt?: string;
  content: string;
  targetSchemaName: string;
}

export interface AiReasoningRequest {
  systemPrompt?: string;
  problem: string;
  context: string[];
}

export interface AiReasoningResponse {
  reasoningSteps: string[];
  conclusion: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AiGenerationRequest {
  systemPrompt?: string;
  prompt: string;
  citationsRequired: boolean;
  contextChunks: Array<{ id: string; content: string; sourceTitle: string }>;
}

export interface AiGenerationResponse {
  content: string;
  citations: Array<{ chunkId: string; sourceTitle: string; snippet: string }>;
}

export interface AiClassificationRequest {
  input: string;
  categories: string[];
}

export interface AiClassificationResponse {
  category: string;
  confidence: number;
}

// ==========================================
// 4. ML Service Contracts (No fake metrics)
// ==========================================

export interface MlQuestionClassificationRequest {
  questionText: string;
}

export interface MlQuestionClassificationResponse {
  bloomLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  questionType: 'mcq' | 'derivation' | 'numerical' | 'conceptual';
  difficulty: 'introductory' | 'intermediate' | 'advanced';
  confidence: number;
}

export interface MlMasteryEstimateRequest {
  studentId: string;
  topicId: string;
  evidenceItems: Array<{
    itemId: string;
    isCorrect: boolean;
    attemptTimestamp: string;
  }>;
}

export interface MlMasteryEstimateResponse {
  topicId: string;
  masteryBand: 1 | 2 | 3 | 4 | 5;
  sampleSize: number;
  insufficientData: boolean;
  confidenceInterval: [number, number];
}

// ==========================================
// 5. Notifications Infrastructure
// ==========================================

export type NotificationPriority = 'low' | 'standard' | 'high' | 'urgent';

export type NotificationLifecycleState =
  | 'created'
  | 'scheduled'
  | 'attempted'
  | 'delivered'
  | 'opened'
  | 'action_taken'
  | 'suppressed'
  | 'failed';

export interface NotificationIntent {
  id: string;
  userId: string;
  dedupeKey: string;
  priority: NotificationPriority;
  state: NotificationLifecycleState;
  title: string;
  body: string;
  actionUrl?: string;
  scheduledFor: Date;
  attemptedAt?: Date;
  deliveredAt?: Date;
  suppressionReason?: 'focus_mode' | 'quiet_hours' | 'duplicate';
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ==========================================
// 6. Audit System
// ==========================================

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  capability: string;
  resourceType: string;
  resourceId?: string | null | undefined;
  allowed: boolean;
  denialReason?: string | null | undefined;
  payloadHash?: string | null | undefined;
  agentRunId?: string | null | undefined;
  requestId?: string | null | undefined;
  correlationId?: string | null | undefined;
  result?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  clientIp?: string | null | undefined;
}

// ==========================================
// 7. Background Job Types
// ==========================================

export type JobQueueName =
  | 'ingestion'
  | 'extraction'
  | 'chunking'
  | 'embedding'
  | 'document-processing'
  | 'resource-processing'
  | 'mock-generation'
  | 'replanning'
  | 'reminders';

export interface BaseJobPayload {
  jobId: string;
  userId: string;
  idempotencyKey: string;
  timestamp: string;
}

export interface IngestionJobPayload extends BaseJobPayload {
  resourceId: string;
  objectKey: string;
  mimeType: string;
}

export interface MockGenerationJobPayload extends BaseJobPayload {
  assessmentId: string;
  targetTopics: string[];
}

export interface ReplanJobPayload extends BaseJobPayload {
  planId: string;
  missedSessionIds: string[];
}

export interface ReminderJobPayload extends BaseJobPayload {
  notificationIntentId: string;
}

export type JobOutboxStatus =
  'pending' | 'dispatched' | 'running' | 'completed' | 'failed' | 'stale';

export interface JobOutboxRecord {
  id: string;
  queueName: JobQueueName;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: JobOutboxStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string | null | undefined;
  lockedAt?: Date | null | undefined;
  lockedBy?: string | null | undefined;
  scheduledAt: Date;
  completedAt?: Date | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// 8. Opportunity Intelligence Types
// ==========================================

export const INITIAL_ROLE_FAMILIES = [
  'Software Engineering',
  'AI/ML Engineering',
  'ML Systems',
  'Infrastructure',
  'Distributed Systems',
  'Cloud',
  'Cybersecurity',
  'Data Engineering',
  'Research Engineering',
  'Quantitative Software Engineering',
  'Quantitative Research',
  'Quantitative Trading',
  'Finance Technology',
  'Data Science',
  'Technology Consulting',
  'Analytics Consulting',
] as const;

export type RoleFamilyName = (typeof INITIAL_ROLE_FAMILIES)[number];

export interface Company {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  description: string | null;
  industry?: string | null;
  isVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VerifiedCompanySeed {
  name: string;
  slug: string;
  websiteUrl: string;
  industry: string;
  description: string;
}

export const VERIFIED_COMPANIES_SEED: readonly VerifiedCompanySeed[] = [
  // Technology
  {
    name: 'Google',
    slug: 'google',
    websiteUrl: 'https://careers.google.com',
    industry: 'Technology',
    description: 'Global technology leader specializing in search, cloud, AI, and systems.',
  },
  {
    name: 'Microsoft',
    slug: 'microsoft',
    websiteUrl: 'https://careers.microsoft.com',
    industry: 'Technology',
    description: 'Enterprise software, cloud platforms, gaming, and systems software.',
  },
  {
    name: 'Amazon',
    slug: 'amazon',
    websiteUrl: 'https://amazon.jobs',
    industry: 'Technology',
    description: 'Cloud infrastructure (AWS), distributed systems, e-commerce, and AI.',
  },
  {
    name: 'Apple',
    slug: 'apple',
    websiteUrl: 'https://jobs.apple.com',
    industry: 'Technology',
    description: 'Consumer hardware, operating systems, embedded software, and silicon.',
  },
  {
    name: 'Meta',
    slug: 'meta',
    websiteUrl: 'https://metacareers.com',
    industry: 'Technology',
    description:
      'Social technology, distributed infrastructure, AI research, and computing platforms.',
  },
  {
    name: 'NVIDIA',
    slug: 'nvidia',
    websiteUrl: 'https://nvidia.com/careers',
    industry: 'Technology / AI',
    description: 'Accelerated computing, GPU hardware, CUDA, and AI platforms.',
  },
  {
    name: 'Databricks',
    slug: 'databricks',
    websiteUrl: 'https://databricks.com/company/careers',
    industry: 'Technology / Data',
    description: 'Lakehouse platform, data engineering, distributed systems, and Spark.',
  },
  {
    name: 'Adobe',
    slug: 'adobe',
    websiteUrl: 'https://careers.adobe.com',
    industry: 'Technology',
    description:
      'Creative software, digital media platforms, document systems, and cloud services.',
  },
  {
    name: 'Atlassian',
    slug: 'atlassian',
    websiteUrl: 'https://atlassian.com/company/careers',
    industry: 'Technology',
    description: 'Collaboration tools, developer infrastructure, and enterprise workflow products.',
  },
  {
    name: 'Uber',
    slug: 'uber',
    websiteUrl: 'https://uber.com/careers',
    industry: 'Technology / Mobility',
    description:
      'Real-time distributed systems, logistics, routing algorithms, and high-scale backend services.',
  },

  // AI/ML
  {
    name: 'OpenAI',
    slug: 'openai',
    websiteUrl: 'https://openai.com/careers',
    industry: 'AI/ML',
    description: 'Frontier AI research and deployment organization.',
  },
  {
    name: 'Anthropic',
    slug: 'anthropic',
    websiteUrl: 'https://anthropic.com/careers',
    industry: 'AI/ML',
    description: 'AI research and safety company focused on foundational models.',
  },

  // Finance
  {
    name: 'JPMorgan Chase',
    slug: 'jpmorgan-chase',
    websiteUrl: 'https://careers.jpmorgan.com',
    industry: 'Finance',
    description:
      'Global financial services institution with extensive software engineering and tech infrastructure.',
  },
  {
    name: 'Goldman Sachs',
    slug: 'goldman-sachs',
    websiteUrl: 'https://goldmansachs.com/careers',
    industry: 'Finance',
    description: 'Global investment banking, securities, and financial technology engineering.',
  },
  {
    name: 'Morgan Stanley',
    slug: 'morgan-stanley',
    websiteUrl: 'https://morganstanley.com/careers',
    industry: 'Finance',
    description: 'Financial technology, wealth management systems, and high-frequency platforms.',
  },

  // Quantitative Finance
  {
    name: 'Jane Street',
    slug: 'jane-street',
    websiteUrl: 'https://janestreet.com/join-jane-street',
    industry: 'Quantitative Finance',
    description:
      'Quantitative trading and tech firm driven by functional programming and low-latency systems.',
  },
  {
    name: 'Citadel',
    slug: 'citadel',
    websiteUrl: 'https://citadel.com/careers',
    industry: 'Quantitative Finance',
    description:
      'Alternative investment manager and market maker employing quantitative research and high-performance computing.',
  },
  {
    name: 'Two Sigma',
    slug: 'two-sigma',
    websiteUrl: 'https://twosigma.com/careers',
    industry: 'Quantitative Finance',
    description:
      'Financial sciences firm applying data science, distributed computing, and machine learning to markets.',
  },

  // Consulting
  {
    name: 'McKinsey & Company',
    slug: 'mckinsey',
    websiteUrl: 'https://mckinsey.com/careers',
    industry: 'Consulting',
    description: 'Global management and digital technology consulting.',
  },
  {
    name: 'Boston Consulting Group',
    slug: 'bcg',
    websiteUrl: 'https://careers.bcg.com',
    industry: 'Consulting',
    description: 'Management consulting, analytics, and digital technology advisory.',
  },
  {
    name: 'Bain & Company',
    slug: 'bain',
    websiteUrl: 'https://bain.com/careers',
    industry: 'Consulting',
    description:
      'Global consultancy specializing in business strategy, digital transformation, and advanced analytics.',
  },
] as const;

export interface RoleFamily {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type OpportunityType = 'internship' | 'early_career' | 'co_op' | 'new_grad';
export type EmploymentType = 'full_time' | 'internship' | 'contract';
export type WorkplaceType = 'onsite' | 'hybrid' | 'remote';
export type OpportunityStatus = 'active' | 'closed' | 'expired' | 'draft';
export type WorkAuthRequirement =
  'us_citizen_or_pr' | 'sponsorship_available' | 'no_sponsorship' | 'any';

export interface Opportunity {
  id: string;
  companyId: string;
  roleFamilyId: string;
  title: string;
  opportunityType: OpportunityType;
  targetGraduationYears: number[]; // e.g. [2026, 2027]
  degreeLevels: string[]; // e.g. ["bachelors", "masters"]
  allowedMajors: string[]; // e.g. ["Computer Science", "Engineering"]
  description: string | null;
  season: string | null; // e.g. "Summer 2027"
  employmentType: EmploymentType;
  workplaceType: WorkplaceType;
  status: OpportunityStatus;
  minGpa: string | null;
  minExperienceMonths: number;
  requiresWorkAuth: WorkAuthRequirement;
  // Provenance fields
  sourceUrl: string;
  sourceOrganization: string;
  retrievalTimestamp: Date;
  publicationDate: Date | null;
  expirationDate: Date | null;
  lastValidTimestamp: Date | null;
  extractionVersion: string;
  contentHash?: string | null;
  ingestionProvider?: string;
  isCanonical?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RequirementCategory =
  | 'degree'
  | 'major'
  | 'graduation_year'
  | 'internship_eligibility'
  | 'location'
  | 'work_auth'
  | 'coursework'
  | 'experience'
  | 'skill'
  | 'general';

export interface OpportunityRequirement {
  id: string;
  opportunityId: string;
  category: RequirementCategory;
  description: string;
  isMandatory: boolean;
  parsedRule?: Record<string, unknown> | null;
  createdAt: Date;
}

export type SkillCategory =
  'language' | 'framework' | 'concept' | 'tool' | 'domain' | 'infrastructure';

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  synonyms: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type SkillRequirementType = 'required' | 'preferred' | 'bonus';
export type SkillProficiencyLevel = 'basic' | 'proficient' | 'advanced';

export interface OpportunitySkillRequirement {
  id: string;
  opportunityId: string;
  skillId: string;
  requirementType: SkillRequirementType;
  minProficiency: SkillProficiencyLevel;
  importanceWeight: string; // numeric(4, 2) e.g. "1.00"
  notes: string | null;
  createdAt: Date;
}

export interface OpportunityLocation {
  id: string;
  opportunityId: string;
  city: string | null;
  stateProvince: string | null;
  country: string;
  isRemote: boolean;
  createdAt: Date;
}

export interface OpportunityProgramRule {
  id: string;
  opportunityId: string;
  ruleType: string;
  ruleValue: Record<string, unknown>;
  explanation: string | null;
  createdAt: Date;
}

export interface OpportunitySource {
  id: string;
  opportunityId: string;
  sourceUrl: string;
  sourceType: string;
  retrievedAt: Date;
  rawPayload?: Record<string, unknown> | null;
  hash: string | null;
  createdAt: Date;
}

export interface StudentCareerProfile {
  id: string;
  userId: string;
  targetCareerPath: string | null;
  targetGeography: string[];
  targetRecruitingPeriod: string | null;
  degreeLevel: string | null;
  major: string | null;
  university: string | null;
  graduationYear: number | null;
  graduationMonth: number | null;
  currentYearOfStudy: number | null;
  isEnrolled: boolean;
  workAuthorization: string | null;
  gpa: string | null;
  yearsExperience: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentCareerProfileInput {
  targetCareerPath?: string | null | undefined;
  targetGeography?: string[] | undefined;
  targetRecruitingPeriod?: string | null | undefined;
  degreeLevel?: string | null | undefined;
  major?: string | null | undefined;
  university?: string | null | undefined;
  graduationYear?: number | null | undefined;
  graduationMonth?: number | null | undefined;
  currentYearOfStudy?: number | null | undefined;
  isEnrolled?: boolean | undefined;
  workAuthorization?: string | null | undefined;
  gpa?: string | null | undefined;
  yearsExperience?: string | null | undefined;
}

export interface StudentTargetRole {
  id: string;
  userId: string;
  roleFamilyId: string;
  priority: number;
  createdAt: Date;
}

export interface StudentTargetCompany {
  id: string;
  userId: string;
  companyId: string;
  priority: number;
  notes: string | null;
  createdAt: Date;
}

export type SkillEvidenceLevel =
  'verified' | 'strongly_demonstrated' | 'demonstrated' | 'weak' | 'claimed' | 'unknown';

export type SkillEvidenceSource =
  | 'academic_course'
  | 'course_topic'
  | 'assessment'
  | 'project'
  | 'research'
  | 'competition_hackathon'
  | 'work_experience'
  | 'self_reported';

export interface StudentSkillEvidence {
  id: string;
  userId: string;
  skillId: string;
  evidenceLevel: SkillEvidenceLevel;
  evidenceSource: SkillEvidenceSource;
  academicNodeId: string | null;
  courseId: string | null;
  assessmentId?: string | null | undefined;
  title: string;
  description: string | null;
  artifactUrl: string | null;
  verifiedAt: Date | null;
  confidenceScore: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ApplicationStatus =
  'applied' | 'assessment' | 'interview' | 'final_interview' | 'offer' | 'rejection' | 'withdrawn';

export interface ApplicationStateTransition {
  from: ApplicationStatus;
  to: ApplicationStatus;
  timestamp: string;
  notes?: string | null;
}

export interface ApplicationRecord {
  id: string;
  userId: string;
  opportunityId: string;
  status: ApplicationStatus;
  appliedAt: Date;
  assessmentAt: Date | null;
  interviewAt: Date | null;
  finalInterviewAt: Date | null;
  outcomeAt: Date | null;
  outcomeNotes: string | null;
  stateTransitions: ApplicationStateTransition[];
  createdAt: Date;
  updatedAt: Date;
}

// Student Saved Opportunities (Strict User Ownership)
export type SavedOpportunityStatus = 'saved' | 'researching' | 'archived';

export interface StudentSavedOpportunity {
  id: string;
  userId: string;
  opportunityId: string | null;
  customTitle: string | null;
  customCompany: string | null;
  sourceUrl: string | null;
  notes: string | null;
  status: SavedOpportunityStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentSavedOpportunityInput {
  opportunityId?: string | null | undefined;
  customTitle?: string | null | undefined;
  customCompany?: string | null | undefined;
  sourceUrl?: string | null | undefined;
  notes?: string | null | undefined;
  status?: SavedOpportunityStatus | undefined;
}

// Concept Skill Mappings (Academic Brain -> Career Skill)
export interface ConceptSkillMapping {
  id: string;
  conceptName: string;
  skillName: string;
  skillCategory: SkillCategory;
  relevanceScore: string;
  provenance: 'canonical_curated' | 'model_inferred' | 'verified_academic';
  createdAt: Date;
  updatedAt: Date;
}

export interface ConceptSkillMappingSeed {
  conceptName: string;
  skillName: string;
  skillCategory: SkillCategory;
  relevanceScore: string;
  provenance: 'canonical_curated' | 'model_inferred' | 'verified_academic';
}

export const CANONICAL_CONCEPT_SKILL_MAPPINGS: readonly ConceptSkillMappingSeed[] = [
  // Algorithms / DSA
  {
    conceptName: 'data structures',
    skillName: 'Algorithms',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'dsa',
    skillName: 'Algorithms',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'graph algorithms',
    skillName: 'Algorithms',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'dynamic programming',
    skillName: 'Algorithms',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'sorting and searching',
    skillName: 'Algorithms',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'asymptotic analysis',
    skillName: 'Algorithms',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },

  // Distributed Systems & Concurrency
  {
    conceptName: 'distributed systems',
    skillName: 'Distributed Systems',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'consensus algorithms',
    skillName: 'Distributed Systems',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'raft',
    skillName: 'Distributed Systems',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'concurrency',
    skillName: 'Concurrency',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'multithreading',
    skillName: 'Concurrency',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'synchronization primitives',
    skillName: 'Concurrency',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },

  // Networking
  {
    conceptName: 'computer networks',
    skillName: 'Networking',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'tcp/ip',
    skillName: 'Networking',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'socket programming',
    skillName: 'Networking',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'http protocol',
    skillName: 'Networking',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },

  // Operating Systems
  {
    conceptName: 'operating systems',
    skillName: 'Operating Systems',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'virtual memory',
    skillName: 'Operating Systems',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'process scheduling',
    skillName: 'Operating Systems',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'file systems',
    skillName: 'Operating Systems',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },

  // Databases
  {
    conceptName: 'database management systems',
    skillName: 'Databases',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'relational databases',
    skillName: 'Databases',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'sql',
    skillName: 'Databases',
    skillCategory: 'language',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'database indexing',
    skillName: 'Databases',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'transaction acid properties',
    skillName: 'Databases',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },

  // Mathematics & Quantitative Reasoning
  {
    conceptName: 'linear algebra',
    skillName: 'Mathematics',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'multivariable calculus',
    skillName: 'Mathematics',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'discrete mathematics',
    skillName: 'Mathematics',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'probability and statistics',
    skillName: 'Quantitative Reasoning',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'bayesian inference',
    skillName: 'Quantitative Reasoning',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'stochastic processes',
    skillName: 'Quantitative Reasoning',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },

  // Machine Learning & AI
  {
    conceptName: 'machine learning',
    skillName: 'Machine Learning',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'deep learning',
    skillName: 'Machine Learning',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'transformers',
    skillName: 'Machine Learning',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'neural networks',
    skillName: 'Machine Learning',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'natural language processing',
    skillName: 'Machine Learning',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'computer vision',
    skillName: 'Machine Learning',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },

  // Cloud & DevOps
  {
    conceptName: 'cloud computing',
    skillName: 'Cloud & DevOps',
    skillCategory: 'infrastructure',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'docker',
    skillName: 'Cloud & DevOps',
    skillCategory: 'tool',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'kubernetes',
    skillName: 'Cloud & DevOps',
    skillCategory: 'infrastructure',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'ci/cd pipelines',
    skillName: 'Cloud & DevOps',
    skillCategory: 'tool',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },

  // Cybersecurity
  {
    conceptName: 'cryptography',
    skillName: 'Cybersecurity',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'network security',
    skillName: 'Cybersecurity',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
  {
    conceptName: 'application security',
    skillName: 'Cybersecurity',
    skillCategory: 'concept',
    relevanceScore: '1.00',
    provenance: 'canonical_curated',
  },
] as const;

// Ingestion & Provider Abstraction Types
export interface RawOpportunityPayload {
  externalId?: string | undefined;
  sourceUrl: string;
  sourceOrganization: string;
  title: string;
  companyName: string;
  companySlug?: string | undefined;
  roleFamilyName?: string | undefined;
  description?: string | null | undefined;
  opportunityType?: OpportunityType | undefined;
  targetGraduationYears?: number[] | undefined;
  degreeLevels?: string[] | undefined;
  allowedMajors?: string[] | undefined;
  season?: string | null | undefined;
  employmentType?: EmploymentType | undefined;
  workplaceType?: WorkplaceType | undefined;
  minGpa?: string | null | undefined;
  minExperienceMonths?: number | undefined;
  requiresWorkAuth?: WorkAuthRequirement | undefined;
  publicationDate?: Date | string | null | undefined;
  expirationDate?: Date | string | null | undefined;
  extractionVersion?: string | undefined;
  locations?:
    | Array<{
        city?: string | null | undefined;
        stateProvince?: string | null | undefined;
        country: string;
        isRemote: boolean;
      }>
    | undefined;
  requirements?:
    | Array<{
        category: RequirementCategory;
        description: string;
        isMandatory: boolean;
        parsedRule?: Record<string, unknown> | null | undefined;
      }>
    | undefined;
  skills?:
    | Array<{
        name: string;
        category?: SkillCategory | undefined;
        requirementType: SkillRequirementType;
        importanceWeight?: string | undefined;
        minProficiency?: SkillProficiencyLevel | undefined;
      }>
    | undefined;
  rawJson?: Record<string, unknown> | undefined;
}

export interface NormalizedOpportunity {
  title: string;
  companySlug: string;
  companyName: string;
  roleFamilyName: string;
  opportunityType: OpportunityType;
  targetGraduationYears: number[];
  degreeLevels: string[];
  allowedMajors: string[];
  description: string | null;
  season: string | null;
  employmentType: EmploymentType;
  workplaceType: WorkplaceType;
  status: OpportunityStatus;
  minGpa: string | null;
  minExperienceMonths: number;
  requiresWorkAuth: WorkAuthRequirement;
  sourceUrl: string;
  sourceOrganization: string;
  publicationDate: Date | null;
  expirationDate: Date | null;
  contentHash: string;
  extractionVersion: string;
  ingestionProvider: string;
  isCanonical: boolean;
  locations: Array<{
    city: string | null;
    stateProvince: string | null;
    country: string;
    isRemote: boolean;
  }>;
  requirements: Array<{
    category: RequirementCategory;
    description: string;
    isMandatory: boolean;
    parsedRule?: Record<string, unknown> | null;
  }>;
  skills: Array<{
    name: string;
    category?: SkillCategory;
    requirementType: SkillRequirementType;
    importanceWeight: string;
    minProficiency: SkillProficiencyLevel;
  }>;
  rawJson?: Record<string, unknown> | undefined;
}

export interface OpportunityUpsertResult {
  action: 'created' | 'updated' | 'unchanged' | 'expired';
  status?: 'created' | 'updated' | 'unchanged' | 'expired' | undefined;
  opportunityId: string;
  contentHash: string;
  title: string;
  companyName: string;
}

export interface OpportunityLandscapeSummary {
  totalDiscovered: number;
  eligibleCount: number;
  strongMatchesCount: number;
  preparationRequiredCount: number;
  ineligibleCount: number;
}

export interface OpportunityProvider {
  readonly name: string;
  readonly organization: string;
  fetchOpportunities(options?: { since?: Date; limit?: number }): Promise<RawOpportunityPayload[]>;
  normalizeOpportunity(raw: RawOpportunityPayload): NormalizedOpportunity;
  extractRequirements(normalized: NormalizedOpportunity): {
    requirements: NormalizedOpportunity['requirements'];
    skills: NormalizedOpportunity['skills'];
  };
  calculateContentHash(payload: unknown): string;
  detectChangedOrExpired(
    existing: Opportunity,
    incomingHash: string,
    incomingData: NormalizedOpportunity,
  ): { changed: boolean; expired: boolean };
}

// Eligibility and Matching result types
export type EligibilityStatus = 'eligible' | 'likely_eligible' | 'uncertain' | 'not_eligible';

export interface EligibilityCriterionResult {
  criterion: string;
  status: 'pass' | 'fail' | 'uncertain';
  detail: string;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  reasons: string[];
  criteria: EligibilityCriterionResult[];
}

export interface RoleMatchResult {
  score: number; // 0 - 100
  supportingEvidence: string[];
  gaps: string[];
  evidenceConfidence: 'high' | 'medium' | 'low';
  disclaimer: string;
}

export interface CalibrationMetrics {
  brierScore: number;
  logLoss: number;
  rocAuc?: number | undefined;
  prAuc?: number | undefined;
  calibrationError?: number | undefined; // Expected Calibration Error (ECE)
  validationPopulation: string;
  evaluationDate: string;
  isOutOfTimeValidation: boolean;
}

export interface UncertaintyInterval {
  lower: number; // e.g. 0.08
  upper: number; // e.g. 0.16
  confidenceLevel: number; // e.g. 0.95 (95% CI)
}

export interface ProbabilityIntegrityMetadata {
  modelVersion: string;
  trainingDatasetVersion: string;
  trainingDateRange: {
    start: string;
    end: string;
  };
  predictionDate: string;
  populationDefinition: string;
  opportunityRoleContext: {
    roleTitle: string;
    companyName?: string | undefined;
    opportunityType: string;
  };
  comparableSampleSize: number;
  observedPositiveOutcomes: number;
  uncertaintyInterval: UncertaintyInterval;
  calibrationMetrics: CalibrationMetrics;
  featureSnapshot: Record<string, unknown>;
  predictionProvenance: {
    pipelineVersion: string;
    inputDataHash: string;
    calculatedBy: string;
  };
  knownLimitations: string[];
}

export type ProbabilityPredictionStatus = 'calculated' | 'unavailable';

export interface CalculatedProbabilityPrediction {
  status: 'calculated';
  probability: number; // 0.00 to 1.00
  metadata: ProbabilityIntegrityMetadata;
  unobservedFactors: string[];
  evidenceTraceability: Array<{
    factor: string;
    studentEvidenceRef?: string | undefined;
    influence: string;
  }>;
  disclaimer: string;
}

export interface UnavailableProbabilityPrediction {
  status: 'unavailable';
  reason: 'insufficient_comparable_outcomes' | 'uncalibrated_model' | 'insufficient_features';
  message: string; // "Probability unavailable: insufficient comparable outcome data."
  comparableSampleSize: number;
  minimumRequiredSampleSize: number;
  unobservedFactors: string[];
  disclaimer: string;
}

export type ProbabilityPrediction =
  CalculatedProbabilityPrediction | UnavailableProbabilityPrediction;

export interface OpportunityEvaluation {
  opportunityId: string;
  eligibility: EligibilityResult;
  roleMatch: RoleMatchResult;
  hiringProbability: ProbabilityPrediction;
  evaluatedAt: string;
}

export interface ActionOptimizerItem {
  skillId: string;
  skillName: string;
  category: SkillCategory;
  impact: 'high' | 'medium' | 'low';
  targetOpportunitiesCount: number;
  currentEvidenceLevel: SkillEvidenceLevel | 'none';
  recommendedAction: string;
  academicConnection?:
    | {
        courseId?: string | undefined;
        courseCode?: string | undefined;
        nodeId?: string | undefined;
        nodeTitle?: string | undefined;
      }
    | undefined;
}

// ==========================================
// Prediction & Opportunity Snapshot Contracts
// ==========================================

export interface PredictionSnapshot {
  id: string;
  userId: string;
  opportunityId: string;
  snapshotTimestamp: string;
  educationSnapshot: {
    degreeLevel: string | null;
    major: string | null;
    university: string | null;
    currentYearOfStudy: number | null;
    gpa: string | null;
    isEnrolled: boolean;
    workAuthorization: string | null;
  };
  graduationTiming: {
    graduationYear: number | null;
    graduationMonth: number | null;
  };
  academicEvidenceSnapshot: Array<{
    id: string;
    courseId?: string | null | undefined;
    academicNodeId?: string | null | undefined;
    title: string;
    grade?: string | null | undefined;
    verifiedAt?: string | null | undefined;
  }>;
  skillEvidenceSnapshot: Array<{
    id: string;
    skillId: string;
    skillName?: string | undefined;
    evidenceLevel: SkillEvidenceLevel;
    evidenceSource: SkillEvidenceSource;
    confidenceScore: number;
    title: string;
    verifiedAt?: string | null | undefined;
  }>;
  projectEvidenceSnapshot: Array<{
    id: string;
    title: string;
    description?: string | null | undefined;
    artifactUrl?: string | null | undefined;
  }>;
  experienceSnapshot: {
    yearsExperience: string;
  };
  targetContext: {
    targetCareerPath?: string | null | undefined;
    targetGeography: string[];
    targetRecruitingPeriod?: string | null | undefined;
  };
  applicationContext?: Record<string, unknown> | null | undefined;
  contentHash: string;
  createdAt: string;
}

export interface OpportunitySnapshot {
  id: string;
  opportunityId: string;
  snapshotTimestamp: string;
  company: {
    id: string;
    name: string;
    slug: string;
  };
  role: {
    title: string;
    opportunityType: OpportunityType;
    season: string | null;
    employmentType: EmploymentType;
    workplaceType: WorkplaceType;
  };
  roleFamily: {
    id: string;
    name: string;
    slug?: string | undefined;
  };
  eligibilityRules: {
    targetGraduationYears: number[];
    degreeLevels: string[];
    allowedMajors: string[];
    minGpa: string | null;
    requiresWorkAuth: string;
  };
  requiredSkills: Array<{
    skillId: string;
    skillName?: string | undefined;
    requirementType: SkillRequirementType;
    importanceWeight: string;
    minProficiency: SkillProficiencyLevel;
  }>;
  preferredSkills: Array<{
    skillId: string;
    skillName?: string | undefined;
    requirementType: SkillRequirementType;
    importanceWeight: string;
    minProficiency: SkillProficiencyLevel;
  }>;
  programRules: Array<{
    ruleType: string;
    ruleValue: Record<string, unknown> | string;
  }>;
  sourceProvenance: {
    sourceUrl: string;
    sourceOrganization: string;
    retrievalTimestamp: string;
    extractionVersion: string;
  };
  contentHash: string;
  createdAt: string;
}

// ==========================================
// Modeling Targets & Outcome Dataset Types
// ==========================================

export type OutcomeTarget =
  | 'application_to_assessment'
  | 'assessment_to_interview'
  | 'interview_to_final'
  | 'final_to_offer'
  | 'application_to_offer';

export interface OutcomeDefinition {
  target: OutcomeTarget;
  startStage: string;
  successStage: string;
  observationWindowDays: number;
  censoringRules: string[];
  missingOutcomeBehavior: 'treat_as_censored' | 'exclude';
  description: string;
}

export interface OutcomeTrainingExample {
  id: string;
  predictionSnapshotId: string;
  opportunitySnapshotId: string;
  applicationTimestamp: string;
  outcomeTimestamp: string | null;
  stageTransitions: Array<{
    fromStage: string;
    toStage: string;
    timestamp: string;
    notes?: string | undefined;
  }>;
  finalOutcome: 'offer' | 'rejected' | 'withdrawn' | 'censored' | 'in_progress';
  outcomeHorizonDays: number;
  roleFamily: string;
  company: string;
  geography: string;
  graduationCohort: number;
  targetLabel: 0 | 1 | null; // null if censored/excluded
}

export interface PopulationDefinition {
  country: string;
  roleFamily: string;
  roleType: string;
  graduationCohort: number;
  source: string;
  parentPopulation?: string | null | undefined;
  formatted: string;
}

export interface DatasetSpecification {
  datasetVersion: string;
  extractionVersion: string;
  generationTimestamp: string;
  target: OutcomeTarget;
  sourcePopulation: PopulationDefinition;
  filteringRules: Record<string, unknown>;
  featureSchema: Record<string, string>;
  numRows: number;
  totalRows?: number | undefined;
  numPositive: number;
  positiveOutcomes?: number | undefined;
  numNegative: number;
  negativeOutcomes?: number | undefined;
  numCensored: number;
  censoredOutcomes?: number | undefined;
  missingDataSummary: Record<string, number>;
  specificationHash: string;
}

// ==========================================
// Validation & Calibration Infrastructure
// ==========================================

export interface CalibrationBin {
  binIndex: number;
  binLower: number;
  binUpper: number;
  sampleCount: number;
  meanPredicted: number;
  observedFrequency: number;
}

export interface ComprehensiveValidationMetrics {
  brierScore: number;
  logLoss: number;
  rocAuc: number;
  prAuc: number;
  expectedCalibrationError: number;
  calibrationSlope: number;
  calibrationIntercept: number;
  calibrationBins: CalibrationBin[];
  confidenceIntervals: Record<string, { lower: number; upper: number; confidenceLevel: number }>;
  evaluationDate: string;
  validationType: 'temporal_out_of_time' | 'rolling_walk_forward';
  datasetRows: number;
  positiveEvents: number;
}

export interface ReadinessCheckItem {
  passed: boolean;
  metric?: number | string | undefined;
  threshold?: number | string | undefined;
  detail?: string | undefined;
  rationale: string;
}

export interface ModelReadinessAssessment {
  overallReady: boolean;
  modelVersion: string;
  assessedAt: string;
  checks: {
    sampleAdequacy: ReadinessCheckItem;
    eventAdequacy: ReadinessCheckItem;
    temporalValidationStatus: ReadinessCheckItem;
    calibrationStatus: ReadinessCheckItem;
    discriminationStatus: ReadinessCheckItem;
    uncertaintyStatus: ReadinessCheckItem;
    missingDataStatus: ReadinessCheckItem;
    leakageStatus: ReadinessCheckItem;
    populationCoverage: ReadinessCheckItem;
    dataDriftStatus: ReadinessCheckItem;
  };
  blockingReasons: string[];
  approvalsAllowed: boolean;
}

// ==========================================
// Model Registry & Model Cards
// ==========================================

export type ModelApprovalStatus =
  'draft' | 'pending_review' | 'approved' | 'rejected' | 'deprecated';

export interface ModelRegistryEntry {
  id: string;
  modelVersion: string;
  target: OutcomeTarget;
  population: PopulationDefinition;
  datasetVersion: string;
  featureSchemaVersion: string;
  algorithm: string;
  hyperparameters: Record<string, unknown>;
  trainingPeriod: { start: string; end: string };
  validationPeriod: { start: string; end: string };
  testPeriod: { start: string; end: string };
  metrics: Record<string, number>;
  calibrationResults: {
    ece: number;
    brierScore: number;
    slope: number;
    intercept: number;
    bins: CalibrationBin[];
  };
  limitations: string[];
  approvalStatus: ModelApprovalStatus;
  createdTimestamp: string;
  approvedTimestamp: string | null;
  approvedBy: string | null;
}

export interface ModelCard {
  id: string;
  modelVersion: string;
  purpose: string;
  targetPopulation: string;
  trainingData: string;
  validationStrategy: string;
  metrics: Record<string, number>;
  calibration: string;
  limitations: string[];
  knownMissingVariables: string[];
  knownBiasRisks: string[];
  appropriateInterpretation: string;
  inappropriateInterpretation: string;
  publishedAt: string;
}

export interface PredictionTransparencyRecord {
  opportunityId: string;
  prediction: ProbabilityPrediction;
  uncertainty: UncertaintyInterval | null;
  modelVersion: string | null;
  datasetVersion: string | null;
  populationDefinition: string | null;
  featureSnapshot: Record<string, unknown> | null;
  opportunitySnapshot: OpportunitySnapshot | null;
  evidenceProvenance: Array<{
    title: string;
    skillName?: string | undefined;
    evidenceLevel: string;
    evidenceSource: string;
    verifiedAt?: string | null | undefined;
    courseOrNodeTitle?: string | undefined;
  }>;
  comparableSampleSize: number;
  observedPositiveOutcomes: number;
  validationMetrics: Record<string, number> | null;
  calibrationMetrics: Record<string, unknown> | null;
  knownLimitations: string[];
  unobservedFactors: string[];
  modelCard: ModelCard | null;
}
