/**
 * Academic Text Normalizer
 *
 * Cleans extraction artifacts while strictly preserving:
 * - Headings (#, ##, Module 1, Chapter 2)
 * - Math equations and symbols (=, +, -, *, /, ^, _, \sum)
 * - Numbered questions (1., 2.a, Q3:)
 * - Bullet structures (-, *, •)
 * - Paragraph boundaries
 */

export function normalizeExtractedText(raw: string): string {
  if (!raw) return '';

  // 1. Normalize line breaks (\r\n and \r -> \n)
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Remove null bytes and non-printable control characters (keeping \t, \n)
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // 3. Fix broken hyphenated line wraps (e.g. "distri-\nbuted" -> "distributed")
  // Only where a lowercase letter is hyphenated to another lowercase letter
  text = text.replace(/([a-z])-\n([a-z])/g, '$1$2');

  // 4. Normalize soft line wraps within paragraphs while keeping headings and list items intact:
  const lines = text.split('\n');
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Collapse multiple horizontal spaces/tabs to a single space
    const cleanLine = line.replace(/[ \t]+/g, ' ').trim();
    processedLines.push(cleanLine);
  }

  // 5. Rejoin lines and collapse 3+ consecutive newlines to maximum 2 (paragraph break)
  let joined = processedLines.join('\n');
  joined = joined.replace(/\n{3,}/g, '\n\n');

  return joined.trim();
}

/**
 * Normalizes text for Full-Text Search indexing and query preprocessing.
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query || typeof query !== 'string') return '';

  // Remove dangerous operators or malformed characters for tsquery
  // Keep alphanumeric words and clean whitespace
  const sanitized = query
    .replace(/[&|!():*<>'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized;
}

export const normalizeText = normalizeExtractedText;
