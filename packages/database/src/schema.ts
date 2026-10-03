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
