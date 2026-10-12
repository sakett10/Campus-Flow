import { extractText, getDocumentProxy } from 'unpdf';
import type { DocumentExtractionResult, ExtractedPage } from '@campusflow/types';
import { INGESTION_LIMITS } from './validator.js';
import { AppError } from '../errors.js';

export const EXTRACTION_VERSION = 'v1.0';

/**
 * Executes an asynchronous task with a strict timeout guard.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new AppError('TIMEOUT', `${operationName} exceeded timeout of ${timeoutMs / 1000}s.`, 408),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Extracts page-by-page text from PDF bytes using unpdf (PDF.js).
 */
export async function extractPdfText(buffer: Buffer): Promise<DocumentExtractionResult> {
  // Isolate buffer slice so transferring to PDF.js worker does not detach the caller's buffer
  const isolatedBytes = new Uint8Array(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );

  // 1. Inspect PDF metadata & page count
  let pdfDoc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdfDoc = await withTimeout(
      getDocumentProxy(isolatedBytes),
      INGESTION_LIMITS.EXTRACTION_TIMEOUT_MS,
      'PDF document inspection',
    );
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    if (
      errMsg.includes('Invalid PDF structure') ||
      errMsg.includes('InvalidPDFException') ||
      errMsg.includes('Invalid PDF') ||
      errMsg.includes('Missing PDF header')
    ) {
      throw AppError.badRequest('Invalid or corrupt PDF document structure.');
    }
    if (errMsg.toLowerCase().includes('password')) {
      throw AppError.badRequest('Password-protected PDFs cannot be extracted.');
    }
    throw AppError.badRequest(`Failed to read PDF document: ${errMsg}`);
  }

  try {
    const pageCount = pdfDoc.numPages;

    if (pageCount > INGESTION_LIMITS.MAX_PDF_PAGES) {
      throw AppError.badRequest(
        `PDF page count (${pageCount}) exceeds maximum allowed limit of ${INGESTION_LIMITS.MAX_PDF_PAGES} pages.`,
      );
    }

    // 2. Extract page-by-page text using the already-resolved PDFDocumentProxy
    const extraction = await withTimeout(
      extractText(pdfDoc, { mergePages: false }),
      INGESTION_LIMITS.EXTRACTION_TIMEOUT_MS,
      'PDF text extraction',
    );

    const rawPages: string[] = Array.isArray(extraction.text) ? extraction.text : [extraction.text];

    const pages: ExtractedPage[] = [];
    let fullText = '';
    let totalExtractedChars = 0;

    for (let i = 0; i < rawPages.length; i++) {
      const pageText = rawPages[i] || '';
      const cleanText = pageText.trim();
      totalExtractedChars += cleanText.length;

      pages.push({
        pageNumber: i + 1,
        text: pageText,
        charCount: pageText.length,
      });

      if (fullText.length > 0 && pageText.length > 0) {
        fullText += '\n\n';
      }
      fullText += pageText;
    }

    // Detect image-only or scanned PDFs with no selectable text
    const hasExtractableText = totalExtractedChars >= 20;

    return {
      text: fullText,
      pages,
      pageCount,
      extractionVersion: EXTRACTION_VERSION,
      hasExtractableText,
      metadata: {
        pageCount,
        totalChars: totalExtractedChars,
      },
    };
  } finally {
    try {
      await pdfDoc.loadingTask.destroy();
    } catch {
      // Ignore cleanup error if already destroyed
    }
  }
}

/**
 * Extracts text from plain text or Markdown documents.
 */
export function extractRawText(
  buffer: Buffer,
  mimeType: 'text/plain' | 'text/markdown',
): DocumentExtractionResult {
  const text = buffer.toString('utf8');
  const clean = text.trim();
  const hasExtractableText = clean.length >= 1;

  // Approximate pages (around 3000 chars per standard printed academic page)
  const pageSize = 3000;
  const pages: ExtractedPage[] = [];

  if (clean.length === 0) {
    pages.push({ pageNumber: 1, text: '', charCount: 0 });
  } else {
    let offset = 0;
    let pageNum = 1;
    while (offset < text.length) {
      const slice = text.slice(offset, offset + pageSize);
      pages.push({
        pageNumber: pageNum,
        text: slice,
        charCount: slice.length,
      });
      offset += pageSize;
      pageNum++;
    }
  }

  return {
    text,
    pages,
    pageCount: pages.length,
    extractionVersion: EXTRACTION_VERSION,
    hasExtractableText,
    metadata: {
      format: mimeType,
      totalChars: text.length,
    },
  };
}

/**
 * Unified extractor for supported formats.
 */
export async function extractDocumentText(
  buffer: Buffer,
  detectedMimeType: string,
): Promise<DocumentExtractionResult> {
  if (detectedMimeType === 'application/pdf') {
    return extractPdfText(buffer);
  }

  if (detectedMimeType === 'text/markdown' || detectedMimeType === 'text/plain') {
    return extractRawText(buffer, detectedMimeType);
  }

  throw AppError.badRequest(`Unsupported MIME type for extraction: ${detectedMimeType}`);
}
