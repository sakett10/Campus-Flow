import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  numeric,
  bigint,
  integer,
  text,
  jsonb,
  index,
  uniqueIndex,
  customType,
  boolean,
} from 'drizzle-orm/pg-core';

/**
 * Table: users
 *
 * Owner: Self (`id`)
 * Visibility: Private to authenticated user
 * Deletion Behavior: Deletion cascades to all user-owned courses, assessments, resources
 * Indexes:
 *   - users_clerk_id_idx (UNIQUE): maps Clerk identity to internal user
 *   - users_email_idx (UNIQUE): student email uniqueness
 * Uniqueness Rules: One record per Clerk ID; email is unique
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkId: varchar('clerk_id', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 255 }),
    role: varchar('role', { length: 50 }).notNull().default('student'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_clerk_id_idx').on(table.clerkId),
    uniqueIndex('users_email_idx').on(table.email),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/**
 * Table: courses
 *
 * Owner: `user_id` (foreign key -> users.id)
 * Visibility: Private to owning user
 * Deletion Behavior:
 *   - Cascade on users.id deletion
 *   - Deleting a course cascades to child assessments and sets course_id to NULL on linked resources
 * Indexes:
 *   - courses_user_id_idx: fast retrieval of student courses
 *   - courses_user_code_term_idx (UNIQUE): prevents duplicate course code within the same term
 * Uniqueness Rules: (user_id, code, term) must be unique
 */
export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    term: varchar('term', { length: 50 }),
    syllabusStatus: varchar('syllabus_status', { length: 50 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('courses_user_id_idx').on(table.userId),
    uniqueIndex('courses_user_code_term_idx').on(table.userId, table.code, table.term),
  ],
);

export type CourseRow = typeof courses.$inferSelect;
export type NewCourseRow = typeof courses.$inferInsert;

/**
 * Table: assessments
 *
 * Owner: `user_id` (foreign key -> users.id)
 * Associated Course: `course_id` (foreign key -> courses.id)
 * Visibility: Private to owning user
 * Deletion Behavior: Cascade deletion if owning user or associated course is deleted
 * Indexes:
 *   - assessments_user_id_idx: retrieval by student
 *   - assessments_course_id_idx: retrieval by course
 *   - assessments_user_date_idx: chronological queries for upcoming exams/deadlines
 * Uniqueness Rules: Individual assessments are uniquely identified by `id`
 */
export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // CAT, FAT, Quiz, Assignment, etc.
    date: timestamp('date', { withTimezone: true }),
    weightage: numeric('weightage', { precision: 5, scale: 2 }), // e.g. 15.00%
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('assessments_user_id_idx').on(table.userId),
    index('assessments_course_id_idx').on(table.courseId),
    index('assessments_user_date_idx').on(table.userId, table.date),
  ],
);

export type AssessmentRow = typeof assessments.$inferSelect;
export type NewAssessmentRow = typeof assessments.$inferInsert;

/**
 * Table: resources
 *
 * Owner: `user_id` (foreign key -> users.id)
 * Associated Course: `course_id` (foreign key -> courses.id, nullable)
 * Visibility: Private to owning user
 *
 * Deletion Behavior & Rationale:
 *   - Cascade on users.id deletion: When a student closes their account, all resources
 *     and storage objects are purged per PRIVACY.md.
 *   - Set NULL on courses.id deletion: Resources (syllabi, slides, notes, past papers)
 *     represent personal academic assets in the student's second brain. Deleting a course
 *     must NEVER cause accidental loss of the student's files. The resource remains in
 *     the user's library with `course_id = NULL` and can be reassigned.
 *
 * Lifecycle:
 *   created (metadata record created in database)
 *   → upload_pending (signed upload URL minted)
 *   → uploaded (upload verified in S3 storage)
 *   → queued (placed into transactional outbox for processing)
 *   → processing (worker actively extracting text & creating chunks)
 *   → ready (FTS chunks indexed and verified)
 *   or
 *   → failed (extraction error; file remains downloadable, retry allowed)
 *
 * Storage Principle: Stores `object_key` reference only. Never binary files in DB or Git.
 * Indexes:
 *   - resources_user_id_idx: retrieval by student
 *   - resources_course_id_idx: retrieval by course
 *   - resources_user_type_idx: filter by syllabus, notes, question bank
 */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // syllabus, lecture_notes, question_bank, reference_material
    objectKey: varchar('object_key', { length: 512 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    contentHash: varchar('content_hash', { length: 64 }),
    pageCount: integer('page_count'),
    errorMessage: text('error_message'),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    extractionVersion: varchar('extraction_version', { length: 20 }).notNull().default('v1'),
    processingStatus: varchar('processing_status', { length: 50 }).notNull().default('created'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('resources_user_id_idx').on(table.userId),
    index('resources_course_id_idx').on(table.courseId),
    index('resources_user_type_idx').on(table.userId, table.type),
    index('resources_user_content_hash_idx').on(table.userId, table.contentHash),
  ],
);

export type ResourceRow = typeof resources.$inferSelect;
export type NewResourceRow = typeof resources.$inferInsert;

/**
 * Table: resource_chunks
 *
 * Owner: `user_id` (foreign key -> users.id)
 * Associated Resource: `resource_id` (foreign key -> resources.id, cascade on delete)
 * Visibility: Private to owning user
 * Deletion Behavior: Cascades when parent resource or user is deleted
 * Search: Full-Text Search via stored tsvector with GIN index (English)
 */
export const resourceChunks = pgTable(
  'resource_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    sequence: integer('sequence').notNull(),
    content: text('content').notNull(),
    pageStart: integer('page_start'),
    pageEnd: integer('page_end'),
    charCount: integer('char_count').notNull(),
    tokenCount: integer('token_count'),
    extractionVersion: varchar('extraction_version', { length: 20 }).notNull().default('v1'),
    chunkingVersion: varchar('chunking_version', { length: 20 }).notNull().default('v1'),
    searchVector: tsvector('search_vector'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('resource_chunks_resource_seq_idx').on(table.resourceId, table.sequence),
    index('resource_chunks_resource_id_idx').on(table.resourceId),
    index('resource_chunks_user_id_idx').on(table.userId),
    index('resource_chunks_course_id_idx').on(table.courseId),
    index('resource_chunks_search_vector_idx').using('gin', table.searchVector),
  ],
);

export type ResourceChunkRow = typeof resourceChunks.$inferSelect;
export type NewResourceChunkRow = typeof resourceChunks.$inferInsert;

/**
 * Table: academic_nodes
 *
 * Owner: `user_id` (foreign key -> users.id)
 * Associated Course: `course_id` (foreign key -> courses.id, cascade on delete)
 * Parent Node: `parent_id` (self-referencing hierarchical tree: Course -> Module -> Topic)
 * Origin: 'model' (inferred by document processing) or 'user' (user edits override inference)
 */
export const academicNodes = pgTable(
  'academic_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    type: varchar('type', { length: 50 }).notNull(), // module, chapter, topic
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    orderIndex: integer('order_index').notNull().default(0),
    origin: varchar('origin', { length: 50 }).notNull().default('model'), // model, user
    confidence: numeric('confidence', { precision: 4, scale: 3 }).default('0.800'),
    needsReview: varchar('needs_review', { length: 20 }).notNull().default('no'), // yes, no
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('academic_nodes_course_id_idx').on(table.courseId),
    index('academic_nodes_user_id_idx').on(table.userId),
    index('academic_nodes_parent_id_idx').on(table.parentId),
  ],
);

export type AcademicNodeRow = typeof academicNodes.$inferSelect;
export type NewAcademicNodeRow = typeof academicNodes.$inferInsert;

/**
 * Table: job_outbox
 *
 * Transactional Outbox & Durable Job Source of Truth
 *
 * Architecture Role:
 *   - PostgreSQL is the durable system of record for all asynchronous job state and domain state.
 *   - Redis + BullMQ acts strictly as the execution transport and scheduling layer.
 *   - Domain transactions insert business entities and outbox records atomically.
 *
 * Flow:
 *   DB TRANSACTION
 *   → domain change (e.g. resource created)
 *   → durable job_outbox record (status: pending)
 *   → dispatcher
 *   → BullMQ transport
 *   → worker execution
 *   → PostgreSQL result (status: completed/failed)
 *   → audit logging
 *
 * Guarantees:
 *   - Idempotency: Unique constraint on (queue_name, idempotency_key).
 *   - Crash Recovery: Worker leases jobs with locked_at + locked_by. Stale leases (> 5 min)
 *     are reclaimed by the recovery sweeper.
 */
export const jobOutbox = pgTable(
  'job_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    queueName: varchar('queue_name', { length: 50 }).notNull(),
    payload: jsonb('payload').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, dispatched, running, completed, failed, stale
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 255 }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('job_outbox_queue_idempotency_idx').on(table.queueName, table.idempotencyKey),
    index('job_outbox_status_scheduled_idx').on(table.status, table.scheduledAt),
    index('job_outbox_locked_idx').on(table.lockedAt, table.status),
  ],
);

export type JobOutboxRow = typeof jobOutbox.$inferSelect;
export type NewJobOutboxRow = typeof jobOutbox.$inferInsert;

/**
 * =====================================================================
 * OPPORTUNITY INTELLIGENCE FOUNDATION TABLES
 * =====================================================================
 */

/**
 * Table: companies
 * Neutral organization metadata without prestige rankings.
 */
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    websiteUrl: varchar('website_url', { length: 512 }),
    description: text('description'),
    industry: varchar('industry', { length: 100 }),
    isVerified: boolean('is_verified').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('companies_slug_idx').on(table.slug)],
);

export type CompanyRow = typeof companies.$inferSelect;
export type NewCompanyRow = typeof companies.$inferInsert;

/**
 * Table: role_families
 * Standardized job taxonomy without prestige ranking.
 */
export const roleFamilies = pgTable(
  'role_families',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('role_families_name_idx').on(table.name)],
);

export type RoleFamilyRow = typeof roleFamilies.$inferSelect;
export type NewRoleFamilyRow = typeof roleFamilies.$inferInsert;

/**
 * Table: opportunities
 * Real internship and early-career postings with full provenance.
 */
export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    roleFamilyId: uuid('role_family_id')
      .notNull()
      .references(() => roleFamilies.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    opportunityType: varchar('opportunity_type', { length: 50 }).notNull().default('internship'),
    targetGraduationYears: jsonb('target_graduation_years').notNull().default([]),
    degreeLevels: jsonb('degree_levels').notNull().default([]),
    allowedMajors: jsonb('allowed_majors').notNull().default([]),
    description: text('description'),
    season: varchar('season', { length: 100 }),
    employmentType: varchar('employment_type', { length: 50 }).notNull().default('internship'),
    workplaceType: varchar('workplace_type', { length: 50 }).notNull().default('hybrid'),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    minGpa: numeric('min_gpa', { precision: 3, scale: 2 }),
    minExperienceMonths: integer('min_experience_months').notNull().default(0),
    requiresWorkAuth: varchar('requires_work_auth', { length: 50 }).notNull().default('any'),
    // Provenance fields
    sourceUrl: text('source_url').notNull(),
    sourceOrganization: varchar('source_organization', { length: 255 }).notNull(),
    retrievalTimestamp: timestamp('retrieval_timestamp', { withTimezone: true })
      .notNull()
      .defaultNow(),
    publicationDate: timestamp('publication_date', { withTimezone: true }),
    expirationDate: timestamp('expiration_date', { withTimezone: true }),
    lastValidTimestamp: timestamp('last_valid_timestamp', { withTimezone: true }),
    extractionVersion: varchar('extraction_version', { length: 20 }).notNull().default('v1'),
    contentHash: varchar('content_hash', { length: 64 }),
    ingestionProvider: varchar('ingestion_provider', { length: 100 })
      .notNull()
      .default('official_direct'),
    isCanonical: boolean('is_canonical').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunities_company_id_idx').on(table.companyId),
    index('opportunities_role_family_id_idx').on(table.roleFamilyId),
    index('opportunities_status_idx').on(table.status),
    index('opportunities_type_idx').on(table.opportunityType),
    index('opportunities_canonical_idx').on(table.isCanonical),
    index('opportunities_source_url_idx').on(table.sourceUrl),
  ],
);

export type OpportunityRow = typeof opportunities.$inferSelect;
export type NewOpportunityRow = typeof opportunities.$inferInsert;

/**
 * Table: opportunity_requirements
 * Discrete requirements (degree, work authorization, graduation date, etc.).
 */
export const opportunityRequirements = pgTable(
  'opportunity_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 50 }).notNull(),
    description: text('description').notNull(),
    isMandatory: boolean('is_mandatory').notNull().default(true),
    parsedRule: jsonb('parsed_rule'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_requirements_opportunity_id_idx').on(table.opportunityId),
    index('opportunity_requirements_category_idx').on(table.category),
  ],
);

export type OpportunityRequirementRow = typeof opportunityRequirements.$inferSelect;
export type NewOpportunityRequirementRow = typeof opportunityRequirements.$inferInsert;

/**
 * Table: skills
 * Canonical skill dictionary with category and synonyms.
 */
export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    category: varchar('category', { length: 50 }).notNull().default('concept'),
    synonyms: jsonb('synonyms').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('skills_name_idx').on(table.name),
    index('skills_category_idx').on(table.category),
  ],
);

export type SkillRow = typeof skills.$inferSelect;
export type NewSkillRow = typeof skills.$inferInsert;

/**
 * Table: opportunity_skill_requirements
 * Skills required or preferred for an opportunity with importance weights.
 */
export const opportunitySkillRequirements = pgTable(
  'opportunity_skill_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    requirementType: varchar('requirement_type', { length: 50 }).notNull().default('required'),
    minProficiency: varchar('min_proficiency', { length: 50 }).notNull().default('proficient'),
    importanceWeight: numeric('importance_weight', { precision: 4, scale: 2 })
      .notNull()
      .default('1.00'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opp_skill_reqs_opp_id_idx').on(table.opportunityId),
    index('opp_skill_reqs_skill_id_idx').on(table.skillId),
    uniqueIndex('opp_skill_reqs_unique_idx').on(table.opportunityId, table.skillId),
  ],
);

export type OpportunitySkillRequirementRow = typeof opportunitySkillRequirements.$inferSelect;
export type NewOpportunitySkillRequirementRow = typeof opportunitySkillRequirements.$inferInsert;

/**
 * Table: opportunity_locations
 */
export const opportunityLocations = pgTable(
  'opportunity_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    city: varchar('city', { length: 100 }),
    stateProvince: varchar('state_province', { length: 100 }),
    country: varchar('country', { length: 100 }).notNull().default('US'),
    isRemote: boolean('is_remote').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('opp_locations_opp_id_idx').on(table.opportunityId)],
);

export type OpportunityLocationRow = typeof opportunityLocations.$inferSelect;
export type NewOpportunityLocationRow = typeof opportunityLocations.$inferInsert;

/**
 * Table: opportunity_program_rules
 */
export const opportunityProgramRules = pgTable(
  'opportunity_program_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    ruleType: varchar('rule_type', { length: 100 }).notNull(),
    ruleValue: jsonb('rule_value').notNull().default({}),
    explanation: text('explanation'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('opp_program_rules_opp_id_idx').on(table.opportunityId)],
);

export type OpportunityProgramRuleRow = typeof opportunityProgramRules.$inferSelect;
export type NewOpportunityProgramRuleRow = typeof opportunityProgramRules.$inferInsert;

/**
 * Table: opportunity_sources
 */
export const opportunitySources = pgTable(
  'opportunity_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    sourceUrl: text('source_url').notNull(),
    sourceType: varchar('source_type', { length: 50 }).notNull().default('official_ats'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull().defaultNow(),
    rawPayload: jsonb('raw_payload'),
    hash: varchar('hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('opp_sources_opp_id_idx').on(table.opportunityId)],
);

export type OpportunitySourceRow = typeof opportunitySources.$inferSelect;
export type NewOpportunitySourceRow = typeof opportunitySources.$inferInsert;

/**
 * Table: student_career_profiles
 * Private student career preferences and verified academic standing.
 */
export const studentCareerProfiles = pgTable(
  'student_career_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetCareerPath: varchar('target_career_path', { length: 255 }),
    targetGeography: jsonb('target_geography').notNull().default([]),
    targetRecruitingPeriod: varchar('target_recruiting_period', { length: 100 }),
    degreeLevel: varchar('degree_level', { length: 50 }),
    major: varchar('major', { length: 255 }),
    university: varchar('university', { length: 255 }),
    graduationYear: integer('graduation_year'),
    graduationMonth: integer('graduation_month'),
    currentYearOfStudy: integer('current_year_of_study'),
    isEnrolled: boolean('is_enrolled').notNull().default(true),
    workAuthorization: varchar('work_authorization', { length: 100 }),
    gpa: numeric('gpa', { precision: 3, scale: 2 }),
    yearsExperience: numeric('years_experience', { precision: 3, scale: 1 })
      .notNull()
      .default('0.0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('student_career_profiles_user_id_idx').on(table.userId)],
);

export type StudentCareerProfileRow = typeof studentCareerProfiles.$inferSelect;
export type NewStudentCareerProfileRow = typeof studentCareerProfiles.$inferInsert;

/**
 * Table: student_target_roles
 */
export const studentTargetRoles = pgTable(
  'student_target_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleFamilyId: uuid('role_family_id')
      .notNull()
      .references(() => roleFamilies.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('student_target_roles_user_id_idx').on(table.userId),
    uniqueIndex('student_target_roles_unique_idx').on(table.userId, table.roleFamilyId),
  ],
);

export type StudentTargetRoleRow = typeof studentTargetRoles.$inferSelect;
export type NewStudentTargetRoleRow = typeof studentTargetRoles.$inferInsert;

/**
 * Table: student_target_companies
 */
export const studentTargetCompanies = pgTable(
  'student_target_companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(1),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('student_target_companies_user_id_idx').on(table.userId),
    uniqueIndex('student_target_companies_unique_idx').on(table.userId, table.companyId),
  ],
);

export type StudentTargetCompanyRow = typeof studentTargetCompanies.$inferSelect;
export type NewStudentTargetCompanyRow = typeof studentTargetCompanies.$inferInsert;

/**
 * Table: student_skill_evidence
 * Links skills to demonstrated evidence (academic nodes, courses, projects).
 * Self-reported claims are explicitly distinguished from demonstrated evidence.
 */
export const studentSkillEvidence = pgTable(
  'student_skill_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    evidenceLevel: varchar('evidence_level', { length: 50 }).notNull().default('claimed'),
    evidenceSource: varchar('evidence_source', { length: 50 }).notNull().default('self_reported'),
    academicNodeId: uuid('academic_node_id').references(() => academicNodes.id, {
      onDelete: 'set null',
    }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    assessmentId: uuid('assessment_id').references(() => assessments.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    artifactUrl: text('artifact_url'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    confidenceScore: numeric('confidence_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.400'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('student_skill_evidence_user_id_idx').on(table.userId),
    index('student_skill_evidence_skill_id_idx').on(table.skillId),
    index('student_skill_evidence_level_idx').on(table.userId, table.evidenceLevel),
    index('student_skill_evidence_assessment_id_idx').on(table.assessmentId),
  ],
);

export type StudentSkillEvidenceRow = typeof studentSkillEvidence.$inferSelect;
export type NewStudentSkillEvidenceRow = typeof studentSkillEvidence.$inferInsert;

/**
 * Table: application_records
 * Application lifecycle tracking with explicit state transitions.
 */
export const applicationRecords = pgTable(
  'application_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 50 }).notNull().default('applied'),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    assessmentAt: timestamp('assessment_at', { withTimezone: true }),
    interviewAt: timestamp('interview_at', { withTimezone: true }),
    finalInterviewAt: timestamp('final_interview_at', { withTimezone: true }),
    outcomeAt: timestamp('outcome_at', { withTimezone: true }),
    outcomeNotes: text('outcome_notes'),
    stateTransitions: jsonb('state_transitions').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('application_records_user_id_idx').on(table.userId),
    index('application_records_opportunity_id_idx').on(table.opportunityId),
    index('application_records_user_status_idx').on(table.userId, table.status),
    uniqueIndex('application_records_user_opp_idx').on(table.userId, table.opportunityId),
  ],
);

export type ApplicationRecordRow = typeof applicationRecords.$inferSelect;
export type NewApplicationRecordRow = typeof applicationRecords.$inferInsert;

/**
 * Table: student_saved_opportunities
 * Student-saved external or canonical opportunities with personal notes.
 * Strict user ownership isolation.
 */
export const studentSavedOpportunities = pgTable(
  'student_saved_opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'cascade',
    }),
    customTitle: varchar('custom_title', { length: 255 }),
    customCompany: varchar('custom_company', { length: 255 }),
    sourceUrl: text('source_url'),
    notes: text('notes'),
    status: varchar('status', { length: 50 }).notNull().default('saved'), // 'saved' | 'researching' | 'archived'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('student_saved_opps_user_id_idx').on(table.userId),
    index('student_saved_opps_opp_id_idx').on(table.opportunityId),
    uniqueIndex('student_saved_opps_user_opp_idx').on(table.userId, table.opportunityId),
  ],
);

export type StudentSavedOpportunityRow = typeof studentSavedOpportunities.$inferSelect;
export type NewStudentSavedOpportunityRow = typeof studentSavedOpportunities.$inferInsert;

/**
 * Table: concept_skill_mappings
 * Extensible knowledge-to-skill dictionary mapping academic concepts to normalized career skills.
 */
export const conceptSkillMappings = pgTable(
  'concept_skill_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conceptName: varchar('concept_name', { length: 255 }).notNull(),
    skillName: varchar('skill_name', { length: 255 }).notNull(),
    skillCategory: varchar('skill_category', { length: 50 }).notNull().default('concept'),
    relevanceScore: numeric('relevance_score', { precision: 3, scale: 2 })
      .notNull()
      .default('1.00'),
    provenance: varchar('provenance', { length: 50 }).notNull().default('canonical_curated'), // 'canonical_curated' | 'model_inferred' | 'verified_academic'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('concept_skill_mappings_unique_idx').on(table.conceptName, table.skillName),
    index('concept_skill_mappings_concept_idx').on(table.conceptName),
    index('concept_skill_mappings_skill_idx').on(table.skillName),
  ],
);

export type ConceptSkillMappingRow = typeof conceptSkillMappings.$inferSelect;
export type NewConceptSkillMappingRow = typeof conceptSkillMappings.$inferInsert;

/**
 * Table: prediction_snapshots
 * Immutable snapshot of student qualifications and context captured at prediction time.
 */
export const predictionSnapshots = pgTable(
  'prediction_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    snapshotTimestamp: timestamp('snapshot_timestamp', { withTimezone: true })
      .notNull()
      .defaultNow(),
    educationSnapshot: jsonb('education_snapshot').notNull(),
    graduationTiming: jsonb('graduation_timing').notNull(),
    academicEvidenceSnapshot: jsonb('academic_evidence_snapshot').notNull().default([]),
    skillEvidenceSnapshot: jsonb('skill_evidence_snapshot').notNull().default([]),
    projectEvidenceSnapshot: jsonb('project_evidence_snapshot').notNull().default([]),
    experienceSnapshot: jsonb('experience_snapshot').notNull().default({}),
    targetContext: jsonb('target_context').notNull().default({}),
    applicationContext: jsonb('application_context'),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('prediction_snapshots_user_id_idx').on(table.userId),
    index('prediction_snapshots_opp_id_idx').on(table.opportunityId),
    index('prediction_snapshots_hash_idx').on(table.contentHash),
    index('prediction_snapshots_timestamp_idx').on(table.snapshotTimestamp),
  ],
);

export type PredictionSnapshotRow = typeof predictionSnapshots.$inferSelect;
export type NewPredictionSnapshotRow = typeof predictionSnapshots.$inferInsert;

/**
 * Table: opportunity_snapshots
 * Immutable snapshot of opportunity requirements, skills, and rules at application/prediction time.
 */
export const opportunitySnapshots = pgTable(
  'opportunity_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    snapshotTimestamp: timestamp('snapshot_timestamp', { withTimezone: true })
      .notNull()
      .defaultNow(),
    company: jsonb('company').notNull(),
    role: jsonb('role').notNull(),
    roleFamily: jsonb('role_family').notNull(),
    eligibilityRules: jsonb('eligibility_rules').notNull(),
    requiredSkills: jsonb('required_skills').notNull().default([]),
    preferredSkills: jsonb('preferred_skills').notNull().default([]),
    programRules: jsonb('program_rules').notNull().default([]),
    sourceProvenance: jsonb('source_provenance').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_snapshots_opp_id_idx').on(table.opportunityId),
    index('opportunity_snapshots_hash_idx').on(table.contentHash),
    index('opportunity_snapshots_timestamp_idx').on(table.snapshotTimestamp),
  ],
);

export type OpportunitySnapshotRow = typeof opportunitySnapshots.$inferSelect;
export type NewOpportunitySnapshotRow = typeof opportunitySnapshots.$inferInsert;

/**
 * Table: model_registries
 * Governed catalog of calibrated probabilistic outcome models.
 */
export const modelRegistries = pgTable(
  'model_registries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modelVersion: varchar('model_version', { length: 50 }).notNull(),
    target: varchar('target', { length: 50 }).notNull(),
    population: jsonb('population').notNull(),
    datasetVersion: varchar('dataset_version', { length: 100 }).notNull(),
    featureSchemaVersion: varchar('feature_schema_version', { length: 50 }).notNull(),
    algorithm: varchar('algorithm', { length: 100 }).notNull(),
    hyperparameters: jsonb('hyperparameters').notNull().default({}),
    trainingPeriod: jsonb('training_period').notNull(),
    validationPeriod: jsonb('validation_period').notNull(),
    testPeriod: jsonb('test_period').notNull(),
    metrics: jsonb('metrics').notNull(),
    calibrationResults: jsonb('calibration_results').notNull(),
    limitations: jsonb('limitations').notNull().default([]),
    approvalStatus: varchar('approval_status', { length: 50 }).notNull().default('draft'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('model_registries_version_idx').on(table.modelVersion),
    index('model_registries_target_idx').on(table.target),
    index('model_registries_status_idx').on(table.approvalStatus),
  ],
);

export type ModelRegistryRow = typeof modelRegistries.$inferSelect;
export type NewModelRegistryRow = typeof modelRegistries.$inferInsert;

/**
 * Table: model_cards
 * Transparent documentation cards for approved models.
 */
export const modelCards = pgTable(
  'model_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modelVersion: varchar('model_version', { length: 50 }).notNull(),
    purpose: text('purpose').notNull(),
    targetPopulation: text('target_population').notNull(),
    trainingData: text('training_data').notNull(),
    validationStrategy: text('validation_strategy').notNull(),
    metrics: jsonb('metrics').notNull(),
    calibration: text('calibration').notNull(),
    limitations: jsonb('limitations').notNull().default([]),
    knownMissingVariables: jsonb('known_missing_variables').notNull().default([]),
    knownBiasRisks: jsonb('known_bias_risks').notNull().default([]),
    appropriateInterpretation: text('appropriate_interpretation').notNull(),
    inappropriateInterpretation: text('inappropriate_interpretation').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('model_cards_version_idx').on(table.modelVersion)],
);

export type ModelCardRow = typeof modelCards.$inferSelect;
export type NewModelCardRow = typeof modelCards.$inferInsert;
