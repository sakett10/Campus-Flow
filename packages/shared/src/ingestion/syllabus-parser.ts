import { z } from 'zod';
import type {
  SyllabusExtractedCourse,
  SyllabusExtractionModule,
  SyllabusExtractionTopic,
  SyllabusExtractionAssessment,
  SyllabusPrescribedTextbook,
  DocumentExtractionResult,
} from '@campusflow/types';

export const syllabusExtractionTopicSchema = z.object({
  title: z.string().min(1),
  orderIndex: z.number().int().default(0),
  description: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().min(10).max(480).default(60),
  prerequisites: z.array(z.string()).default([]),
  pageReferences: z.string().nullable().optional(),
  subtopics: z.array(z.string()).default([]),
});

export const syllabusExtractionModuleSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['module', 'chapter']).default('module'),
  orderIndex: z.number().int().default(0),
  description: z.string().nullable().optional(),
  teachingHours: z.number().nullable().optional(),
  learningObjectives: z.array(z.string()).default([]),
  topics: z.array(syllabusExtractionTopicSchema),
});

export const syllabusExtractionAssessmentSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['CAT', 'FAT', 'Quiz', 'Assignment', 'Lab', 'Project', 'Other']).default('Other'),
  date: z.string().nullable().optional(),
  weightage: z.string().nullable().optional(),
  totalMarks: z.number().nullable().optional(),
  associatedTopics: z.array(z.string()).default([]),
});

export const syllabusPrescribedTextbookSchema = z.object({
  title: z.string().min(1),
  author: z.string().nullable().optional(),
  edition: z.string().nullable().optional(),
  isPrimary: z.boolean().default(false),
});

export const syllabusExtractedCourseSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  term: z.string().nullable().optional(),
  prerequisites: z.array(z.string()).default([]),
  prescribedTextbooks: z.array(syllabusPrescribedTextbookSchema).default([]),
  modules: z.array(syllabusExtractionModuleSchema),
  assessments: z.array(syllabusExtractionAssessmentSchema).default([]),
  confidence: z.number().min(0).max(1),
  unclearFields: z.array(z.string()).default([]),
  sourcePageCount: z.number().int().default(1),
});

/**
 * Finds which page number(s) mention a specific term or concept.
 */
function findPageRangeForTopic(
  pages: Array<{ pageNumber: number; text: string }>,
  title: string,
): string | null {
  if (!pages.length || !title) return null;
  const lower = title.toLowerCase().trim();
  const matchedPages: number[] = [];

  for (const p of pages) {
    if (p.text.toLowerCase().includes(lower)) {
      matchedPages.push(p.pageNumber);
    }
  }

  if (!matchedPages.length) {
    // Try significant words (length > 4)
    const words = lower.split(/\s+/).filter((w) => w.length > 4);
    if (words.length) {
      for (const p of pages) {
        const pLower = p.text.toLowerCase();
        if (words.some((w) => pLower.includes(w))) {
          matchedPages.push(p.pageNumber);
        }
      }
    }
  }

  if (!matchedPages.length) return null;
  const start = Math.min(...matchedPages);
  const end = Math.max(...matchedPages);
  return start === end ? `Page ${start}` : `Pages ${start}–${end}`;
}

/**
 * Robust Deterministic Syllabus Parser.
 *
 * Extracts structured Course -> Modules -> Topics hierarchy,
 * course code/title, prerequisites, textbooks, teaching hours,
 * and assessment details with page provenance.
 */
export function parseSyllabusDocument(
  extractionResult: DocumentExtractionResult,
): SyllabusExtractedCourse {
  const fullText = extractionResult.text || '';
  const pages = extractionResult.pages || [];
  const lines = fullText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const unclearFields: string[] = [];

  // 1. Detect Course Code & Title
  let detectedCode = '';
  let detectedTitle = '';
  let detectedTerm = 'Fall 2026';

  const codeRegex = /\b([A-Z]{2,5}\s?[0-9]{3,4}[A-Z]?)\b/;
  const courseCodeRegex = /(?:course\s+code|subject\s+code)[:\s-]+([^\n]+)/i;
  const courseTitleRegex =
    /(?:course\s+title|subject\s+(?:name|title)|course\s+name)[:\s-]+([^\n]+)/i;

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i] || '';

    // Check code regex
    if (!detectedCode) {
      const explicitCodeMatch = courseCodeRegex.exec(line);
      if (explicitCodeMatch && explicitCodeMatch[1]) {
        const tokenMatch = codeRegex.exec(explicitCodeMatch[1]);
        detectedCode =
          tokenMatch && tokenMatch[1]
            ? tokenMatch[1].replace(/\s+/g, '')
            : explicitCodeMatch[1].trim().split(/\s+/)[0] || '';
      } else {
        const match = codeRegex.exec(line);
        if (match && match[1]) {
          detectedCode = match[1].replace(/\s+/g, '');
        }
      }
    }

    // Check course title regex
    if (!detectedTitle) {
      const titleMatch = courseTitleRegex.exec(line);
      if (titleMatch && titleMatch[1]) {
        detectedTitle = titleMatch[1].trim();
      }
    }

    // Check term/semester
    const termMatch =
      /(?:fall|winter|spring|summer|semester|sem)\s+(?:\d{4}|\d{1,2}|I|II|III|IV)/i.exec(line);
    if (termMatch) {
      detectedTerm = termMatch[0].trim();
    }
  }

  // Fallback for Title if still empty: Look for first significant heading line
  if (!detectedTitle) {
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const line = lines[i] || '';
      if (
        line.length > 5 &&
        line.length < 80 &&
        !line.toLowerCase().includes('syllabus') &&
        !line.toLowerCase().includes('university') &&
        !line.toLowerCase().includes('college') &&
        !codeRegex.test(line)
      ) {
        detectedTitle = line.replace(/^[#*-]\s*/, '').trim();
        break;
      }
    }
  }

  if (!detectedCode) {
    detectedCode = 'CSE101';
    unclearFields.push('code');
  }
  if (!detectedTitle) {
    detectedTitle = 'Academic Course';
    unclearFields.push('title');
  }

  // 2. Extract Prerequisites
  const prerequisites: string[] = [];
  const prereqPattern = /(?:prerequisite|pre-requisite|prior\s+knowledge)(?:s)?[:\s-]+([^\n]+)/i;
  for (const line of lines) {
    const match = prereqPattern.exec(line);
    if (match && match[1]) {
      const items = match[1]
        .split(/[,;]|\band\b/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);
      prerequisites.push(...items);
      break;
    }
  }

  // 3. Extract Modules / Units & Topics
  const modules: SyllabusExtractionModule[] = [];
  let currentModule: SyllabusExtractionModule | null = null;
  let moduleCount = 0;
  let topicCount = 0;

  // Patterns for Module / Unit headers
  const moduleHeaderPattern = /^(?:module|unit|chapter)\s+([0-9IVXLCDM]+)[:\s.-]*(.*)$/i;
  const hoursPattern = /(?:(\d+)\s*(?:hours|hrs|lecture\s*hours))/i;
  const textbookSectionPattern =
    /^(?:text\s*book|textbook|reference\s*book|references|prescribed\s*books)/i;
  const assessmentSectionPattern =
    /^(?:assessment|evaluation\s*scheme|examination|grading\s*policy)/i;

  let inTextbookSection = false;
  let inAssessmentSection = false;

  const textbooks: SyllabusPrescribedTextbook[] = [];
  const assessments: SyllabusExtractionAssessment[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';

    // Check if entered textbook section
    if (textbookSectionPattern.test(line)) {
      inTextbookSection = true;
      inAssessmentSection = false;
      continue;
    }

    // Check if entered assessment section
    if (assessmentSectionPattern.test(line)) {
      inAssessmentSection = true;
      inTextbookSection = false;
      continue;
    }

    // Process Textbooks
    if (inTextbookSection) {
      if (moduleHeaderPattern.test(line) || assessmentSectionPattern.test(line)) {
        inTextbookSection = false;
      } else {
        const cleanBook = line.replace(/^[0-9]+[.)]\s*|^[-*•]\s*/, '').trim();
        if (cleanBook.length > 5) {
          const quoteMatch = /"([^"]+)"/.exec(cleanBook);
          if (quoteMatch && quoteMatch[1]) {
            const title = quoteMatch[1].trim();
            const beforeQuote = cleanBook.slice(0, quoteMatch.index).trim().replace(/,\s*$/, '');
            const afterQuote = cleanBook.slice(quoteMatch.index + quoteMatch[0].length).trim();
            const editionMatch = /(?:\d+(?:st|nd|rd|th)\s+edition|edition\s+\d+)/i.exec(afterQuote);
            textbooks.push({
              title,
              author: beforeQuote.length > 2 ? beforeQuote : null,
              edition: editionMatch ? editionMatch[0] : null,
              isPrimary: textbooks.length === 0,
            });
          } else {
            const parts = cleanBook.split(',').map((p) => p.trim());
            textbooks.push({
              title: parts.length > 1 && parts[1] ? parts[1] : cleanBook,
              author: parts.length > 1 && parts[0] ? parts[0] : null,
              edition: null,
              isPrimary: textbooks.length === 0,
            });
          }
        }
        continue;
      }
    }

    // Process Assessments
    if (inAssessmentSection) {
      if (moduleHeaderPattern.test(line) || textbookSectionPattern.test(line)) {
        inAssessmentSection = false;
      } else {
        const examMatch =
          /(cat-?[12]|fat|quiz(?:zes)?|mid-?term|final|assignment(?:s)?|project|lab)\b/i.exec(line);
        if (examMatch) {
          const rawType = examMatch[1]!.toUpperCase().replace('-', '');
          let mappedType: SyllabusExtractionAssessment['type'] = 'Other';
          if (rawType.includes('CAT')) mappedType = 'CAT';
          else if (rawType.includes('FAT') || rawType.includes('FINAL')) mappedType = 'FAT';
          else if (rawType.includes('QUIZ')) mappedType = 'Quiz';
          else if (rawType.includes('ASSIGNMENT')) mappedType = 'Assignment';
          else if (rawType.includes('LAB')) mappedType = 'Lab';
          else if (rawType.includes('PROJECT')) mappedType = 'Project';

          const percentMatch = /(\d{1,3})\s*%/i.exec(line);
          const marksMatch = /(?:total\s+marks|marks|max\s+marks)[:\s-]+(\d+)/i.exec(line);
          const weightage = percentMatch ? `${percentMatch[1]}%` : '20%';
          const totalMarks = marksMatch ? parseInt(marksMatch[1]!, 10) : 50;

          assessments.push({
            title: line.replace(/^[0-9]+[.)]\s*|^[-*•]\s*/, '').trim(),
            type: mappedType,
            weightage,
            totalMarks,
            associatedTopics: [],
          });
        }
        continue;
      }
    }

    // Check Module Header
    const modMatch = moduleHeaderPattern.exec(line);
    if (modMatch) {
      let modTitle = modMatch[2]?.trim() || line;
      if (!modTitle) modTitle = `Module ${modMatch[1]}`;

      // Check teaching hours
      let teachingHours: number | null = null;
      const hoursMatch = hoursPattern.exec(line);
      if (hoursMatch && hoursMatch[1]) {
        teachingHours = parseInt(hoursMatch[1], 10);
      }

      currentModule = {
        title: modTitle.replace(/[-:]\s*$/, '').trim(),
        type: 'module',
        orderIndex: moduleCount,
        teachingHours,
        learningObjectives: [],
        topics: [],
      };
      modules.push(currentModule);
      moduleCount++;
      topicCount = 0;
      continue;
    }

    // Check Topic Lines under current module
    if (currentModule) {
      // Bullets or numbered lists
      const bulletMatch = /^(?:[-*•]|\d+[.)])\s+(.*)/.exec(line);
      const isHeading = /^#{1,3}\s+(.*)/.exec(line);

      let topicTitle = '';
      if (bulletMatch && bulletMatch[1]) {
        topicTitle = bulletMatch[1].trim();
      } else if (isHeading && isHeading[1]) {
        topicTitle = isHeading[1].trim();
      } else if (
        line.length > 5 &&
        line.length < 120 &&
        !line.includes(':') &&
        !line.toLowerCase().startsWith('page')
      ) {
        // Regular line under module
        topicTitle = line.trim();
      }

      if (topicTitle && topicTitle.length > 2 && topicTitle.length < 150) {
        // Check for subtopics separated by dashes or commas
        const subparts = topicTitle
          .split(/--|;/)
          .map((s) => s.trim())
          .filter((s) => s.length > 2);

        const primaryTitle = subparts[0] || topicTitle;
        const subtopics = subparts.length > 1 ? subparts.slice(1) : [];

        const pageRef = findPageRangeForTopic(pages, primaryTitle);

        currentModule.topics.push({
          title: primaryTitle,
          orderIndex: topicCount,
          estimatedMinutes: 60, // Standard baseline estimate
          pageReferences: pageRef,
          subtopics,
          prerequisites: [],
        });
        topicCount++;
      }
    }
  }

  // 4. Default module fallback if no explicit modules found
  if (modules.length === 0) {
    unclearFields.push('modules');
    const fallbackTopics: SyllabusExtractionTopic[] = [];

    for (let i = 0; i < Math.min(lines.length, 25); i++) {
      const line = lines[i] || '';
      const cleanTitle = line.replace(/^[#*-•\d.)\s]+/, '').trim();
      if (cleanTitle.length > 2 && cleanTitle.length < 100 && !line.includes('http')) {
        fallbackTopics.push({
          title: cleanTitle,
          orderIndex: fallbackTopics.length,
          estimatedMinutes: 60,
          pageReferences: findPageRangeForTopic(pages, line),
          subtopics: [],
          prerequisites: [],
        });
      }
    }

    if (fallbackTopics.length === 0) {
      fallbackTopics.push({
        title: 'Core Fundamentals',
        orderIndex: 0,
        estimatedMinutes: 60,
        subtopics: [],
        prerequisites: [],
      });
    }

    modules.push({
      title: 'Module 1: Course Fundamentals',
      type: 'module',
      orderIndex: 0,
      teachingHours: 15,
      learningObjectives: ['Understand core concepts and theoretical foundations.'],
      topics: fallbackTopics,
    });
  }

  // Default assessments fallback if none parsed
  if (assessments.length === 0) {
    assessments.push(
      {
        title: 'Continuous Assessment 1',
        type: 'CAT',
        weightage: '25%',
        totalMarks: 50,
        associatedTopics: [],
      },
      {
        title: 'Final Examination',
        type: 'FAT',
        weightage: '50%',
        totalMarks: 100,
        associatedTopics: [],
      },
    );
  }

  // Confidence calculation
  let confidence = 0.9;
  if (unclearFields.includes('code')) confidence -= 0.15;
  if (unclearFields.includes('title')) confidence -= 0.15;
  if (unclearFields.includes('modules')) confidence -= 0.25;

  const result: SyllabusExtractedCourse = {
    code: detectedCode,
    title: detectedTitle,
    term: detectedTerm,
    prerequisites,
    prescribedTextbooks: textbooks,
    modules,
    assessments,
    confidence: Math.max(0.3, Math.min(1.0, confidence)),
    unclearFields: unclearFields.length ? unclearFields : undefined,
    sourcePageCount: extractionResult.pageCount || 1,
  };

  return syllabusExtractedCourseSchema.parse(result);
}
