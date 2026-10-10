import type { AcademicNodeType, NodeOrigin } from '@campusflow/types';

export interface InferredNode {
  title: string;
  type: AcademicNodeType;
  orderIndex: number;
  origin: NodeOrigin;
  confidence: number;
  needsReview: 'yes' | 'no';
  children: InferredNode[];
}

/**
 * Deterministic Academic Map Deduction Heuristic:
 *
 * Scans extracted academic text (e.g. course syllabi, lecture slides, notes)
 * for structural module/topic hierarchies.
 *
 * Rules:
 * - Explicit "Module X:" or "Unit X:" patterns -> High confidence (0.85), needsReview: 'no'.
 * - General Markdown headings (# or ##) -> Medium confidence (0.65), needsReview: 'yes'.
 * - Fallback default module -> Low confidence (0.40), needsReview: 'yes'.
 */
export function inferAcademicMapNodes(documentText: string): InferredNode[] {
  if (!documentText) {
    return [
      {
        title: 'General Resources',
        type: 'module',
        orderIndex: 0,
        origin: 'model',
        confidence: 0.4,
        needsReview: 'yes',
        children: [],
      },
    ];
  }

  const lines = documentText.split('\n');
  const modules: InferredNode[] = [];
  let currentModule: InferredNode | null = null;
  let moduleCount = 0;
  let topicCount = 0;

  // Regex patterns
  const explicitModulePattern = /^(?:module|unit|chapter)\s+(\d+)[:\s.-]+([^\n]+)/i;
  const markdownHeadingPattern = /^(?:#{1,3})\s+([^\n]+)/;
  const explicitTopicPattern = /^(?:[-*•]\s+)?topic[:\s.-]+([^\n]+)/i;
  const topicBulletPattern = /^[-*•]\s+([^\n]+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;

    // 1. Check for explicit Module/Unit
    const explicitMatch = explicitModulePattern.exec(line);
    if (explicitMatch) {
      currentModule = {
        title: line,
        type: 'module',
        orderIndex: moduleCount,
        origin: 'model',
        confidence: 0.85,
        needsReview: 'no',
        children: [],
      };
      modules.push(currentModule);
      moduleCount++;
      topicCount = 0;
      continue;
    }

    // 2. Check for explicit Topic line
    const topicMatch = explicitTopicPattern.exec(line);
    if (topicMatch && topicMatch[1] && currentModule) {
      const topicTitle = topicMatch[1].trim();
      currentModule.children.push({
        title: topicTitle,
        type: 'topic',
        orderIndex: topicCount,
        origin: 'model',
        confidence: 0.85,
        needsReview: 'no',
        children: [],
      });
      topicCount++;
      continue;
    }

    // 2. Check for Markdown Heading (if no explicit modules found yet, or as sub-chapters)
    const headingMatch = markdownHeadingPattern.exec(line);
    if (headingMatch && headingMatch[1]) {
      const headingTitle = headingMatch[1].trim();

      if (headingTitle.length > 3 && headingTitle.length < 100) {
        if (!currentModule || modules.length === 0) {
          currentModule = {
            title: headingTitle,
            type: 'module',
            orderIndex: moduleCount,
            origin: 'model',
            confidence: 0.65,
            needsReview: 'yes',
            children: [],
          };
          modules.push(currentModule);
          moduleCount++;
          topicCount = 0;
        } else {
          // As topic under current module
          currentModule.children.push({
            title: headingTitle,
            type: 'topic',
            orderIndex: topicCount,
            origin: 'model',
            confidence: 0.65,
            needsReview: 'yes',
            children: [],
          });
          topicCount++;
        }
      }
      continue;
    }

    // 3. Check for sub-topic bullets under an active module
    const bulletMatch = topicBulletPattern.exec(line);
    if (bulletMatch && bulletMatch[1] && currentModule) {
      const topicTitle = bulletMatch[1].trim();
      if (topicTitle.length > 3 && topicTitle.length < 120 && !topicTitle.includes(':')) {
        currentModule.children.push({
          title: topicTitle,
          type: 'topic',
          orderIndex: topicCount,
          origin: 'model',
          confidence: 0.75,
          needsReview: 'no',
          children: [],
        });
        topicCount++;
      }
    }
  }

  // If no structured hierarchy was found, return an editable single module with needsReview: 'yes'
  if (modules.length === 0) {
    return [
      {
        title: 'Core Concepts',
        type: 'module',
        orderIndex: 0,
        origin: 'model',
        confidence: 0.45,
        needsReview: 'yes',
        children: [
          {
            title: 'General Overview',
            type: 'topic',
            orderIndex: 0,
            origin: 'model',
            confidence: 0.45,
            needsReview: 'yes',
            children: [],
          },
        ],
      },
    ];
  }

  return modules;
}

export const classifyDocumentStructure = inferAcademicMapNodes;

/**
 * Find page provenance for an academic topic across extracted pages.
 */
export function findTopicPageProvenance(
  pages: Array<{ pageNumber: number; text: string }>,
  topicTitle: string,
): { pageStart: number | null; pageEnd: number | null } {
  if (!pages.length || !topicTitle) return { pageStart: null, pageEnd: null };
  const normalizedTitle = topicTitle.toLowerCase().trim();
  const matchingPages: number[] = [];

  for (const p of pages) {
    if (p.text.toLowerCase().includes(normalizedTitle)) {
      matchingPages.push(p.pageNumber);
    }
  }

  if (matchingPages.length === 0) {
    const significantWords = normalizedTitle
      .split(/\s+/)
      .filter((w) => w.length > 4 && !['module', 'chapter', 'topic', 'unit'].includes(w));
    if (significantWords.length > 0) {
      for (const p of pages) {
        const pageLower = p.text.toLowerCase();
        const matchesWord = significantWords.some((w) => pageLower.includes(w));
        if (matchesWord && !matchingPages.includes(p.pageNumber)) {
          matchingPages.push(p.pageNumber);
        }
      }
    }
  }

  if (matchingPages.length === 0) {
    return { pageStart: 1, pageEnd: 1 };
  }

  const pageStart = Math.min(...matchingPages);
  const pageEnd = Math.max(...matchingPages);
  return { pageStart, pageEnd };
}
