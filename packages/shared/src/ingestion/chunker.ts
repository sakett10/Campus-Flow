import type { ExtractedPage, ChunkingOptions } from '@campusflow/types';
import { normalizeExtractedText } from './normalizer.js';

export const CHUNKING_VERSION = 'v1.0';

export interface GeneratedChunk {
  sequence: number;
  content: string;
  pageStart: number;
  pageEnd: number;
  charCount: number;
  tokenCount: number;
  extractionVersion: string;
  chunkingVersion: string;
}

/**
 * Academic Chunking Strategy:
 *
 * 1. Target chunk size: ~1200 characters (~200-250 words).
 *    Rationale: Ideal for academic text grounding; large enough to contain complete
 *    definitions, derivations, or multi-part questions, while small enough for
 *    precise FTS relevance ranking and pinpoint source citations.
 * 2. Heading & Paragraph Awareness: Splits on double-newlines (paragraphs) or
 *    major headings (#, Module, Section) rather than chopping mid-sentence.
 * 3. Overlap: ~150 characters between chunks to preserve semantic context across
 *    paragraph boundaries.
 * 4. Page Tracking: Maintains exact starting and ending page numbers.
 */
export function chunkExtractedPages(
  pages: ExtractedPage[],
  versionOrOptions: string | (ChunkingOptions & { overlapSize?: number }) = 'v1.0',
  maybeOptions: ChunkingOptions & { overlapSize?: number } = {},
): GeneratedChunk[] {
  let extractionVersion = 'v1.0';
  let options: ChunkingOptions & { overlapSize?: number } = {};

  if (typeof versionOrOptions === 'string') {
    extractionVersion = versionOrOptions;
    options = maybeOptions;
  } else if (versionOrOptions && typeof versionOrOptions === 'object') {
    options = versionOrOptions;
  }

  const targetSize = options.targetChunkSize ?? 1200;
  const overlap = options.overlapSize ?? options.chunkOverlap ?? 150;
  const minSize = options.minChunkSize ?? 50;

  const chunks: GeneratedChunk[] = [];
  let sequence = 0;

  // Build a mapped stream of paragraph blocks with page tags
  interface ParagraphBlock {
    text: string;
    pageNumber: number;
  }

  const blocks: ParagraphBlock[] = [];

  for (const page of pages) {
    const normalizedPage = normalizeExtractedText(page.text);
    if (!normalizedPage) continue;

    // Split page into paragraphs
    const paragraphs = normalizedPage.split(/\n\n+/);
    for (const para of paragraphs) {
      const cleanPara = para.trim();
      if (cleanPara.length > 0) {
        blocks.push({
          text: cleanPara,
          pageNumber: page.pageNumber,
        });
      }
    }
  }

  if (blocks.length === 0) {
    return [];
  }

  let currentChunkText = '';
  let chunkPageStart = blocks[0]?.pageNumber ?? 1;
  let chunkPageEnd = blocks[0]?.pageNumber ?? 1;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;

    if (currentChunkText.length === 0) {
      currentChunkText = block.text;
      chunkPageStart = block.pageNumber;
      chunkPageEnd = block.pageNumber;
    } else {
      const potentialLength = currentChunkText.length + 2 + block.text.length;

      if (potentialLength <= targetSize) {
        currentChunkText += '\n\n' + block.text;
        chunkPageEnd = block.pageNumber;
      } else {
        // Emit current chunk if it meets minSize
        if (currentChunkText.length >= minSize) {
          chunks.push({
            sequence,
            content: currentChunkText,
            pageStart: chunkPageStart,
            pageEnd: chunkPageEnd,
            charCount: currentChunkText.length,
            tokenCount: Math.ceil(currentChunkText.length / 4),
            extractionVersion,
            chunkingVersion: CHUNKING_VERSION,
          });
          sequence++;
        }

        // Start next chunk with overlap from the tail of the current chunk
        let overlapText = '';
        if (overlap > 0 && currentChunkText.length > overlap) {
          const tail = currentChunkText.slice(-overlap);
          const firstSpace = tail.indexOf(' ');
          if (firstSpace !== -1) {
            overlapText = tail.slice(firstSpace).trim();
          }
        }

        currentChunkText = overlapText ? `${overlapText}\n\n${block.text}` : block.text;
        chunkPageStart = block.pageNumber;
        chunkPageEnd = block.pageNumber;
      }
    }
  }

  // Final flush
  if (currentChunkText.length >= minSize || chunks.length === 0) {
    chunks.push({
      sequence,
      content: currentChunkText,
      pageStart: chunkPageStart,
      pageEnd: chunkPageEnd,
      charCount: currentChunkText.length,
      tokenCount: Math.ceil(currentChunkText.length / 4),
      extractionVersion,
      chunkingVersion: CHUNKING_VERSION,
    });
  }

  return chunks;
}

export const chunkDocument = chunkExtractedPages;
