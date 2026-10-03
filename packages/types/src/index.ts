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

export type AssessmentType = 'CAT' | 'FAT' | 'Quiz' | 'Assignment' | 'Lab' | 'Other';

export interface Assessment {
  id: string;
  userId: string; // Strict owner
  courseId: string;
  title: string;
  type: AssessmentType;
  date: Date | null;
  weightage: string | null; // e.g. "15.00"
  createdAt: Date;
  updatedAt: Date;
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
