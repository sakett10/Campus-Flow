import type {
  Course,
  Assessment,
  Resource,
  User,
  ResourceChunk,
  AcademicNode,
  SearchResultItem,
} from '@campusflow/types';
import { AppError, isValidUuid, assertOwnership, sanitizeSearchQuery } from '@campusflow/shared';

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
  getAssessment(id: string, requesterUserId: string): Promise<Assessment>;
  listAssessments(userId: string, courseId?: string): Promise<Assessment[]>;
  createAssessment(assessment: {
    userId: string;
    courseId: string;
    title: string;
    type: Assessment['type'];
    date?: Date | null | undefined;
    weightage?: string | null | undefined;
  }): Promise<Assessment>;

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
  deleteResource(id: string, requesterUserId: string): Promise<void>;

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

  deleteUser(id: string): Promise<void>;
}

export class InMemoryDataStore implements DataStore {
  private users: Map<string, User> = new Map();
  private courses: Map<string, Course> = new Map();
  private assessments: Map<string, Assessment> = new Map();
  private resources: Map<string, Resource> = new Map();
  private chunks: Map<string, ResourceChunk> = new Map();
  private academicNodes: Map<string, AcademicNode> = new Map();

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

    // Cascade delete child assessments
    for (const [aId, assessment] of this.assessments.entries()) {
      if (assessment.courseId === course.id) {
        this.assessments.delete(aId);
      }
    }

    // Cascade delete academic nodes
    for (const [nId, node] of this.academicNodes.entries()) {
      if (node.courseId === course.id) {
        this.academicNodes.delete(nId);
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

  async getAssessment(id: string, requesterUserId: string): Promise<Assessment> {
    if (!isValidUuid(id)) {
      throw AppError.badRequest('Invalid assessment ID format: must be a valid UUID.');
    }
    const assessment = this.assessments.get(id);
    if (!assessment) {
      throw AppError.notFound('Assessment not found.');
    }
    assertOwnership(assessment.userId, requesterUserId, 'Assessment');
    return assessment;
  }

  async listAssessments(userId: string, courseId?: string): Promise<Assessment[]> {
    if (!isValidUuid(userId)) {
      throw AppError.badRequest('Invalid user ID format.');
    }
    return Array.from(this.assessments.values()).filter(
      (a) => a.userId === userId && (!courseId || a.courseId === courseId),
    );
  }

  async createAssessment(data: {
    userId: string;
    courseId: string;
    title: string;
    type: Assessment['type'];
    date?: Date | null | undefined;
    weightage?: string | null | undefined;
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
      weightage: data.weightage || null,
      createdAt: now,
      updatedAt: now,
    };
    this.assessments.set(id, assessment);
    return assessment;
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

  clear(): void {
    this.users.clear();
    this.courses.clear();
    this.assessments.clear();
    this.resources.clear();
    this.chunks.clear();
    this.academicNodes.clear();
  }
}

export const defaultStore = new InMemoryDataStore();
