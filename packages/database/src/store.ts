import { eq, and, desc, asc, ilike } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';
import type {
  Course,
  Assessment,
  Resource,
  User,
  ResourceChunk,
  AcademicNode,
  SearchResultItem,
  ResourceProcessingStatus,
  Company,
  RoleFamily,
  Opportunity,
  OpportunityRequirement,
  Skill,
  OpportunitySkillRequirement,
  OpportunityLocation,
  OpportunityProgramRule,
  OpportunitySource,
  StudentCareerProfile,
  StudentCareerProfileInput,
  StudentTargetRole,
  StudentTargetCompany,
  StudentSkillEvidence,
  ApplicationRecord,
  ApplicationStatus,
  StudentSavedOpportunity,
  StudentSavedOpportunityInput,
  ConceptSkillMapping,
  ConceptSkillMappingSeed,
  VerifiedCompanySeed,
} from '@campusflow/types';

export class PostgresDataStore {
  private readonly db: ReturnType<typeof drizzle<typeof schema>>;
  private readonly rawSql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.rawSql = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    this.db = drizzle(this.rawSql, { schema });
  }

  // --- Users ---
  async getUser(id: string): Promise<User | null> {
    const rows = await this.db.select().from(schema.users).where(eq(schema.users.id, id));
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      clerkId: r.clerkId,
      email: r.email,
      fullName: r.fullName,
      role: r.role as 'student',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async createUser(
    data: Omit<User, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<User> {
    const rows = await this.db
      .insert(schema.users)
      .values({
        id: data.id,
        clerkId: data.clerkId,
        email: data.email,
        fullName: data.fullName,
        role: data.role || 'student',
      })
      .returning();
    const r = rows[0];
    if (!r) throw new Error('Failed to create user record.');
    return {
      id: r.id,
      clerkId: r.clerkId,
      email: r.email,
      fullName: r.fullName,
      role: r.role as 'student',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async deleteUser(id: string): Promise<void> {
    await this.db.delete(schema.users).where(eq(schema.users.id, id));
  }

  // --- Courses ---
  async getCourse(id: string, requesterUserId: string): Promise<Course> {
    const rows = await this.db
      .select()
      .from(schema.courses)
      .where(and(eq(schema.courses.id, id), eq(schema.courses.userId, requesterUserId)));
    const r = rows[0];
    if (!r) {
      throw new Error('Course not found.');
    }
    return {
      id: r.id,
      userId: r.userId,
      code: r.code,
      title: r.title,
      term: r.term,
      syllabusStatus: r.syllabusStatus as Course['syllabusStatus'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async listCourses(userId: string): Promise<Course[]> {
    const rows = await this.db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.userId, userId));
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      code: r.code,
      title: r.title,
      term: r.term,
      syllabusStatus: r.syllabusStatus as Course['syllabusStatus'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createCourse(course: {
    userId: string;
    code: string;
    title: string;
    term?: string | null | undefined;
  }): Promise<Course> {
    const rows = await this.db
      .insert(schema.courses)
      .values({
        userId: course.userId,
        code: course.code,
        title: course.title,
        term: course.term ?? null,
      })
      .returning();
    const r = rows[0];
    if (!r) throw new Error('Failed to create course.');
    return {
      id: r.id,
      userId: r.userId,
      code: r.code,
      title: r.title,
      term: r.term,
      syllabusStatus: r.syllabusStatus as Course['syllabusStatus'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async deleteCourse(id: string, requesterUserId: string): Promise<void> {
    await this.db
      .delete(schema.courses)
      .where(and(eq(schema.courses.id, id), eq(schema.courses.userId, requesterUserId)));
  }

  // --- Assessments ---
  async getAssessment(id: string, requesterUserId: string): Promise<Assessment> {
    const rows = await this.db
      .select()
      .from(schema.assessments)
      .where(and(eq(schema.assessments.id, id), eq(schema.assessments.userId, requesterUserId)));
    const r = rows[0];
    if (!r) {
      throw new Error('Assessment not found.');
    }
    return {
      id: r.id,
      userId: r.userId,
      courseId: r.courseId,
      title: r.title,
      type: r.type as Assessment['type'],
      date: r.date,
      weightage: r.weightage,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async listAssessments(userId: string, courseId?: string): Promise<Assessment[]> {
    const conditions = [eq(schema.assessments.userId, userId)];
    if (courseId) {
      conditions.push(eq(schema.assessments.courseId, courseId));
    }
    const rows = await this.db
      .select()
      .from(schema.assessments)
      .where(and(...conditions));
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      courseId: r.courseId,
      title: r.title,
      type: r.type as Assessment['type'],
      date: r.date,
      weightage: r.weightage,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createAssessment(assessment: {
    userId: string;
    courseId: string;
    title: string;
    type: Assessment['type'];
    date?: Date | null | undefined;
    weightage?: string | null | undefined;
  }): Promise<Assessment> {
    const rows = await this.db
      .insert(schema.assessments)
      .values({
        userId: assessment.userId,
        courseId: assessment.courseId,
        title: assessment.title,
        type: assessment.type,
        date: assessment.date ?? null,
        weightage: assessment.weightage ?? null,
      })
      .returning();
    const r = rows[0];
    if (!r) throw new Error('Failed to create assessment.');
    return {
      id: r.id,
      userId: r.userId,
      courseId: r.courseId,
      title: r.title,
      type: r.type as Assessment['type'],
      date: r.date,
      weightage: r.weightage,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  // --- Resources ---
  async getResource(id: string, requesterUserId: string): Promise<Resource> {
    const rows = await this.db
      .select()
      .from(schema.resources)
      .where(and(eq(schema.resources.id, id), eq(schema.resources.userId, requesterUserId)));
    const r = rows[0];
    if (!r) {
      throw new Error('Resource not found.');
    }
    return this.mapResourceRow(r);
  }

  async listResources(userId: string, courseId?: string): Promise<Resource[]> {
    const conditions = [eq(schema.resources.userId, userId)];
    if (courseId) {
      conditions.push(eq(schema.resources.courseId, courseId));
    }
    const rows = await this.db
      .select()
      .from(schema.resources)
      .where(and(...conditions));
    return rows.map((r) => this.mapResourceRow(r));
  }

  async findResourceByHash(userId: string, contentHash: string): Promise<Resource | null> {
    const rows = await this.db
      .select()
      .from(schema.resources)
      .where(
        and(eq(schema.resources.userId, userId), eq(schema.resources.contentHash, contentHash)),
      );
    const r = rows[0];
    if (!r) return null;
    return this.mapResourceRow(r);
  }

  async createResource(resource: {
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
    const rows = await this.db
      .insert(schema.resources)
      .values({
        userId: resource.userId,
        courseId: resource.courseId ?? null,
        title: resource.title,
        type: resource.type,
        objectKey: resource.objectKey,
        mimeType: resource.mimeType,
        sizeBytes: resource.sizeBytes ?? null,
        contentHash: resource.contentHash ?? null,
        pageCount: resource.pageCount ?? null,
        processingStatus: resource.processingStatus || 'created',
      })
      .returning();
    const r = rows[0];
    if (!r) throw new Error('Failed to create resource.');
    return this.mapResourceRow(r);
  }

  async updateResource(
    id: string,
    requesterUserId: string,
    updates: Partial<Resource>,
  ): Promise<Resource> {
    const values: Partial<schema.NewResourceRow> = {};
    if (updates.title !== undefined) values.title = updates.title;
    if (updates.courseId !== undefined) values.courseId = updates.courseId;
    if (updates.contentHash !== undefined) values.contentHash = updates.contentHash;
    if (updates.pageCount !== undefined) values.pageCount = updates.pageCount;
    if (updates.errorMessage !== undefined) values.errorMessage = updates.errorMessage;
    if (updates.failedAt !== undefined) values.failedAt = updates.failedAt;
    if (updates.processedAt !== undefined) values.processedAt = updates.processedAt;
    if (updates.processingStatus !== undefined) values.processingStatus = updates.processingStatus;
    values.updatedAt = new Date();

    const rows = await this.db
      .update(schema.resources)
      .set(values)
      .where(and(eq(schema.resources.id, id), eq(schema.resources.userId, requesterUserId)))
      .returning();
    const r = rows[0];
    if (!r) {
      throw new Error('Resource not found or unauthorized.');
    }
    return this.mapResourceRow(r);
  }

  async updateResourceStatus(
    id: string,
    requesterUserId: string,
    status: ResourceProcessingStatus,
    extra?: { errorMessage?: string | null; pageCount?: number | null },
  ): Promise<Resource> {
    const values: Partial<schema.NewResourceRow> = {
      processingStatus: status,
      updatedAt: new Date(),
    };
    if (extra?.errorMessage !== undefined) {
      values.errorMessage = extra.errorMessage;
    }
    if (extra?.pageCount !== undefined) {
      values.pageCount = extra.pageCount;
    }
    if (status === 'failed') {
      values.failedAt = new Date();
    }
    if (status === 'ready') {
      values.processedAt = new Date();
    }

    const rows = await this.db
      .update(schema.resources)
      .set(values)
      .where(and(eq(schema.resources.id, id), eq(schema.resources.userId, requesterUserId)))
      .returning();
    const r = rows[0];
    if (!r) {
      throw new Error('Resource not found.');
    }
    return this.mapResourceRow(r);
  }

  async deleteResource(id: string, requesterUserId: string): Promise<void> {
    await this.deleteChunksByResource(id);
    await this.db
      .delete(schema.resources)
      .where(and(eq(schema.resources.id, id), eq(schema.resources.userId, requesterUserId)));
  }

  // --- Chunks & Full-Text Search ---
  async createChunks(
    chunks: Array<Omit<ResourceChunk, 'id' | 'createdAt'>>,
  ): Promise<ResourceChunk[]> {
    if (chunks.length === 0) return [];

    const inserted: ResourceChunk[] = [];
    for (const c of chunks) {
      const rows = await this.db
        .insert(schema.resourceChunks)
        .values({
          resourceId: c.resourceId,
          userId: c.userId,
          courseId: c.courseId ?? null,
          sequence: c.sequence,
          content: c.content,
          pageStart: c.pageStart ?? null,
          pageEnd: c.pageEnd ?? null,
          charCount: c.charCount,
          tokenCount: c.tokenCount ?? null,
          extractionVersion: c.extractionVersion || 'v1',
          chunkingVersion: c.chunkingVersion || 'v1',
        })
        .returning();
      const r = rows[0];
      if (r) {
        inserted.push({
          id: r.id,
          resourceId: r.resourceId,
          userId: r.userId,
          courseId: r.courseId,
          sequence: r.sequence,
          content: r.content,
          pageStart: r.pageStart,
          pageEnd: r.pageEnd,
          charCount: r.charCount,
          tokenCount: r.tokenCount,
          extractionVersion: r.extractionVersion,
          chunkingVersion: r.chunkingVersion,
          createdAt: r.createdAt,
        });
      }
    }
    return inserted;
  }

  async listChunks(resourceId: string, requesterUserId: string): Promise<ResourceChunk[]> {
    const rows = await this.db
      .select()
      .from(schema.resourceChunks)
      .where(
        and(
          eq(schema.resourceChunks.resourceId, resourceId),
          eq(schema.resourceChunks.userId, requesterUserId),
        ),
      )
      .orderBy(schema.resourceChunks.sequence);

    return rows.map((r) => ({
      id: r.id,
      resourceId: r.resourceId,
      userId: r.userId,
      courseId: r.courseId,
      sequence: r.sequence,
      content: r.content,
      pageStart: r.pageStart,
      pageEnd: r.pageEnd,
      charCount: r.charCount,
      tokenCount: r.tokenCount,
      extractionVersion: r.extractionVersion,
      chunkingVersion: r.chunkingVersion,
      createdAt: r.createdAt,
    }));
  }

  async deleteChunksByResource(resourceId: string): Promise<void> {
    await this.db
      .delete(schema.resourceChunks)
      .where(eq(schema.resourceChunks.resourceId, resourceId));
  }

  async searchChunks(
    userId: string,
    query: string,
    courseId?: string | null | undefined,
  ): Promise<SearchResultItem[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Native PostgreSQL Full-Text Search using plainto_tsquery
    const results = await this.rawSql<
      Array<{
        id: string;
        resource_id: string;
        course_id: string | null;
        content: string;
        page_start: number | null;
        page_end: number | null;
        resource_title: string;
        rank: number;
      }>
    >`
      SELECT 
        rc.id,
        rc.resource_id,
        rc.course_id,
        rc.content,
        rc.page_start,
        rc.page_end,
        r.title as resource_title,
        ts_rank_cd(to_tsvector('english', rc.content), plainto_tsquery('english', ${trimmed})) as rank
      FROM resource_chunks rc
      JOIN resources r ON r.id = rc.resource_id
      WHERE rc.user_id = ${userId}
        ${courseId ? this.rawSql`AND rc.course_id = ${courseId}` : this.rawSql``}
        AND to_tsvector('english', rc.content) @@ plainto_tsquery('english', ${trimmed})
      ORDER BY rank DESC
      LIMIT 20;
    `;

    return results.map((row) => {
      const pageLabel = row.page_start
        ? row.page_start === row.page_end
          ? `Page ${row.page_start}`
          : `Pages ${row.page_start}–${row.page_end}`
        : 'Document';

      return {
        chunkId: row.id,
        resourceId: row.resource_id,
        resourceTitle: row.resource_title,
        courseId: row.course_id,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        matchedText: row.content.slice(0, 160) + '...',
        rank: Number(row.rank),
        citation: `${row.resource_title} (${pageLabel})`,
      };
    });
  }

  // --- Academic Nodes ---
  async listAcademicNodes(courseId: string, requesterUserId: string): Promise<AcademicNode[]> {
    const rows = await this.db
      .select()
      .from(schema.academicNodes)
      .where(
        and(
          eq(schema.academicNodes.courseId, courseId),
          eq(schema.academicNodes.userId, requesterUserId),
        ),
      )
      .orderBy(schema.academicNodes.orderIndex);

    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      userId: r.userId,
      parentId: r.parentId,
      type: r.type as AcademicNode['type'],
      title: r.title,
      description: r.description,
      orderIndex: r.orderIndex,
      origin: r.origin as AcademicNode['origin'],
      confidence: r.confidence ? Number(r.confidence) : null,
      needsReview: r.needsReview as AcademicNode['needsReview'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createAcademicNodes(
    nodes: Array<Omit<AcademicNode, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<AcademicNode[]> {
    if (nodes.length === 0) return [];
    const inserted: AcademicNode[] = [];
    for (const n of nodes) {
      const rows = await this.db
        .insert(schema.academicNodes)
        .values({
          courseId: n.courseId,
          userId: n.userId,
          parentId: n.parentId ?? null,
          type: n.type,
          title: n.title,
          description: n.description ?? null,
          orderIndex: n.orderIndex,
          origin: n.origin,
          confidence:
            n.confidence !== null && n.confidence !== undefined ? String(n.confidence) : '0.800',
          needsReview: n.needsReview,
        })
        .returning();
      const r = rows[0];
      if (r) {
        inserted.push({
          id: r.id,
          courseId: r.courseId,
          userId: r.userId,
          parentId: r.parentId,
          type: r.type as AcademicNode['type'],
          title: r.title,
          description: r.description,
          orderIndex: r.orderIndex,
          origin: r.origin as AcademicNode['origin'],
          confidence: r.confidence ? Number(r.confidence) : null,
          needsReview: r.needsReview as AcademicNode['needsReview'],
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
      }
    }
    return inserted;
  }

  async updateAcademicNode(
    id: string,
    requesterUserId: string,
    updates: Partial<AcademicNode>,
  ): Promise<AcademicNode> {
    const values: Partial<schema.NewAcademicNodeRow> = { updatedAt: new Date() };
    if (updates.title !== undefined) values.title = updates.title;
    if (updates.description !== undefined) values.description = updates.description;
    if (updates.orderIndex !== undefined) values.orderIndex = updates.orderIndex;
    if (updates.needsReview !== undefined) values.needsReview = updates.needsReview;

    const rows = await this.db
      .update(schema.academicNodes)
      .set(values)
      .where(and(eq(schema.academicNodes.id, id), eq(schema.academicNodes.userId, requesterUserId)))
      .returning();
    const r = rows[0];
    if (!r) {
      throw new Error('Academic node not found.');
    }
    return {
      id: r.id,
      courseId: r.courseId,
      userId: r.userId,
      parentId: r.parentId,
      type: r.type as AcademicNode['type'],
      title: r.title,
      description: r.description,
      orderIndex: r.orderIndex,
      origin: r.origin as AcademicNode['origin'],
      confidence: r.confidence ? Number(r.confidence) : null,
      needsReview: r.needsReview as AcademicNode['needsReview'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async deleteAcademicNode(id: string, requesterUserId: string): Promise<void> {
    await this.db
      .delete(schema.academicNodes)
      .where(
        and(eq(schema.academicNodes.id, id), eq(schema.academicNodes.userId, requesterUserId)),
      );
  }

  // --- Role Families ---
  async ensureInitialRoleFamilies(names: readonly string[]): Promise<void> {
    for (const name of names) {
      const existing = await this.db
        .select()
        .from(schema.roleFamilies)
        .where(eq(schema.roleFamilies.name, name));
      if (!existing.length) {
        await this.db.insert(schema.roleFamilies).values({
          name,
          description: `Career family for ${name}`,
        });
      }
    }
  }

  async listRoleFamilies(): Promise<RoleFamily[]> {
    const rows = await this.db
      .select()
      .from(schema.roleFamilies)
      .orderBy(asc(schema.roleFamilies.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getRoleFamily(id: string): Promise<RoleFamily | null> {
    const rows = await this.db
      .select()
      .from(schema.roleFamilies)
      .where(eq(schema.roleFamilies.id, id));
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  // --- Companies ---
  async listCompanies(): Promise<Company[]> {
    const rows = await this.db.select().from(schema.companies).orderBy(asc(schema.companies.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      websiteUrl: r.websiteUrl,
      description: r.description,
      industry: r.industry,
      isVerified: r.isVerified,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getCompany(id: string): Promise<Company | null> {
    const rows = await this.db.select().from(schema.companies).where(eq(schema.companies.id, id));
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      websiteUrl: r.websiteUrl,
      description: r.description,
      industry: r.industry,
      isVerified: r.isVerified,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async createCompany(data: {
    name: string;
    slug: string;
    websiteUrl?: string | null;
    description?: string | null;
    industry?: string | null;
    isVerified?: boolean;
  }): Promise<Company> {
    const rows = await this.db
      .insert(schema.companies)
      .values({
        name: data.name,
        slug: data.slug,
        websiteUrl: data.websiteUrl ?? null,
        description: data.description ?? null,
        industry: data.industry ?? null,
        isVerified: data.isVerified ?? true,
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      websiteUrl: r.websiteUrl,
      description: r.description,
      industry: r.industry,
      isVerified: r.isVerified,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async ensureVerifiedCompanies(seeds: readonly VerifiedCompanySeed[]): Promise<void> {
    for (const s of seeds) {
      await this.db
        .insert(schema.companies)
        .values({
          name: s.name,
          slug: s.slug,
          websiteUrl: s.websiteUrl,
          description: s.description,
          industry: s.industry,
          isVerified: true,
        })
        .onConflictDoNothing({ target: schema.companies.slug });
    }
  }

  // --- Skills ---
  async listSkills(category?: string): Promise<Skill[]> {
    let rows;
    if (category) {
      rows = await this.db
        .select()
        .from(schema.skills)
        .where(eq(schema.skills.category, category))
        .orderBy(asc(schema.skills.name));
    } else {
      rows = await this.db.select().from(schema.skills).orderBy(asc(schema.skills.name));
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category as Skill['category'],
      synonyms: (r.synonyms as string[]) || [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getSkill(id: string): Promise<Skill | null> {
    const rows = await this.db.select().from(schema.skills).where(eq(schema.skills.id, id));
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      category: r.category as Skill['category'],
      synonyms: (r.synonyms as string[]) || [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async createSkill(data: {
    name: string;
    category?: Skill['category'];
    synonyms?: string[];
  }): Promise<Skill> {
    const rows = await this.db
      .insert(schema.skills)
      .values({
        name: data.name,
        category: data.category || 'concept',
        synonyms: data.synonyms || [],
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      name: r.name,
      category: r.category as Skill['category'],
      synonyms: (r.synonyms as string[]) || [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  // --- Opportunities ---
  async listOpportunities(filters?: {
    roleFamilyId?: string;
    opportunityType?: string;
    status?: string;
    companyId?: string;
  }): Promise<Opportunity[]> {
    const conditions = [];
    if (filters?.roleFamilyId) {
      conditions.push(eq(schema.opportunities.roleFamilyId, filters.roleFamilyId));
    }
    if (filters?.opportunityType) {
      conditions.push(eq(schema.opportunities.opportunityType, filters.opportunityType));
    }
    if (filters?.status) {
      conditions.push(eq(schema.opportunities.status, filters.status));
    }
    if (filters?.companyId) {
      conditions.push(eq(schema.opportunities.companyId, filters.companyId));
    }

    let query = this.db.select().from(schema.opportunities);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const rows = await query.orderBy(desc(schema.opportunities.retrievalTimestamp));
    return rows.map((r) => this.mapOpportunityRow(r));
  }

  async getOpportunity(id: string): Promise<Opportunity | null> {
    const rows = await this.db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, id));
    const r = rows[0];
    if (!r) return null;
    return this.mapOpportunityRow(r);
  }

  async findOpportunityBySourceUrl(sourceUrl: string): Promise<Opportunity | null> {
    const rows = await this.db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.sourceUrl, sourceUrl));
    const r = rows[0];
    if (!r) return null;
    return this.mapOpportunityRow(r);
  }

  async updateOpportunity(id: string, data: Partial<Opportunity>): Promise<Opportunity> {
    const updates: Partial<typeof schema.opportunities.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.title !== undefined) updates.title = data.title;
    if (data.status !== undefined) updates.status = data.status;
    if (data.description !== undefined) updates.description = data.description;
    if (data.season !== undefined) updates.season = data.season;
    if (data.employmentType !== undefined) updates.employmentType = data.employmentType;
    if (data.workplaceType !== undefined) updates.workplaceType = data.workplaceType;
    if (data.minGpa !== undefined) updates.minGpa = data.minGpa;
    if (data.minExperienceMonths !== undefined)
      updates.minExperienceMonths = data.minExperienceMonths;
    if (data.requiresWorkAuth !== undefined) updates.requiresWorkAuth = data.requiresWorkAuth;
    if (data.targetGraduationYears !== undefined)
      updates.targetGraduationYears = data.targetGraduationYears;
    if (data.degreeLevels !== undefined) updates.degreeLevels = data.degreeLevels;
    if (data.allowedMajors !== undefined) updates.allowedMajors = data.allowedMajors;
    if (data.publicationDate !== undefined) updates.publicationDate = data.publicationDate;
    if (data.expirationDate !== undefined) updates.expirationDate = data.expirationDate;
    if (data.lastValidTimestamp !== undefined) updates.lastValidTimestamp = data.lastValidTimestamp;
    if (data.retrievalTimestamp !== undefined) updates.retrievalTimestamp = data.retrievalTimestamp;
    if (data.contentHash !== undefined) updates.contentHash = data.contentHash;
    if (data.extractionVersion !== undefined) updates.extractionVersion = data.extractionVersion;
    if (data.ingestionProvider !== undefined) updates.ingestionProvider = data.ingestionProvider;

    const rows = await this.db
      .update(schema.opportunities)
      .set(updates)
      .where(eq(schema.opportunities.id, id))
      .returning();
    const r = rows[0]!;
    return this.mapOpportunityRow(r);
  }

  async deleteOpportunity(id: string): Promise<void> {
    await this.db.delete(schema.opportunities).where(eq(schema.opportunities.id, id));
  }

  async createOpportunity(
    data: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<Opportunity> {
    const rows = await this.db
      .insert(schema.opportunities)
      .values({
        id: data.id,
        companyId: data.companyId,
        roleFamilyId: data.roleFamilyId,
        title: data.title,
        opportunityType: data.opportunityType,
        targetGraduationYears: data.targetGraduationYears,
        degreeLevels: data.degreeLevels,
        allowedMajors: data.allowedMajors,
        description: data.description,
        season: data.season,
        employmentType: data.employmentType,
        workplaceType: data.workplaceType,
        status: data.status,
        minGpa: data.minGpa ? String(data.minGpa) : null,
        minExperienceMonths: data.minExperienceMonths,
        requiresWorkAuth: data.requiresWorkAuth,
        sourceUrl: data.sourceUrl,
        sourceOrganization: data.sourceOrganization,
        retrievalTimestamp: data.retrievalTimestamp,
        publicationDate: data.publicationDate,
        expirationDate: data.expirationDate,
        lastValidTimestamp: data.lastValidTimestamp,
        extractionVersion: data.extractionVersion || 'v1',
        contentHash: data.contentHash || null,
        ingestionProvider: data.ingestionProvider || 'official_direct',
        isCanonical: data.isCanonical ?? true,
      })
      .returning();
    const r = rows[0]!;
    return this.mapOpportunityRow(r);
  }

  async getOpportunityRequirements(opportunityId: string): Promise<OpportunityRequirement[]> {
    const rows = await this.db
      .select()
      .from(schema.opportunityRequirements)
      .where(eq(schema.opportunityRequirements.opportunityId, opportunityId));
    return rows.map((r) => ({
      id: r.id,
      opportunityId: r.opportunityId,
      category: r.category as OpportunityRequirement['category'],
      description: r.description,
      isMandatory: r.isMandatory,
      parsedRule: r.parsedRule as Record<string, unknown> | null,
      createdAt: r.createdAt,
    }));
  }

  async getOpportunitySkillRequirements(
    opportunityId: string,
  ): Promise<Array<OpportunitySkillRequirement & { skill?: Skill }>> {
    const rows = await this.db
      .select({
        id: schema.opportunitySkillRequirements.id,
        opportunityId: schema.opportunitySkillRequirements.opportunityId,
        skillId: schema.opportunitySkillRequirements.skillId,
        requirementType: schema.opportunitySkillRequirements.requirementType,
        minProficiency: schema.opportunitySkillRequirements.minProficiency,
        importanceWeight: schema.opportunitySkillRequirements.importanceWeight,
        notes: schema.opportunitySkillRequirements.notes,
        createdAt: schema.opportunitySkillRequirements.createdAt,
        skillName: schema.skills.name,
        skillCategory: schema.skills.category,
        skillSynonyms: schema.skills.synonyms,
      })
      .from(schema.opportunitySkillRequirements)
      .leftJoin(schema.skills, eq(schema.opportunitySkillRequirements.skillId, schema.skills.id))
      .where(eq(schema.opportunitySkillRequirements.opportunityId, opportunityId));

    return rows.map((r) => ({
      id: r.id,
      opportunityId: r.opportunityId,
      skillId: r.skillId,
      requirementType: r.requirementType as OpportunitySkillRequirement['requirementType'],
      minProficiency: r.minProficiency as OpportunitySkillRequirement['minProficiency'],
      importanceWeight: r.importanceWeight,
      notes: r.notes,
      createdAt: r.createdAt,
      ...(r.skillName
        ? {
            skill: {
              id: r.skillId,
              name: r.skillName,
              category: r.skillCategory as Skill['category'],
              synonyms: (r.skillSynonyms as string[]) || [],
              createdAt: r.createdAt,
              updatedAt: r.createdAt,
            },
          }
        : {}),
    }));
  }

  async getOpportunityLocations(opportunityId: string): Promise<OpportunityLocation[]> {
    const rows = await this.db
      .select()
      .from(schema.opportunityLocations)
      .where(eq(schema.opportunityLocations.opportunityId, opportunityId));
    return rows.map((r) => ({
      id: r.id,
      opportunityId: r.opportunityId,
      city: r.city,
      stateProvince: r.stateProvince,
      country: r.country,
      isRemote: r.isRemote,
      createdAt: r.createdAt,
    }));
  }

  async getOpportunityProgramRules(opportunityId: string): Promise<OpportunityProgramRule[]> {
    const rows = await this.db
      .select()
      .from(schema.opportunityProgramRules)
      .where(eq(schema.opportunityProgramRules.opportunityId, opportunityId));
    return rows.map((r) => ({
      id: r.id,
      opportunityId: r.opportunityId,
      ruleType: r.ruleType,
      ruleValue: r.ruleValue as Record<string, unknown>,
      explanation: r.explanation,
      createdAt: r.createdAt,
    }));
  }

  async getOpportunitySources(opportunityId: string): Promise<OpportunitySource[]> {
    const rows = await this.db
      .select()
      .from(schema.opportunitySources)
      .where(eq(schema.opportunitySources.opportunityId, opportunityId));
    return rows.map((r) => ({
      id: r.id,
      opportunityId: r.opportunityId,
      sourceUrl: r.sourceUrl,
      sourceType: r.sourceType,
      retrievedAt: r.retrievedAt,
      rawPayload: r.rawPayload as Record<string, unknown> | null,
      hash: r.hash,
      createdAt: r.createdAt,
    }));
  }

  async createOpportunityRequirement(
    data: Omit<OpportunityRequirement, 'id' | 'createdAt'>,
  ): Promise<OpportunityRequirement> {
    const rows = await this.db
      .insert(schema.opportunityRequirements)
      .values({
        opportunityId: data.opportunityId,
        category: data.category,
        description: data.description,
        isMandatory: data.isMandatory,
        parsedRule: data.parsedRule ?? null,
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      opportunityId: r.opportunityId,
      category: r.category as OpportunityRequirement['category'],
      description: r.description,
      isMandatory: r.isMandatory,
      parsedRule: r.parsedRule as Record<string, unknown> | null,
      createdAt: r.createdAt,
    };
  }

  async createOpportunitySkillRequirement(
    data: Omit<OpportunitySkillRequirement, 'id' | 'createdAt'>,
  ): Promise<OpportunitySkillRequirement> {
    const rows = await this.db
      .insert(schema.opportunitySkillRequirements)
      .values({
        opportunityId: data.opportunityId,
        skillId: data.skillId,
        requirementType: data.requirementType,
        minProficiency: data.minProficiency,
        importanceWeight: data.importanceWeight,
        notes: data.notes ?? null,
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      opportunityId: r.opportunityId,
      skillId: r.skillId,
      requirementType: r.requirementType as OpportunitySkillRequirement['requirementType'],
      minProficiency: r.minProficiency as OpportunitySkillRequirement['minProficiency'],
      importanceWeight: r.importanceWeight,
      notes: r.notes,
      createdAt: r.createdAt,
    };
  }

  async createOpportunityLocation(
    data: Omit<OpportunityLocation, 'id' | 'createdAt'>,
  ): Promise<OpportunityLocation> {
    const rows = await this.db
      .insert(schema.opportunityLocations)
      .values({
        opportunityId: data.opportunityId,
        city: data.city ?? null,
        stateProvince: data.stateProvince ?? null,
        country: data.country,
        isRemote: data.isRemote,
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      opportunityId: r.opportunityId,
      city: r.city,
      stateProvince: r.stateProvince,
      country: r.country,
      isRemote: r.isRemote,
      createdAt: r.createdAt,
    };
  }

  async createOpportunityProgramRule(
    data: Omit<OpportunityProgramRule, 'id' | 'createdAt'>,
  ): Promise<OpportunityProgramRule> {
    const rows = await this.db
      .insert(schema.opportunityProgramRules)
      .values({
        opportunityId: data.opportunityId,
        ruleType: data.ruleType,
        ruleValue: data.ruleValue,
        explanation: data.explanation ?? null,
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      opportunityId: r.opportunityId,
      ruleType: r.ruleType,
      ruleValue: r.ruleValue as Record<string, unknown>,
      explanation: r.explanation,
      createdAt: r.createdAt,
    };
  }

  async createOpportunitySource(
    data: Omit<OpportunitySource, 'id' | 'createdAt'>,
  ): Promise<OpportunitySource> {
    const rows = await this.db
      .insert(schema.opportunitySources)
      .values({
        opportunityId: data.opportunityId,
        sourceUrl: data.sourceUrl,
        sourceType: data.sourceType,
        retrievedAt: data.retrievedAt,
        rawPayload: data.rawPayload ?? null,
        hash: data.hash ?? null,
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      opportunityId: r.opportunityId,
      sourceUrl: r.sourceUrl,
      sourceType: r.sourceType,
      retrievedAt: r.retrievedAt,
      rawPayload: r.rawPayload as Record<string, unknown> | null,
      hash: r.hash,
      createdAt: r.createdAt,
    };
  }

  // --- Student Career Profile ---
  async getStudentCareerProfile(userId: string): Promise<StudentCareerProfile | null> {
    const rows = await this.db
      .select()
      .from(schema.studentCareerProfiles)
      .where(eq(schema.studentCareerProfiles.userId, userId));
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      userId: r.userId,
      targetCareerPath: r.targetCareerPath,
      targetGeography: (r.targetGeography as string[]) || [],
      targetRecruitingPeriod: r.targetRecruitingPeriod,
      degreeLevel: r.degreeLevel,
      major: r.major,
      university: r.university,
      graduationYear: r.graduationYear,
      graduationMonth: r.graduationMonth,
      currentYearOfStudy: r.currentYearOfStudy,
      isEnrolled: r.isEnrolled,
      workAuthorization: r.workAuthorization,
      gpa: r.gpa,
      yearsExperience: r.yearsExperience,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async upsertStudentCareerProfile(
    userId: string,
    data: StudentCareerProfileInput,
  ): Promise<StudentCareerProfile> {
    const existing = await this.getStudentCareerProfile(userId);
    if (!existing) {
      const rows = await this.db
        .insert(schema.studentCareerProfiles)
        .values({
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
        })
        .returning();
      const r = rows[0]!;
      return {
        id: r.id,
        userId: r.userId,
        targetCareerPath: r.targetCareerPath,
        targetGeography: (r.targetGeography as string[]) || [],
        targetRecruitingPeriod: r.targetRecruitingPeriod,
        degreeLevel: r.degreeLevel,
        major: r.major,
        university: r.university,
        graduationYear: r.graduationYear,
        graduationMonth: r.graduationMonth,
        currentYearOfStudy: r.currentYearOfStudy,
        isEnrolled: r.isEnrolled,
        workAuthorization: r.workAuthorization,
        gpa: r.gpa,
        yearsExperience: r.yearsExperience,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    } else {
      const updates: Partial<schema.NewStudentCareerProfileRow> = { updatedAt: new Date() };
      if (data.targetCareerPath !== undefined) updates.targetCareerPath = data.targetCareerPath;
      if (data.targetGeography !== undefined) updates.targetGeography = data.targetGeography;
      if (data.targetRecruitingPeriod !== undefined)
        updates.targetRecruitingPeriod = data.targetRecruitingPeriod;
      if (data.degreeLevel !== undefined) updates.degreeLevel = data.degreeLevel;
      if (data.major !== undefined) updates.major = data.major;
      if (data.university !== undefined) updates.university = data.university;
      if (data.graduationYear !== undefined) updates.graduationYear = data.graduationYear;
      if (data.graduationMonth !== undefined) updates.graduationMonth = data.graduationMonth;
      if (data.currentYearOfStudy !== undefined)
        updates.currentYearOfStudy = data.currentYearOfStudy;
      if (data.isEnrolled !== undefined) updates.isEnrolled = data.isEnrolled;
      if (data.workAuthorization !== undefined) updates.workAuthorization = data.workAuthorization;
      if (data.gpa !== undefined) updates.gpa = data.gpa;
      if (data.yearsExperience !== undefined && data.yearsExperience !== null)
        updates.yearsExperience = data.yearsExperience;

      const rows = await this.db
        .update(schema.studentCareerProfiles)
        .set(updates)
        .where(eq(schema.studentCareerProfiles.userId, userId))
        .returning();
      const r = rows[0]!;
      return {
        id: r.id,
        userId: r.userId,
        targetCareerPath: r.targetCareerPath,
        targetGeography: (r.targetGeography as string[]) || [],
        targetRecruitingPeriod: r.targetRecruitingPeriod,
        degreeLevel: r.degreeLevel,
        major: r.major,
        university: r.university,
        graduationYear: r.graduationYear,
        graduationMonth: r.graduationMonth,
        currentYearOfStudy: r.currentYearOfStudy,
        isEnrolled: r.isEnrolled,
        workAuthorization: r.workAuthorization,
        gpa: r.gpa,
        yearsExperience: r.yearsExperience,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    }
  }

  // --- Student Target Roles ---
  async listStudentTargetRoles(
    userId: string,
  ): Promise<Array<StudentTargetRole & { roleFamily?: RoleFamily }>> {
    const rows = await this.db
      .select({
        id: schema.studentTargetRoles.id,
        userId: schema.studentTargetRoles.userId,
        roleFamilyId: schema.studentTargetRoles.roleFamilyId,
        priority: schema.studentTargetRoles.priority,
        createdAt: schema.studentTargetRoles.createdAt,
        roleFamilyName: schema.roleFamilies.name,
        roleFamilyDesc: schema.roleFamilies.description,
      })
      .from(schema.studentTargetRoles)
      .leftJoin(
        schema.roleFamilies,
        eq(schema.studentTargetRoles.roleFamilyId, schema.roleFamilies.id),
      )
      .where(eq(schema.studentTargetRoles.userId, userId))
      .orderBy(asc(schema.studentTargetRoles.priority));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      roleFamilyId: r.roleFamilyId,
      priority: r.priority,
      createdAt: r.createdAt,
      ...(r.roleFamilyName
        ? {
            roleFamily: {
              id: r.roleFamilyId,
              name: r.roleFamilyName,
              description: r.roleFamilyDesc,
              createdAt: r.createdAt,
              updatedAt: r.createdAt,
            },
          }
        : {}),
    }));
  }

  async addStudentTargetRole(
    userId: string,
    roleFamilyId: string,
    priority = 1,
  ): Promise<StudentTargetRole> {
    const rows = await this.db
      .insert(schema.studentTargetRoles)
      .values({
        userId,
        roleFamilyId,
        priority,
      })
      .onConflictDoUpdate({
        target: [schema.studentTargetRoles.userId, schema.studentTargetRoles.roleFamilyId],
        set: { priority },
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      userId: r.userId,
      roleFamilyId: r.roleFamilyId,
      priority: r.priority,
      createdAt: r.createdAt,
    };
  }

  async removeStudentTargetRole(userId: string, roleFamilyId: string): Promise<void> {
    await this.db
      .delete(schema.studentTargetRoles)
      .where(
        and(
          eq(schema.studentTargetRoles.userId, userId),
          eq(schema.studentTargetRoles.roleFamilyId, roleFamilyId),
        ),
      );
  }

  // --- Student Target Companies ---
  async listStudentTargetCompanies(
    userId: string,
  ): Promise<Array<StudentTargetCompany & { company?: Company }>> {
    const rows = await this.db
      .select({
        id: schema.studentTargetCompanies.id,
        userId: schema.studentTargetCompanies.userId,
        companyId: schema.studentTargetCompanies.companyId,
        priority: schema.studentTargetCompanies.priority,
        notes: schema.studentTargetCompanies.notes,
        createdAt: schema.studentTargetCompanies.createdAt,
        companyName: schema.companies.name,
        companySlug: schema.companies.slug,
        companyWebsite: schema.companies.websiteUrl,
        companyDesc: schema.companies.description,
      })
      .from(schema.studentTargetCompanies)
      .leftJoin(schema.companies, eq(schema.studentTargetCompanies.companyId, schema.companies.id))
      .where(eq(schema.studentTargetCompanies.userId, userId))
      .orderBy(asc(schema.studentTargetCompanies.priority));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      companyId: r.companyId,
      priority: r.priority,
      notes: r.notes,
      createdAt: r.createdAt,
      ...(r.companyName
        ? {
            company: {
              id: r.companyId,
              name: r.companyName,
              slug: r.companySlug || '',
              websiteUrl: r.companyWebsite,
              description: r.companyDesc,
              createdAt: r.createdAt,
              updatedAt: r.createdAt,
            },
          }
        : {}),
    }));
  }

  async addStudentTargetCompany(
    userId: string,
    companyId: string,
    priority = 1,
    notes?: string | null,
  ): Promise<StudentTargetCompany> {
    const rows = await this.db
      .insert(schema.studentTargetCompanies)
      .values({
        userId,
        companyId,
        priority,
        notes: notes ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.studentTargetCompanies.userId, schema.studentTargetCompanies.companyId],
        set: { priority, notes: notes ?? null },
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      userId: r.userId,
      companyId: r.companyId,
      priority: r.priority,
      notes: r.notes,
      createdAt: r.createdAt,
    };
  }

  async removeStudentTargetCompany(userId: string, companyId: string): Promise<void> {
    await this.db
      .delete(schema.studentTargetCompanies)
      .where(
        and(
          eq(schema.studentTargetCompanies.userId, userId),
          eq(schema.studentTargetCompanies.companyId, companyId),
        ),
      );
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
    const rows = await this.db
      .select({
        id: schema.studentSkillEvidence.id,
        userId: schema.studentSkillEvidence.userId,
        skillId: schema.studentSkillEvidence.skillId,
        evidenceLevel: schema.studentSkillEvidence.evidenceLevel,
        evidenceSource: schema.studentSkillEvidence.evidenceSource,
        academicNodeId: schema.studentSkillEvidence.academicNodeId,
        courseId: schema.studentSkillEvidence.courseId,
        title: schema.studentSkillEvidence.title,
        description: schema.studentSkillEvidence.description,
        artifactUrl: schema.studentSkillEvidence.artifactUrl,
        verifiedAt: schema.studentSkillEvidence.verifiedAt,
        confidenceScore: schema.studentSkillEvidence.confidenceScore,
        createdAt: schema.studentSkillEvidence.createdAt,
        updatedAt: schema.studentSkillEvidence.updatedAt,
        skillName: schema.skills.name,
        skillCategory: schema.skills.category,
        skillSynonyms: schema.skills.synonyms,
        courseCode: schema.courses.code,
        courseTitle: schema.courses.title,
        nodeTitle: schema.academicNodes.title,
      })
      .from(schema.studentSkillEvidence)
      .leftJoin(schema.skills, eq(schema.studentSkillEvidence.skillId, schema.skills.id))
      .leftJoin(schema.courses, eq(schema.studentSkillEvidence.courseId, schema.courses.id))
      .leftJoin(
        schema.academicNodes,
        eq(schema.studentSkillEvidence.academicNodeId, schema.academicNodes.id),
      )
      .where(eq(schema.studentSkillEvidence.userId, userId))
      .orderBy(desc(schema.studentSkillEvidence.createdAt));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      skillId: r.skillId,
      evidenceLevel: r.evidenceLevel as StudentSkillEvidence['evidenceLevel'],
      evidenceSource: r.evidenceSource as StudentSkillEvidence['evidenceSource'],
      academicNodeId: r.academicNodeId,
      courseId: r.courseId,
      title: r.title,
      description: r.description,
      artifactUrl: r.artifactUrl,
      verifiedAt: r.verifiedAt,
      confidenceScore: r.confidenceScore,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      ...(r.skillName
        ? {
            skill: {
              id: r.skillId,
              name: r.skillName,
              category: r.skillCategory as Skill['category'],
              synonyms: (r.skillSynonyms as string[]) || [],
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
            },
          }
        : {}),
      course: r.courseCode
        ? ({
            id: r.courseId!,
            userId: r.userId,
            code: r.courseCode,
            title: r.courseTitle!,
            term: null,
            syllabusStatus: 'ready',
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          } as Course)
        : null,
      academicNode: r.nodeTitle
        ? ({
            id: r.academicNodeId!,
            courseId: r.courseId!,
            userId: r.userId,
            parentId: null,
            type: 'topic',
            title: r.nodeTitle,
            description: null,
            orderIndex: 0,
            origin: 'user',
            confidence: 1.0,
            needsReview: 'no',
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          } as AcademicNode)
        : null,
    }));
  }

  async createStudentSkillEvidence(
    data: Omit<StudentSkillEvidence, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<StudentSkillEvidence> {
    const rows = await this.db
      .insert(schema.studentSkillEvidence)
      .values({
        id: data.id,
        userId: data.userId,
        skillId: data.skillId,
        evidenceLevel: data.evidenceLevel,
        evidenceSource: data.evidenceSource,
        academicNodeId: data.academicNodeId ?? null,
        courseId: data.courseId ?? null,
        assessmentId: data.assessmentId ?? null,
        title: data.title,
        description: data.description ?? null,
        artifactUrl: data.artifactUrl ?? null,
        verifiedAt: data.verifiedAt ?? null,
        confidenceScore: data.confidenceScore || '0.400',
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      userId: r.userId,
      skillId: r.skillId,
      evidenceLevel: r.evidenceLevel as StudentSkillEvidence['evidenceLevel'],
      evidenceSource: r.evidenceSource as StudentSkillEvidence['evidenceSource'],
      academicNodeId: r.academicNodeId,
      courseId: r.courseId,
      assessmentId: r.assessmentId,
      title: r.title,
      description: r.description,
      artifactUrl: r.artifactUrl,
      verifiedAt: r.verifiedAt,
      confidenceScore: r.confidenceScore,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
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

    const existing = await this.db
      .select()
      .from(schema.studentSkillEvidence)
      .where(
        and(
          eq(schema.studentSkillEvidence.userId, data.userId),
          eq(schema.studentSkillEvidence.skillId, data.skillId),
        ),
      );

    const first = existing[0];
    if (first) {
      const curRank = rankMap[first.evidenceLevel] ?? 0;
      const newRank = rankMap[data.evidenceLevel] ?? 0;

      if (newRank >= curRank) {
        const rows = await this.db
          .update(schema.studentSkillEvidence)
          .set({
            evidenceLevel: data.evidenceLevel,
            evidenceSource: data.evidenceSource,
            academicNodeId: data.academicNodeId ?? first.academicNodeId,
            courseId: data.courseId ?? first.courseId,
            assessmentId: data.assessmentId ?? first.assessmentId,
            title: data.title,
            description: data.description ?? first.description,
            confidenceScore: data.confidenceScore,
            updatedAt: new Date(),
          })
          .where(eq(schema.studentSkillEvidence.id, first.id))
          .returning();
        const r = rows[0]!;
        return {
          id: r.id,
          userId: r.userId,
          skillId: r.skillId,
          evidenceLevel: r.evidenceLevel as StudentSkillEvidence['evidenceLevel'],
          evidenceSource: r.evidenceSource as StudentSkillEvidence['evidenceSource'],
          academicNodeId: r.academicNodeId,
          courseId: r.courseId,
          assessmentId: r.assessmentId,
          title: r.title,
          description: r.description,
          artifactUrl: r.artifactUrl,
          verifiedAt: r.verifiedAt,
          confidenceScore: r.confidenceScore,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      }
      return {
        id: first.id,
        userId: first.userId,
        skillId: first.skillId,
        evidenceLevel: first.evidenceLevel as StudentSkillEvidence['evidenceLevel'],
        evidenceSource: first.evidenceSource as StudentSkillEvidence['evidenceSource'],
        academicNodeId: first.academicNodeId,
        courseId: first.courseId,
        assessmentId: first.assessmentId,
        title: first.title,
        description: first.description,
        artifactUrl: first.artifactUrl,
        verifiedAt: first.verifiedAt,
        confidenceScore: first.confidenceScore,
        createdAt: first.createdAt,
        updatedAt: first.updatedAt,
      };
    }

    return this.createStudentSkillEvidence(data);
  }

  async listAssessmentsForUser(userId: string): Promise<Assessment[]> {
    const rows = await this.db
      .select()
      .from(schema.assessments)
      .where(eq(schema.assessments.userId, userId))
      .orderBy(desc(schema.assessments.date));
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      courseId: r.courseId,
      title: r.title,
      type: r.type as Assessment['type'],
      date: r.date,
      weightage: r.weightage,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async listAllAcademicNodesForUser(userId: string): Promise<AcademicNode[]> {
    const rows = await this.db
      .select()
      .from(schema.academicNodes)
      .where(eq(schema.academicNodes.userId, userId))
      .orderBy(asc(schema.academicNodes.orderIndex));
    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      userId: r.userId,
      parentId: r.parentId,
      type: r.type as AcademicNode['type'],
      title: r.title,
      description: r.description,
      orderIndex: r.orderIndex,
      origin: r.origin as AcademicNode['origin'],
      confidence: Number(r.confidence || 0.8),
      needsReview: r.needsReview as AcademicNode['needsReview'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  // --- Student Saved Opportunities ---
  async listStudentSavedOpportunities(userId: string): Promise<
    Array<
      StudentSavedOpportunity & {
        opportunity?: Opportunity & { company?: Company; roleFamily?: RoleFamily };
      }
    >
  > {
    const rows = await this.db
      .select({
        saved: schema.studentSavedOpportunities,
        opp: schema.opportunities,
        company: schema.companies,
        roleFamily: schema.roleFamilies,
      })
      .from(schema.studentSavedOpportunities)
      .leftJoin(
        schema.opportunities,
        eq(schema.studentSavedOpportunities.opportunityId, schema.opportunities.id),
      )
      .leftJoin(schema.companies, eq(schema.opportunities.companyId, schema.companies.id))
      .leftJoin(schema.roleFamilies, eq(schema.opportunities.roleFamilyId, schema.roleFamilies.id))
      .where(eq(schema.studentSavedOpportunities.userId, userId))
      .orderBy(desc(schema.studentSavedOpportunities.createdAt));

    return rows.map((r) => ({
      id: r.saved.id,
      userId: r.saved.userId,
      opportunityId: r.saved.opportunityId,
      customTitle: r.saved.customTitle,
      customCompany: r.saved.customCompany,
      sourceUrl: r.saved.sourceUrl,
      notes: r.saved.notes,
      status: r.saved.status as StudentSavedOpportunity['status'],
      createdAt: r.saved.createdAt,
      updatedAt: r.saved.updatedAt,
      ...(r.opp
        ? {
            opportunity: {
              ...this.mapOpportunityRow(r.opp),
              ...(r.company
                ? {
                    company: {
                      id: r.company.id,
                      name: r.company.name,
                      slug: r.company.slug,
                      websiteUrl: r.company.websiteUrl,
                      description: r.company.description,
                      industry: r.company.industry,
                      isVerified: r.company.isVerified,
                      createdAt: r.company.createdAt,
                      updatedAt: r.company.updatedAt,
                    },
                  }
                : {}),
              ...(r.roleFamily
                ? {
                    roleFamily: {
                      id: r.roleFamily.id,
                      name: r.roleFamily.name,
                      description: r.roleFamily.description,
                      createdAt: r.roleFamily.createdAt,
                      updatedAt: r.roleFamily.updatedAt,
                    },
                  }
                : {}),
            },
          }
        : {}),
    }));
  }

  async getStudentSavedOpportunity(
    id: string,
    userId: string,
  ): Promise<StudentSavedOpportunity | null> {
    const rows = await this.db
      .select()
      .from(schema.studentSavedOpportunities)
      .where(
        and(
          eq(schema.studentSavedOpportunities.id, id),
          eq(schema.studentSavedOpportunities.userId, userId),
        ),
      );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      userId: r.userId,
      opportunityId: r.opportunityId,
      customTitle: r.customTitle,
      customCompany: r.customCompany,
      sourceUrl: r.sourceUrl,
      notes: r.notes,
      status: r.status as StudentSavedOpportunity['status'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async createStudentSavedOpportunity(
    userId: string,
    data: StudentSavedOpportunityInput,
  ): Promise<StudentSavedOpportunity> {
    const rows = await this.db
      .insert(schema.studentSavedOpportunities)
      .values({
        userId,
        opportunityId: data.opportunityId ?? null,
        customTitle: data.customTitle ?? null,
        customCompany: data.customCompany ?? null,
        sourceUrl: data.sourceUrl ?? null,
        notes: data.notes ?? null,
        status: data.status ?? 'saved',
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      userId: r.userId,
      opportunityId: r.opportunityId,
      customTitle: r.customTitle,
      customCompany: r.customCompany,
      sourceUrl: r.sourceUrl,
      notes: r.notes,
      status: r.status as StudentSavedOpportunity['status'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async updateStudentSavedOpportunity(
    id: string,
    userId: string,
    updates: Partial<StudentSavedOpportunityInput>,
  ): Promise<StudentSavedOpportunity> {
    const patch: Partial<typeof schema.studentSavedOpportunities.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.customTitle !== undefined) patch.customTitle = updates.customTitle;
    if (updates.customCompany !== undefined) patch.customCompany = updates.customCompany;
    if (updates.sourceUrl !== undefined) patch.sourceUrl = updates.sourceUrl;

    const rows = await this.db
      .update(schema.studentSavedOpportunities)
      .set(patch)
      .where(
        and(
          eq(schema.studentSavedOpportunities.id, id),
          eq(schema.studentSavedOpportunities.userId, userId),
        ),
      )
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      userId: r.userId,
      opportunityId: r.opportunityId,
      customTitle: r.customTitle,
      customCompany: r.customCompany,
      sourceUrl: r.sourceUrl,
      notes: r.notes,
      status: r.status as StudentSavedOpportunity['status'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async deleteStudentSavedOpportunity(id: string, userId: string): Promise<void> {
    await this.db
      .delete(schema.studentSavedOpportunities)
      .where(
        and(
          eq(schema.studentSavedOpportunities.id, id),
          eq(schema.studentSavedOpportunities.userId, userId),
        ),
      );
  }

  // --- Concept Skill Mappings ---
  async listConceptSkillMappings(conceptName?: string): Promise<ConceptSkillMapping[]> {
    const rows = conceptName
      ? await this.db
          .select()
          .from(schema.conceptSkillMappings)
          .where(ilike(schema.conceptSkillMappings.conceptName, `%${conceptName}%`))
          .orderBy(asc(schema.conceptSkillMappings.conceptName))
      : await this.db
          .select()
          .from(schema.conceptSkillMappings)
          .orderBy(asc(schema.conceptSkillMappings.conceptName));

    return rows.map((r) => ({
      id: r.id,
      conceptName: r.conceptName,
      skillName: r.skillName,
      skillCategory: r.skillCategory as ConceptSkillMapping['skillCategory'],
      relevanceScore: r.relevanceScore,
      provenance: r.provenance as ConceptSkillMapping['provenance'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createConceptSkillMapping(
    data: Omit<ConceptSkillMapping, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ConceptSkillMapping> {
    const rows = await this.db
      .insert(schema.conceptSkillMappings)
      .values({
        conceptName: data.conceptName,
        skillName: data.skillName,
        skillCategory: data.skillCategory,
        relevanceScore: data.relevanceScore,
        provenance: data.provenance,
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      conceptName: r.conceptName,
      skillName: r.skillName,
      skillCategory: r.skillCategory as ConceptSkillMapping['skillCategory'],
      relevanceScore: r.relevanceScore,
      provenance: r.provenance as ConceptSkillMapping['provenance'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async ensureInitialConceptSkillMappings(
    mappings: readonly ConceptSkillMappingSeed[],
  ): Promise<void> {
    for (const m of mappings) {
      await this.db
        .insert(schema.conceptSkillMappings)
        .values({
          conceptName: m.conceptName,
          skillName: m.skillName,
          skillCategory: m.skillCategory,
          relevanceScore: m.relevanceScore,
          provenance: m.provenance,
        })
        .onConflictDoNothing();
    }
  }

  async deleteStudentSkillEvidence(id: string, userId: string): Promise<void> {
    await this.db
      .delete(schema.studentSkillEvidence)
      .where(
        and(eq(schema.studentSkillEvidence.id, id), eq(schema.studentSkillEvidence.userId, userId)),
      );
  }

  // --- Application Records ---
  async listApplicationRecords(userId: string): Promise<
    Array<
      ApplicationRecord & {
        opportunity?: Opportunity & { company?: Company; roleFamily?: RoleFamily };
      }
    >
  > {
    const rows = await this.db
      .select({
        record: schema.applicationRecords,
        opp: schema.opportunities,
        company: schema.companies,
        roleFamily: schema.roleFamilies,
      })
      .from(schema.applicationRecords)
      .leftJoin(
        schema.opportunities,
        eq(schema.applicationRecords.opportunityId, schema.opportunities.id),
      )
      .leftJoin(schema.companies, eq(schema.opportunities.companyId, schema.companies.id))
      .leftJoin(schema.roleFamilies, eq(schema.opportunities.roleFamilyId, schema.roleFamilies.id))
      .where(eq(schema.applicationRecords.userId, userId))
      .orderBy(desc(schema.applicationRecords.appliedAt));

    return rows.map((r) => ({
      id: r.record.id,
      userId: r.record.userId,
      opportunityId: r.record.opportunityId,
      status: r.record.status as ApplicationStatus,
      appliedAt: r.record.appliedAt,
      assessmentAt: r.record.assessmentAt,
      interviewAt: r.record.interviewAt,
      finalInterviewAt: r.record.finalInterviewAt,
      outcomeAt: r.record.outcomeAt,
      outcomeNotes: r.record.outcomeNotes,
      stateTransitions: (r.record.stateTransitions as ApplicationRecord['stateTransitions']) || [],
      createdAt: r.record.createdAt,
      updatedAt: r.record.updatedAt,
      ...(r.opp
        ? {
            opportunity: {
              ...this.mapOpportunityRow(r.opp),
              ...(r.company
                ? {
                    company: {
                      id: r.company.id,
                      name: r.company.name,
                      slug: r.company.slug,
                      websiteUrl: r.company.websiteUrl,
                      description: r.company.description,
                      createdAt: r.company.createdAt,
                      updatedAt: r.company.updatedAt,
                    },
                  }
                : {}),
              ...(r.roleFamily
                ? {
                    roleFamily: {
                      id: r.roleFamily.id,
                      name: r.roleFamily.name,
                      description: r.roleFamily.description,
                      createdAt: r.roleFamily.createdAt,
                      updatedAt: r.roleFamily.updatedAt,
                    },
                  }
                : {}),
            },
          }
        : {}),
    }));
  }

  async getApplicationRecord(id: string, userId: string): Promise<ApplicationRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.applicationRecords)
      .where(
        and(eq(schema.applicationRecords.id, id), eq(schema.applicationRecords.userId, userId)),
      );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      userId: r.userId,
      opportunityId: r.opportunityId,
      status: r.status as ApplicationStatus,
      appliedAt: r.appliedAt,
      assessmentAt: r.assessmentAt,
      interviewAt: r.interviewAt,
      finalInterviewAt: r.finalInterviewAt,
      outcomeAt: r.outcomeAt,
      outcomeNotes: r.outcomeNotes,
      stateTransitions: (r.stateTransitions as ApplicationRecord['stateTransitions']) || [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async createApplicationRecord(
    userId: string,
    opportunityId: string,
    notes?: string | null,
  ): Promise<ApplicationRecord> {
    const initialTransition = {
      from: 'applied' as ApplicationStatus,
      to: 'applied' as ApplicationStatus,
      timestamp: new Date().toISOString(),
      notes: notes ?? 'Application initiated by student',
    };

    const rows = await this.db
      .insert(schema.applicationRecords)
      .values({
        userId,
        opportunityId,
        status: 'applied',
        appliedAt: new Date(),
        outcomeNotes: notes ?? null,
        stateTransitions: [initialTransition],
      })
      .onConflictDoUpdate({
        target: [schema.applicationRecords.userId, schema.applicationRecords.opportunityId],
        set: {
          updatedAt: new Date(),
        },
      })
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      userId: r.userId,
      opportunityId: r.opportunityId,
      status: r.status as ApplicationStatus,
      appliedAt: r.appliedAt,
      assessmentAt: r.assessmentAt,
      interviewAt: r.interviewAt,
      finalInterviewAt: r.finalInterviewAt,
      outcomeAt: r.outcomeAt,
      outcomeNotes: r.outcomeNotes,
      stateTransitions: (r.stateTransitions as ApplicationRecord['stateTransitions']) || [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async updateApplicationStatus(
    id: string,
    userId: string,
    newStatus: ApplicationStatus,
    notes?: string | null,
  ): Promise<ApplicationRecord> {
    const existing = await this.getApplicationRecord(id, userId);
    if (!existing) {
      throw new Error('Application record not found.');
    }

    const now = new Date();
    const transition = {
      from: existing.status,
      to: newStatus,
      timestamp: now.toISOString(),
      notes: notes ?? null,
    };

    const updatedTransitions = [...existing.stateTransitions, transition];
    const updates: Partial<schema.NewApplicationRecordRow> = {
      status: newStatus,
      stateTransitions: updatedTransitions,
      updatedAt: now,
    };

    if (newStatus === 'assessment' && !existing.assessmentAt) {
      updates.assessmentAt = now;
    } else if (newStatus === 'interview' && !existing.interviewAt) {
      updates.interviewAt = now;
    } else if (newStatus === 'final_interview' && !existing.finalInterviewAt) {
      updates.finalInterviewAt = now;
    } else if (newStatus === 'offer' || newStatus === 'rejection' || newStatus === 'withdrawn') {
      updates.outcomeAt = now;
      if (notes) updates.outcomeNotes = notes;
    }

    const rows = await this.db
      .update(schema.applicationRecords)
      .set(updates)
      .where(
        and(eq(schema.applicationRecords.id, id), eq(schema.applicationRecords.userId, userId)),
      )
      .returning();
    const r = rows[0]!;
    return {
      id: r.id,
      userId: r.userId,
      opportunityId: r.opportunityId,
      status: r.status as ApplicationStatus,
      appliedAt: r.appliedAt,
      assessmentAt: r.assessmentAt,
      interviewAt: r.interviewAt,
      finalInterviewAt: r.finalInterviewAt,
      outcomeAt: r.outcomeAt,
      outcomeNotes: r.outcomeNotes,
      stateTransitions: (r.stateTransitions as ApplicationRecord['stateTransitions']) || [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapOpportunityRow(r: schema.OpportunityRow): Opportunity {
    return {
      id: r.id,
      companyId: r.companyId,
      roleFamilyId: r.roleFamilyId,
      title: r.title,
      opportunityType: r.opportunityType as Opportunity['opportunityType'],
      targetGraduationYears: (r.targetGraduationYears as number[]) || [],
      degreeLevels: (r.degreeLevels as string[]) || [],
      allowedMajors: (r.allowedMajors as string[]) || [],
      description: r.description,
      season: r.season,
      employmentType: r.employmentType as Opportunity['employmentType'],
      workplaceType: r.workplaceType as Opportunity['workplaceType'],
      status: r.status as Opportunity['status'],
      minGpa: r.minGpa,
      minExperienceMonths: r.minExperienceMonths,
      requiresWorkAuth: r.requiresWorkAuth as Opportunity['requiresWorkAuth'],
      sourceUrl: r.sourceUrl,
      sourceOrganization: r.sourceOrganization,
      retrievalTimestamp: r.retrievalTimestamp,
      publicationDate: r.publicationDate,
      expirationDate: r.expirationDate,
      lastValidTimestamp: r.lastValidTimestamp,
      extractionVersion: r.extractionVersion,
      contentHash: r.contentHash,
      ingestionProvider: r.ingestionProvider,
      isCanonical: r.isCanonical,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async close(): Promise<void> {
    await this.rawSql.end();
  }

  private mapResourceRow(r: schema.ResourceRow): Resource {
    return {
      id: r.id,
      userId: r.userId,
      courseId: r.courseId,
      title: r.title,
      type: r.type as Resource['type'],
      objectKey: r.objectKey,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      contentHash: r.contentHash,
      pageCount: r.pageCount,
      errorMessage: r.errorMessage,
      failedAt: r.failedAt,
      processedAt: r.processedAt,
      extractionVersion: r.extractionVersion,
      processingStatus: r.processingStatus as Resource['processingStatus'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
