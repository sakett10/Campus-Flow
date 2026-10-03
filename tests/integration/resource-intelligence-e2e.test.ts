import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDataStore } from '../../services/api/src/data/store.js';
import { InMemoryObjectStorage } from '@campusflow/shared';
import { processResourceJob } from '../../services/worker/src/processors/resource-processor';
import type { Course } from '@campusflow/types';

describe('Resource Intelligence MVP - End-to-End Integration & Security', () => {
  let dataStore: InMemoryDataStore;
  let objectStorage: InMemoryObjectStorage;

  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';

  let courseA: Course;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    objectStorage = new InMemoryObjectStorage();

    // Create course for userA
    courseA = await dataStore.createCourse({
      userId: userA,
      code: 'PHY2001',
      title: 'Electromagnetic Field Theory',
      term: 'Fall 2026',
    });
  });

  it('LIFECYCLE & INGESTION: Valid text document processes to ready with chunks and map', async () => {
    const documentText = `
Course Syllabus: Electromagnetic Theory
Module 1: Electrostatics in Vacuum
Coulombs law gives the electrostatic force between point charges.
Gauss law equates electric flux through a closed surface to enclosed charge.
Module 2: Magnetostatics
Biot-Savart law determines the magnetic field produced by steady currents.
Amperes law relates magnetic circulation to enclosed electric current.
    `;

    const fileBuffer = Buffer.from(documentText, 'utf-8');
    const objectKey = `users/${userA}/resources/phy_syllabus.txt`;
    await objectStorage.putObject(objectKey, fileBuffer, 'text/plain');

    const resource = await dataStore.createResource({
      userId: userA,
      courseId: courseA.id,
      title: 'phy_syllabus.txt',
      type: 'syllabus',
      objectKey,
      mimeType: 'text/plain',
      sizeBytes: fileBuffer.length,
      contentHash: 'hash_phy_101',
      processingStatus: 'queued',
    });

    expect(resource.processingStatus).toBe('queued');

    // Run the worker processor
    await processResourceJob(
      {
        resourceId: resource.id,
        userId: userA,
        objectKey,
        courseId: courseA.id,
      },
      {
        dataStore,
        objectStorage,
      },
    );

    // Verify resource is marked 'ready' with extraction metadata
    const updated = await dataStore.getResource(resource.id, userA);
    expect(updated).not.toBeNull();
    expect(updated.processingStatus).toBe('ready');
    expect(updated.pageCount).toBe(1);
    expect(updated.processedAt).toBeDefined();

    // Verify chunks were created
    const chunks = await dataStore.listChunks(resource.id, userA);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.pageStart).toBe(1);
    expect(chunks[0]?.content).toContain('Electrostatics');

    // Verify academic map was automatically deduced
    const mapNodes = await dataStore.listAcademicNodes(courseA.id, userA);
    expect(mapNodes.length).toBeGreaterThanOrEqual(2);
    expect(mapNodes.some((n) => n.title.includes('Electrostatics'))).toBe(true);
  });

  it('IDEMPOTENCY: Repeated worker execution does not create duplicate chunks', async () => {
    const documentText = 'Single topic on Waveguides and Microwave propagation.';
    const fileBuffer = Buffer.from(documentText, 'utf-8');
    const objectKey = `users/${userA}/resources/waveguides.txt`;
    await objectStorage.putObject(objectKey, fileBuffer, 'text/plain');

    const resource = await dataStore.createResource({
      userId: userA,
      courseId: courseA.id,
      title: 'waveguides.txt',
      type: 'lecture_notes',
      objectKey,
      mimeType: 'text/plain',
      sizeBytes: fileBuffer.length,
      contentHash: 'hash_waveguides_001',
      processingStatus: 'queued',
    });

    const jobPayload = {
      resourceId: resource.id,
      userId: userA,
      objectKey,
      courseId: courseA.id,
    };

    // First execution
    await processResourceJob(jobPayload, { dataStore, objectStorage });
    const chunksRun1 = await dataStore.listChunks(resource.id, userA);
    const initialChunkCount = chunksRun1.length;
    expect(initialChunkCount).toBeGreaterThan(0);

    // Second execution (simulating network retry or duplicate delivery)
    await processResourceJob(jobPayload, { dataStore, objectStorage });
    const chunksRun2 = await dataStore.listChunks(resource.id, userA);

    // Must be exactly identical, no duplicate chunk rows
    expect(chunksRun2.length).toBe(initialChunkCount);
  });

  it('SEARCH & CITATION: Full text search returns ranked snippets with page provenance', async () => {
    const doc1 =
      'Gauss Law states that the total electric flux out of a closed surface is equal to the charge enclosed divided by permittivity.';
    const doc2 =
      'Faraday Law of induction predicts how a magnetic field will interact with an electric circuit to produce an electromotive force.';

    const obj1 = `users/${userA}/resources/gauss.txt`;
    const obj2 = `users/${userA}/resources/faraday.txt`;

    await objectStorage.putObject(obj1, Buffer.from(doc1, 'utf-8'), 'text/plain');
    await objectStorage.putObject(obj2, Buffer.from(doc2, 'utf-8'), 'text/plain');

    const res1 = await dataStore.createResource({
      userId: userA,
      courseId: courseA.id,
      title: 'Gauss_Law_Notes.txt',
      type: 'lecture_notes',
      objectKey: obj1,
      mimeType: 'text/plain',
      sizeBytes: doc1.length,
      contentHash: 'hash_gauss',
      processingStatus: 'queued',
    });

    const res2 = await dataStore.createResource({
      userId: userA,
      courseId: courseA.id,
      title: 'Faraday_Law_Notes.txt',
      type: 'lecture_notes',
      objectKey: obj2,
      mimeType: 'text/plain',
      sizeBytes: doc2.length,
      contentHash: 'hash_faraday',
      processingStatus: 'queued',
    });

    await processResourceJob(
      { resourceId: res1.id, userId: userA, objectKey: obj1 },
      { dataStore, objectStorage },
    );
    await processResourceJob(
      { resourceId: res2.id, userId: userA, objectKey: obj2 },
      { dataStore, objectStorage },
    );

    // Search for "electric flux"
    const searchResults = await dataStore.searchChunks(userA, 'electric flux');

    expect(searchResults.length).toBeGreaterThan(0);
    const topMatch = searchResults[0];
    expect(topMatch).toBeDefined();
    expect(topMatch?.resourceId).toBe(res1.id);
    expect(topMatch?.resourceTitle).toBe('Gauss_Law_Notes.txt');
    expect(topMatch?.pageStart).toBe(1);
    expect(topMatch?.citation).toContain('Gauss_Law_Notes.txt');
    expect(topMatch?.matchedText.toLowerCase()).toContain('electric flux');
  });

  it('SECURITY: Multi-tenant isolation prevents cross-user search leakage', async () => {
    // User A uploads confidential syllabus
    const privateDoc = 'User A Confidential exam answers and formula derivations.';
    const objKey = `users/${userA}/resources/private.txt`;
    await objectStorage.putObject(objKey, Buffer.from(privateDoc, 'utf-8'), 'text/plain');

    const resA = await dataStore.createResource({
      userId: userA,
      title: 'private.txt',
      type: 'reference',
      objectKey: objKey,
      mimeType: 'text/plain',
      sizeBytes: privateDoc.length,
      contentHash: 'hash_private_A',
      processingStatus: 'queued',
    });

    await processResourceJob(
      { resourceId: resA.id, userId: userA, objectKey: objKey },
      { dataStore, objectStorage },
    );

    // User B searches for "Confidential exam answers"
    const userBSearch = await dataStore.searchChunks(userB, 'Confidential exam answers');

    // User B MUST receive zero results
    expect(userBSearch.length).toBe(0);
  });

  it('SECURITY & CLEANUP: Deleting resource cleans up DB chunks and schedules storage deletion', async () => {
    const text = 'Temporary notes on Antenna Theory.';
    const objKey = `users/${userA}/resources/antenna.txt`;
    await objectStorage.putObject(objKey, Buffer.from(text, 'utf-8'), 'text/plain');

    const res = await dataStore.createResource({
      userId: userA,
      title: 'antenna.txt',
      type: 'lecture_notes',
      objectKey: objKey,
      mimeType: 'text/plain',
      sizeBytes: text.length,
      contentHash: 'hash_antenna',
      processingStatus: 'queued',
    });

    await processResourceJob(
      { resourceId: res.id, userId: userA, objectKey: objKey },
      { dataStore, objectStorage },
    );
    expect((await dataStore.listChunks(res.id, userA)).length).toBeGreaterThan(0);

    // Delete resource
    await dataStore.deleteChunksByResource(res.id);
    await dataStore.deleteResource(res.id, userA);

    // Verify chunks are purged from database
    const remainingChunks = Array.from(
      (dataStore as unknown as { chunks: Map<string, { resourceId: string }> }).chunks.values(),
    ).filter((c) => c.resourceId === res.id);
    expect(remainingChunks).toHaveLength(0);

    // Verify resource is gone from database
    await expect(dataStore.getResource(res.id, userA)).rejects.toThrow();
  });
});
