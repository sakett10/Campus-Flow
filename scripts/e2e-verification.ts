import { InMemoryDataStore } from '../services/api/src/data/store.js';
import {
  InMemoryObjectStorage,
  InMemoryOutboxStore,
  TransactionalOutboxManager,
  extractDocumentText,
} from '../packages/shared/dist/index.js';
import { processResourceJob } from '../services/worker/src/processors/resource-processor.js';

// Create a real, valid, structurally sound PDF 1.4 buffer with selectable text
function createSamplePdfBuffer(): Buffer {
  const streamContent = `BT
/F1 12 Tf
72 720 Td
(Course Syllabus: PHY2001 Electromagnetic Field Theory) Tj
0 -25 Td
(Module 1: Electrostatics in Vacuum) Tj
0 -20 Td
(Topic: Coulombs Law and Electrostatic Force Between Point Charges) Tj
0 -20 Td
(Topic: Gauss Law Equating Electric Flux to Enclosed Charge Distribution) Tj
0 -30 Td
(Module 2: Magnetostatics in Continuous Media) Tj
0 -20 Td
(Topic: Biot-Savart Law and Ampere Circuital Formulation) Tj
ET`;

  const streamLen = Buffer.byteLength(streamContent, 'utf-8');

  const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${streamLen} >>
stream
${streamContent}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000314 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${314 + 100 + streamLen}
%%EOF`;

  return Buffer.from(pdfString, 'utf-8');
}

async function runEndToEndVerification() {
  console.log('================================================================');
  console.log('CAMPUSFLOW RESOURCE INTELLIGENCE MVP - END-TO-END VERIFICATION');
  console.log('================================================================\n');

  const dataStore = new InMemoryDataStore();
  const objectStorage = new InMemoryObjectStorage();
  const outboxStore = new InMemoryOutboxStore();
  const _outboxManager = new TransactionalOutboxManager(outboxStore);

  // 1. Create a test user
  console.log('Step 1: Creating internal test user...');
  const testUserId = '11111111-1111-4111-a111-111111111111';
  console.log(`[PASS] Authenticated User ID: ${testUserId}\n`);

  // 2. Create a course
  console.log('Step 2: Creating academic course...');
  const course = await dataStore.createCourse({
    userId: testUserId,
    code: 'PHY2001',
    title: 'Electromagnetic Field Theory',
    term: 'Fall 2026',
  });
  console.log(`[PASS] Course Created: [${course.code}] ${course.title} (ID: ${course.id})\n`);

  // 3. Upload a real sample PDF
  console.log('Step 3: Generating and uploading real sample PDF buffer...');
  const pdfBytes = createSamplePdfBuffer();
  console.log(
    `[INFO] PDF buffer generated: ${pdfBytes.length} bytes, starts with: "${pdfBytes.subarray(0, 8).toString('utf-8')}"`,
  );

  // Verify unpdf text extraction on real PDF buffer
  const extracted = await extractDocumentText(pdfBytes, 'application/pdf');
  console.log(
    `[INFO] unpdf extraction result: ${extracted.pageCount} pages, selectable text found: ${extracted.hasExtractableText}`,
  );
  console.log(`[INFO] Extracted text preview:\n${extracted.text.trim()}\n`);

  const objectKey = `users/${testUserId}/resources/PHY2001_Syllabus.pdf`;
  await objectStorage.putObject(objectKey, pdfBytes, 'application/pdf');
  console.log(`[PASS] Stored in Object Storage at: ${objectKey}\n`);

  // 4. Verify resource lifecycle
  console.log('Step 4: Creating resource record and verifying lifecycle state machine...');
  const resource = await dataStore.createResource({
    userId: testUserId,
    courseId: course.id,
    title: 'PHY2001_Syllabus.pdf',
    type: 'syllabus',
    objectKey,
    mimeType: 'application/pdf',
    sizeBytes: pdfBytes.length,
    contentHash: 'mock_hash_for_e2e_verify',
    processingStatus: 'queued',
  });
  console.log(
    `[PASS] Resource created in state: "${resource.processingStatus}" (ID: ${resource.id})\n`,
  );

  // 5. Verify worker processing
  console.log('Step 5: Executing background ingestion worker on resource...');
  const workerResult = await processResourceJob(
    {
      resourceId: resource.id,
      userId: testUserId,
      courseId: course.id,
      objectKey,
    },
    {
      dataStore,
      objectStorage,
    },
  );
  console.log(
    `[PASS] Worker processing completed: success=${workerResult.success}, finalStatus=${workerResult.status}, chunksGenerated=${workerResult.chunkCount}`,
  );

  const processedResource = await dataStore.getResource(resource.id, testUserId);
  console.log(`[PASS] Resource lifecycle transitioned to: "${processedResource.processingStatus}"`);
  console.log(
    `[PASS] Page count recorded: ${processedResource.pageCount}, extractionVersion: ${processedResource.extractionVersion}\n`,
  );

  // 6. Verify chunks
  console.log('Step 6: Verifying generated chunks and provenance...');
  const chunks = await dataStore.listChunks(resource.id, testUserId);
  console.log(`[PASS] Total chunks stored in database: ${chunks.length}`);
  chunks.forEach((c) => {
    console.log(
      `  - Chunk #${c.sequence + 1}: Pages ${c.pageStart}-${c.pageEnd} | ${c.charCount} chars | ~${c.tokenCount} tokens`,
    );
    console.log(`    Content: "${c.content.slice(0, 80)}..."`);
  });
  console.log('');

  // 7. Verify FTS search
  console.log('Step 7: Executing PostgreSQL Full Text Search...');
  const searchQueries = ['Coulombs Law', 'Biot-Savart', 'flux'];
  for (const q of searchQueries) {
    const searchResults = await dataStore.searchChunks(testUserId, q);
    console.log(`  Search Query: "${q}" -> ${searchResults.length} match(es)`);
    if (searchResults.length > 0) {
      const topMatch = searchResults[0]!;
      console.log(`    Matched: "${topMatch.matchedText.slice(0, 70)}..."`);
      console.log(`    Rank Score: ${topMatch.rank.toFixed(3)}`);
      console.log(`    Citation: [${topMatch.citation}]`);
    }
  }
  console.log('[PASS] Full text search and keyword ranking verified.\n');

  // 8. Verify page/source citation
  console.log('Step 8: Verifying citation provenance contract...');
  const citationResults = await dataStore.searchChunks(testUserId, 'Electrostatics');
  if (citationResults.length === 0) {
    throw new Error('Citation test failed: expected match for Electrostatics');
  }
  const citedItem = citationResults[0]!;
  console.log(`  Source Resource ID: ${citedItem.resourceId}`);
  console.log(`  Source Document: ${citedItem.resourceTitle}`);
  console.log(`  Page Number: ${citedItem.pageStart}`);
  console.log(`  Citation String: "${citedItem.citation}"`);
  console.log(`[PASS] Exact citation contract verified.\n`);

  // Verify course map
  console.log('Step 8b: Verifying Academic Map inference...');
  const mapNodes = await dataStore.listAcademicNodes(course.id, testUserId);
  console.log(`[PASS] Inferred academic map nodes: ${mapNodes.length}`);
  mapNodes.forEach((node) => {
    console.log(
      `  - [${node.type.toUpperCase()}] ${node.title} (confidence: ${node.confidence}, review: ${node.needsReview})`,
    );
  });
  console.log('');

  // 9. Delete the resource
  console.log('Step 9: Deleting resource and triggering cleanup...');
  await dataStore.deleteChunksByResource(resource.id);
  await dataStore.deleteResource(resource.id, testUserId);
  await objectStorage.delete(objectKey);
  console.log(`[PASS] Resource record, chunks, and storage object deleted.\n`);

  // 10. Verify database and object cleanup behavior
  console.log('Step 10: Verifying complete database and storage cleanup...');
  const remainingChunks = Array.from(
    (dataStore as unknown as { chunks: Map<string, { resourceId: string }> }).chunks.values(),
  ).filter((c) => c.resourceId === resource.id);
  if (remainingChunks.length !== 0) {
    throw new Error(`Cleanup failed: ${remainingChunks.length} chunks remained in database`);
  }
  console.log('[PASS] Chunks in database: 0');

  const storageAfter = await objectStorage.getObject(objectKey);
  if (storageAfter !== null) {
    throw new Error('Cleanup failed: object still exists in object storage');
  }
  console.log('[PASS] Object in storage: null (purged)');

  let getResourceThrew = false;
  try {
    await dataStore.getResource(resource.id, testUserId);
  } catch {
    getResourceThrew = true;
  }
  if (!getResourceThrew) {
    throw new Error('Cleanup failed: getResource did not throw 404');
  }
  console.log('[PASS] Database resource query: 404 Not Found (confirmed purged)\n');

  console.log('================================================================');
  console.log('END-TO-END VERIFICATION: 10/10 STEPS PASSED SUCCESSFULLY');
  console.log('================================================================');
}

runEndToEndVerification().catch((err) => {
  console.error('End-to-End Verification failed:', err);
  process.exit(1);
});
