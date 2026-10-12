import { describe, it, expect } from 'vitest';
import {
  extractDocumentText,
  extractPdfText,
  parseSyllabusDocument,
  validateFileBytes,
  AppError,
} from '@campusflow/shared';

// Deterministic valid PDF with identifiable syllabus content
export function createDeterministicSyllabusPdf(content: string | string[]): Buffer {
  const lines = Array.isArray(content) ? content : [content];
  const textCommands = lines
    .map((l, i) => `${i === 0 ? '' : '0 -20 Td\n'}(${l.replace(/[()\\]/g, '\\$&')}) Tj`)
    .join('\n');
  const contentStream = `BT\n/F1 12 Tf\n50 750 Td\n${textCommands}\nET`;
  const streamLength = Buffer.byteLength(contentStream, 'utf-8');

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${contentStream}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
${[
  '0000000000 65535 f ',
  '0000000009 00000 n ',
  '0000000058 00000 n ',
  '0000000115 00000 n ',
  '0000000244 00000 n ',
  '0000000300 00000 n ',
].join('\n')}
trailer
<< /Size 6 /Root 1 0 R >>
startxref
380
%%EOF`;

  return Buffer.from(pdf, 'utf-8');
}

// Deterministic scanned / empty PDF fixture with no extractable text
export function createEmptyScannedPdf(): Buffer {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
${['0000000000 65535 f ', '0000000009 00000 n ', '0000000058 00000 n ', '0000000115 00000 n '].join(
  '\n',
)}
trailer
<< /Size 4 /Root 1 0 R >>
startxref
200
%%EOF`;

  return Buffer.from(pdf, 'utf-8');
}

describe('PDF Syllabus Extraction & Parser Regression Suite', () => {
  it('1. Extracts text and page metadata from a valid PDF without neutering the buffer', async () => {
    const rawSyllabusText = 'Course Code: CSE3002 Database Systems Fall 2026';
    const pdfBuffer = createDeterministicSyllabusPdf(rawSyllabusText);
    const originalByteLength = pdfBuffer.byteLength;

    const validation = validateFileBytes(pdfBuffer, 'syllabus_cs3002.pdf');
    expect(validation.isValid).toBe(true);
    expect(validation.detectedMimeType).toBe('application/pdf');

    const result = await extractPdfText(pdfBuffer);

    // Verify caller buffer was NOT detached or neutered
    expect(pdfBuffer.byteLength).toBe(originalByteLength);
    expect(pdfBuffer.buffer.byteLength).toBeGreaterThan(0);

    // Verify extraction outputs
    expect(result.pageCount).toBe(1);
    expect(result.pages.length).toBe(1);
    expect(result.pages[0]?.pageNumber).toBe(1);
    expect(result.pages[0]?.text).toContain('CSE3002');
    expect(result.hasExtractableText).toBe(true);
    expect(result.text).toContain('Database Systems');
  });

  it('2. Passes extracted PDF text into syllabus parser to generate structured course nodes', async () => {
    const syllabusLines = [
      'Course Code: CSE3002',
      'Course Title: Database Systems',
      'Semester: Fall 2026',
      'Module 1: Relational Data Models (6 Hours)',
      '- ER Modeling and Schema Design',
      '- Relational Algebra Operations',
    ];
    const pdfBuffer = createDeterministicSyllabusPdf(syllabusLines);

    const extraction = await extractDocumentText(pdfBuffer, 'application/pdf');
    const parsed = parseSyllabusDocument(extraction);

    expect(parsed).toBeDefined();
    expect(parsed.code).toBe('CSE3002');
    expect(parsed.title).toBe('Database Systems');
    expect(parsed.modules.length).toBeGreaterThanOrEqual(1);
    expect(parsed.sourcePageCount).toBe(1);
  });

  it('3. Fails safely on malformed or corrupted PDF files', async () => {
    const malformedPdf = Buffer.from(
      '%PDF-1.4\ncorrupted-random-bytes-not-a-valid-structure\n%%EOF',
    );

    await expect(extractPdfText(malformedPdf)).rejects.toThrowError(AppError);
    await expect(extractPdfText(malformedPdf)).rejects.toThrowError(
      /Invalid or corrupt PDF document structure/i,
    );
  });

  it('4. Handles scanned image-only PDFs honestly without crashing or faking text', async () => {
    const emptyPdf = createEmptyScannedPdf();

    const result = await extractPdfText(emptyPdf);
    expect(result.pageCount).toBe(1);
    expect(result.hasExtractableText).toBe(false);
    expect(result.metadata.totalChars).toBeLessThan(20);

    const parsed = parseSyllabusDocument(result);
    expect(parsed).toBeDefined();
    expect(parsed.unclearFields).toContain('code');
  });

  it('5. Ensures plain text syllabus extraction still functions identically', async () => {
    const plainText = `
Course Code: CSE4001
Course Title: Distributed Systems
Semester: Fall 2026

Module 1: Distributed Architectures (6 Hours)
- RPC and Middleware
- Message Queues

Module 2: Synchronization (8 Hours)
- Lamport Clocks
- Mutual Exclusion
`;
    const buffer = Buffer.from(plainText, 'utf-8');
    const extraction = await extractDocumentText(buffer, 'text/plain');

    expect(extraction.hasExtractableText).toBe(true);
    expect(extraction.text).toContain('CSE4001');

    const parsed = parseSyllabusDocument(extraction);
    expect(parsed.code).toBe('CSE4001');
    expect(parsed.title).toBe('Distributed Systems');
    expect(parsed.modules.length).toBe(2);
    expect(parsed.modules[0]?.topics.length).toBe(2);
  });
});
