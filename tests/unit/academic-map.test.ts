import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDataStore } from '../../services/api/src/data/store.js';
import { InMemoryObjectStorage } from '@campusflow/shared';
import { processResourceJob } from '../../services/worker/src/processors/resource-processor.js';
import type { Course } from '@campusflow/types';

describe('Academic Map & Knowledge Provenance Unit Suite', () => {
  let dataStore: InMemoryDataStore;
  let objectStorage: InMemoryObjectStorage;

  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';

  let courseA: Course;
  let courseB: Course;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    objectStorage = new InMemoryObjectStorage();

    courseA = await dataStore.createCourse({
      userId: userA,
      code: 'CSE3001',
      title: 'Database Systems & Architecture',
      term: 'Fall 2026',
    });

    courseB = await dataStore.createCourse({
      userId: userB,
      code: 'MAT2001',
      title: 'Linear Algebra',
      term: 'Fall 2026',
    });
  });

  it('1. Course & Academic Map Ownership: User cannot access another user map or nodes', async () => {
    // User A creates module and topic
    const [mod] = await dataStore.createAcademicNodes([
      {
        courseId: courseA.id,
        userId: userA,
        parentId: null,
        type: 'module',
        title: 'Module 1: Relational Algebra',
        description: 'Formal relational query languages',
        orderIndex: 0,
        origin: 'user',
        confidence: 1.0,
        needsReview: 'no',
      },
    ]);

    expect(mod).toBeDefined();

    // User A can list academic nodes
    const userANodes = await dataStore.listAcademicNodes(courseA.id, userA);
    expect(userANodes.length).toBe(1);
    expect(userANodes[0]?.title).toBe('Module 1: Relational Algebra');

    // User B querying User A's course map throws forbidden / not found
    await expect(dataStore.listAcademicNodes(courseA.id, userB)).rejects.toThrow();

    // User A querying User B's course map throws forbidden / not found
    await expect(dataStore.listAcademicNodes(courseB.id, userA)).rejects.toThrow();

    // User B cannot edit User A's academic node
    await expect(
      dataStore.updateAcademicNode(mod!.id, userB, { title: 'Hacked Title' }),
    ).rejects.toThrow();

    // User B cannot delete User A's academic node
    await expect(dataStore.deleteAcademicNode(mod!.id, userB)).rejects.toThrow();
  });

  it('2. Resource -> Topic Relationship with Page Provenance', async () => {
    const syllabusText = `
Course: Database Systems
Module 1: Relational Model and Algebra
Topic: Tuple Relational Calculus
Topic: Domain Relational Calculus
Module 2: Transaction Processing and Concurrency Control
Topic: Two Phase Locking Protocol
Topic: ACID Properties and Serializability
`;
    const objectKey = `users/${userA}/resources/db_syllabus.txt`;
    await objectStorage.putObject(objectKey, Buffer.from(syllabusText, 'utf-8'), 'text/plain');

    const res = await dataStore.createResource({
      userId: userA,
      courseId: courseA.id,
      title: 'db_syllabus.txt',
      type: 'syllabus',
      objectKey,
      mimeType: 'text/plain',
      sizeBytes: syllabusText.length,
      processingStatus: 'queued',
    });

    // Run worker
    await processResourceJob(
      {
        resourceId: res.id,
        userId: userA,
        courseId: courseA.id,
        objectKey,
      },
      { dataStore, objectStorage },
    );

    // Verify hierarchical nodes created
    const nodesWithResources = await dataStore.listAcademicNodesWithResources(courseA.id, userA);
    expect(nodesWithResources.length).toBeGreaterThanOrEqual(4);

    const module1 = nodesWithResources.find((n) => n.title.includes('Relational Model'));
    expect(module1).toBeDefined();
    expect(module1?.type).toBe('module');

    const trcTopic = nodesWithResources.find((n) =>
      n.title.toLowerCase().includes('tuple relational calculus'),
    );
    expect(trcTopic).toBeDefined();
    expect(trcTopic?.type).toBe('topic');
    expect(trcTopic?.parentId).toBe(module1?.id);

    // Verify resource is linked to topic with provenance
    expect(trcTopic?.resources).toBeDefined();
    expect(trcTopic?.resources?.length).toBeGreaterThan(0);
    expect(trcTopic?.resources?.[0]?.resourceId).toBe(res.id);
    expect(trcTopic?.resources?.[0]?.resourceTitle).toBe('db_syllabus.txt');
  });

  it('3. Multiple Resources -> Same Topic Linking', async () => {
    // 1. Initial syllabus creates topics
    const syllabus = `
Module 1: Concurrency Control
Topic: Two Phase Locking Protocol
`;
    const objSyllabus = `users/${userA}/resources/syllabus.txt`;
    await objectStorage.putObject(objSyllabus, Buffer.from(syllabus, 'utf-8'), 'text/plain');

    const res1 = await dataStore.createResource({
      userId: userA,
      courseId: courseA.id,
      title: 'Syllabus.txt',
      type: 'syllabus',
      objectKey: objSyllabus,
      mimeType: 'text/plain',
      sizeBytes: syllabus.length,
      processingStatus: 'queued',
    });

    await processResourceJob(
      { resourceId: res1.id, userId: userA, courseId: courseA.id, objectKey: objSyllabus },
      { dataStore, objectStorage },
    );

    // 2. Second lecture note resource covers the same topic
    const lectureNotes = `
Lecture 14: Strict Two Phase Locking Protocol and Deadlock Prevention in Database Engines.
`;
    const objLecture = `users/${userA}/resources/lecture14.txt`;
    await objectStorage.putObject(objLecture, Buffer.from(lectureNotes, 'utf-8'), 'text/plain');

    const res2 = await dataStore.createResource({
      userId: userA,
      courseId: courseA.id,
      title: 'Lecture14_2PL.txt',
      type: 'lecture_notes',
      objectKey: objLecture,
      mimeType: 'text/plain',
      sizeBytes: lectureNotes.length,
      processingStatus: 'queued',
    });

    await processResourceJob(
      { resourceId: res2.id, userId: userA, courseId: courseA.id, objectKey: objLecture },
      { dataStore, objectStorage },
    );

    const nodesWithResources = await dataStore.listAcademicNodesWithResources(courseA.id, userA);
    const twoPlTopic = nodesWithResources.find((n) =>
      n.title.toLowerCase().includes('two phase locking'),
    );

    expect(twoPlTopic).toBeDefined();
    // Topic should now have links to BOTH resources!
    expect(twoPlTopic?.resources?.length).toBe(2);
    const linkedResourceIds = twoPlTopic?.resources?.map((r) => r.resourceId);
    expect(linkedResourceIds).toContain(res1.id);
    expect(linkedResourceIds).toContain(res2.id);
  });

  it('4. Topic -> Multiple Resources & Manual Link / Unlink User Correction', async () => {
    // Manually create a topic
    const [mod] = await dataStore.createAcademicNodes([
      {
        courseId: courseA.id,
        userId: userA,
        parentId: null,
        type: 'module',
        title: 'Module 3: Indexing and B-Trees',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);

    const [topic] = await dataStore.createAcademicNodes([
      {
        courseId: courseA.id,
        userId: userA,
        parentId: mod!.id,
        type: 'topic',
        title: 'B+ Tree Node Splitting and Merging',
        orderIndex: 0,
        origin: 'user',
        needsReview: 'no',
      },
    ]);

    // Create a resource
    const res = await dataStore.createResource({
      userId: userA,
      courseId: courseA.id,
      title: 'BTree_Reference.pdf',
      type: 'reference_book',
      objectKey: `users/${userA}/resources/btree.pdf`,
      mimeType: 'application/pdf',
      processingStatus: 'ready',
    });

    // Manually link resource to topic with page provenance (p. 45-52)
    const link = await dataStore.linkResourceToAcademicNode({
      nodeId: topic!.id,
      resourceId: res.id,
      userId: userA,
      courseId: courseA.id,
      pageStart: 45,
      pageEnd: 52,
      origin: 'user',
    });

    expect(link.id).toBeDefined();
    expect(link.pageStart).toBe(45);
    expect(link.pageEnd).toBe(52);

    // Verify listing
    const nodeLinks = await dataStore.listResourceLinksForNode(topic!.id, userA);
    expect(nodeLinks.length).toBe(1);
    expect(nodeLinks[0]?.resourceId).toBe(res.id);

    // Delete the link
    await dataStore.deleteResourceLink(link.id, userA);
    const nodeLinksAfter = await dataStore.listResourceLinksForNode(topic!.id, userA);
    expect(nodeLinksAfter.length).toBe(0);
  });

  it('5. User Correction: Rename, Reorder, and Move Topic across Modules', async () => {
    const [mod1, mod2] = await dataStore.createAcademicNodes([
      {
        courseId: courseA.id,
        userId: userA,
        parentId: null,
        type: 'module',
        title: 'Module 1: Query Optimization',
        orderIndex: 0,
        origin: 'model',
        needsReview: 'yes',
      },
      {
        courseId: courseA.id,
        userId: userA,
        parentId: null,
        type: 'module',
        title: 'Module 2: Storage Engines',
        orderIndex: 1,
        origin: 'model',
        needsReview: 'no',
      },
    ]);

    const [top] = await dataStore.createAcademicNodes([
      {
        courseId: courseA.id,
        userId: userA,
        parentId: mod1!.id,
        type: 'topic',
        title: 'Cost Estimation Algorithms',
        orderIndex: 0,
        origin: 'model',
        needsReview: 'yes',
      },
    ]);

    // Rename topic and approve review
    const updated = await dataStore.updateAcademicNode(top!.id, userA, {
      title: 'Cost-Based Query Optimization & Join Ordering',
      needsReview: 'no',
      orderIndex: 2,
      parentId: mod2!.id, // moved to Module 2
    });

    expect(updated.title).toBe('Cost-Based Query Optimization & Join Ordering');
    expect(updated.origin).toBe('user');
    expect(updated.needsReview).toBe('no');
    expect(updated.orderIndex).toBe(2);
    expect(updated.parentId).toBe(mod2!.id);
  });

  it('6. Failed Resource Processing does not corrupt or create invalid academic map state', async () => {
    // Attempt processing an invalid or corrupt file
    const corruptKey = `users/${userA}/resources/corrupt.pdf`;
    await objectStorage.putObject(
      corruptKey,
      Buffer.from('%PDF-corrupted-bytes-unreadable', 'utf-8'),
      'application/pdf',
    );

    const corruptRes = await dataStore.createResource({
      userId: userA,
      courseId: courseA.id,
      title: 'corrupt.pdf',
      type: 'syllabus',
      objectKey: corruptKey,
      mimeType: 'application/pdf',
      processingStatus: 'queued',
    });

    const result = await processResourceJob(
      {
        resourceId: corruptRes.id,
        userId: userA,
        courseId: courseA.id,
        objectKey: corruptKey,
      },
      { dataStore, objectStorage },
    );

    // Extraction should fail cleanly
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');

    // Academic map should remain clean (0 nodes created from failed file)
    const map = await dataStore.listAcademicNodes(courseA.id, userA);
    expect(map.length).toBe(0);
  });
});
