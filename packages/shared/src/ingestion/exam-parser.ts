import type {
  DocumentExtractionResult,
  AcademicNode,
  ExamQuestionFormat,
  CognitiveLevel,
  CandidateTopicMatch,
  QuestionMultipleChoiceOption,
  ExamPaperStatus,
} from '@campusflow/types';

export interface ParsedExamQuestion {
  questionNumber: string;
  parentQuestionNumber?: string | undefined;
  questionText: string;
  marks?: number | undefined;
  pageNumber?: number | undefined;
  questionFormat: ExamQuestionFormat;
  options?: QuestionMultipleChoiceOption[] | undefined;
  compulsory: boolean;
  choiceGroup?: string | undefined;
  candidateTopics: CandidateTopicMatch[];
  topicId?: string | undefined;
  topicTitle?: string | undefined;
  topicConfidence?: number | undefined;
  difficulty: 'easy' | 'medium' | 'hard' | 'uncertain';
  difficultyUncertainty: number;
  cognitiveLevel?: CognitiveLevel | undefined;
  sourceSnippet: string;
}

export interface ParsedExamPaper {
  title: string;
  term?: string | undefined;
  examType?: string | undefined;
  academicYear?: string | undefined;
  totalMarks?: number | undefined;
  durationMinutes?: number | undefined;
  instructions?: string | undefined;
  status: ExamPaperStatus;
  questions: ParsedExamQuestion[];
  unclearFields: string[];
  warnings: string[];
}

/**
 * Sanitizes untrusted document text and flags potential prompt injection attacks.
 */
export function sanitizeDocumentData(text: string): {
  cleanText: string;
  injectionDetected: boolean;
} {
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /system\s*prompt/i,
    /override\s+system/i,
    /jailbreak/i,
    /reveal\s+(api\s+key|password|secret)/i,
  ];

  let injectionDetected = false;
  for (const pattern of injectionPatterns) {
    if (pattern.test(text)) {
      injectionDetected = true;
      break;
    }
  }

  // Treat document text strictly as passive data
  const cleanText = text.split('\0').join('').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  return { cleanText, injectionDetected };
}

/**
 * Extracts question format based on linguistic and structural patterns.
 */
export function detectQuestionFormat(
  text: string,
  options?: QuestionMultipleChoiceOption[],
): ExamQuestionFormat {
  if (options && options.length >= 2) {
    return 'multiple_choice';
  }

  const lower = text.toLowerCase();

  // Numerical indicators
  if (
    /calculate|compute|find the value|determine the magnitude|evaluate the integral|solve for x|impedance|resistance|frequency|voltage|probability/i.test(
      lower,
    ) &&
    /\d+|\+|-|\*|\/|=|\^|√|%|\$|Ω|Hz|V|mA/.test(text)
  ) {
    return 'numerical';
  }

  // Derivation indicators
  if (/derive|prove that|show that|deduce the relation|proof:/i.test(lower)) {
    return 'derivation';
  }

  // Coding indicators
  if (
    /write a (c|c\+\+|java|python|sql|javascript|assembly)?\s*(program|code|script|algorithm|query|function)|pseudocode|pseudo-code/i.test(
      lower,
    )
  ) {
    return 'coding';
  }

  // Diagram indicators
  if (
    /draw|sketch|schematic|\bdiagram\b|flowchart|circuit diagram|block diagram|illustrate with a diagram/i.test(
      lower,
    )
  ) {
    return 'diagram';
  }

  // Essay vs Short Answer
  if (
    text.length > 250 ||
    /elaborate|discuss in detail|explain in depth|comprehensive essay|critically evaluate/i.test(
      lower,
    )
  ) {
    return 'essay';
  }

  return 'short_answer';
}

/**
 * Estimates cognitive level (Bloom's Revised Taxonomy) and difficulty with explicit uncertainty.
 */
export function estimateCognitiveAndDifficulty(
  text: string,
  marks?: number,
): {
  cognitiveLevel: CognitiveLevel;
  difficulty: 'easy' | 'medium' | 'hard' | 'uncertain';
  difficultyUncertainty: number;
} {
  const lower = text.toLowerCase();

  let cognitiveLevel: CognitiveLevel = 'understand';

  if (/define|state|list|name|recall|identify|mention|who|when/i.test(lower)) {
    cognitiveLevel = 'remember';
  } else if (/describe|explain|summarize|distinguish|differentiate|classify/i.test(lower)) {
    cognitiveLevel = 'understand';
  } else if (/apply|calculate|compute|solve|demonstrate|implement|use/i.test(lower)) {
    cognitiveLevel = 'apply';
  } else if (/analyze|compare|contrast|examine|investigate|break down/i.test(lower)) {
    cognitiveLevel = 'analyze';
  } else if (/evaluate|justify|critique|judge|assess|argue/i.test(lower)) {
    cognitiveLevel = 'evaluate';
  } else if (/design|create|formulate|construct|devise|synthesize/i.test(lower)) {
    cognitiveLevel = 'create';
  }

  let difficulty: 'easy' | 'medium' | 'hard' | 'uncertain' = 'medium';
  let difficultyUncertainty = 0.25;

  if (cognitiveLevel === 'remember' && (!marks || marks <= 3)) {
    difficulty = 'easy';
    difficultyUncertainty = 0.15;
  } else if (cognitiveLevel === 'understand' && marks && marks <= 5) {
    difficulty = 'medium';
    difficultyUncertainty = 0.2;
  } else if (
    cognitiveLevel === 'analyze' ||
    cognitiveLevel === 'evaluate' ||
    cognitiveLevel === 'create' ||
    (marks && marks >= 10)
  ) {
    difficulty = 'hard';
    difficultyUncertainty = 0.25;
  }

  if (text.length < 20) {
    difficulty = 'uncertain';
    difficultyUncertainty = 0.45;
  }

  return { cognitiveLevel, difficulty, difficultyUncertainty };
}

/**
 * Extracts multiple choice options if present.
 */
export function extractMultipleChoiceOptions(text: string): {
  cleanQuestion: string;
  options?: QuestionMultipleChoiceOption[];
} {
  const optionRegex = /(?:^|\n)\s*(?:\(?([A-Da-d])\)|\b([A-Da-d])\.)\s+([^\n]+)/g;
  const matches: Array<{ label: string; text: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = optionRegex.exec(text)) !== null) {
    const label = (match[1] || match[2] || '').toUpperCase();
    const optText = (match[3] || '').trim();
    if (label && optText) {
      matches.push({ label, text: optText });
    }
  }

  if (matches.length >= 2) {
    // Strip options from main question text
    const firstOptIndex = text.search(/(?:^|\n)\s*(?:\(?([A-Da-d])\)|\b([A-Da-d])\.)\s+/);
    const cleanQuestion =
      firstOptIndex !== -1 ? text.substring(0, firstOptIndex).trim() : text.trim();
    return {
      cleanQuestion,
      options: matches,
    };
  }

  return { cleanQuestion: text.trim() };
}

const STOP_WORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'over',
  'under',
  'between',
  'what',
  'when',
  'where',
  'which',
  'who',
  'how',
  'why',
  'are',
  'was',
  'were',
  'will',
  'have',
  'has',
  'had',
  'does',
  'did',
  'each',
  'such',
  'some',
  'then',
  'than',
  'also',
  'about',
  'more',
  'most',
  'other',
  'their',
  'there',
  'explain',
  'state',
  'describe',
  'calculate',
  'derive',
  'discuss',
]);

/**
 * Extracts marks from question text. E.g.: [5 Marks], (10M), (2 Marks), [2+3=5 marks]
 */
export function extractMarks(text: string): { marks?: number; cleanText: string } {
  // Support arithmetic breakdown e.g. [2+3=5 marks] or (2+3=5M)
  const marksRegex = /(?:\[|\()(?:[\d\s+*/-]+=\s*)?(\d+(?:\.\d+)?)\s*(?:marks?|m|pts?)?(?:\]|\))/i;
  const match = text.match(marksRegex);

  if (match && match[1]) {
    const val = parseFloat(match[1]);
    if (!isNaN(val) && val > 0 && val <= 100) {
      const clean = text.replace(match[0], '').trim();
      return { marks: val, cleanText: clean };
    }
  }

  // Trailing marks notation: e.g. " ... 5 Marks" or "... (10)"
  const trailingRegex = /\s*[-–—]?\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)\s*$/i;
  const trailingMatch = text.match(trailingRegex);
  if (trailingMatch && trailingMatch[1]) {
    const val = parseFloat(trailingMatch[1]);
    if (!isNaN(val) && val > 0 && val <= 100) {
      const clean = text.replace(trailingMatch[0], '').trim();
      return { marks: val, cleanText: clean };
    }
  }

  return { cleanText: text };
}

function normalizeStem(w: string): string {
  return w
    .toLowerCase()
    .replace(/ies$/, 'y')
    .replace(/(?:es|s|ed|ing)$/, '');
}

/**
 * Maps question text to candidate syllabus topics from academic nodes.
 *
 * Scoring Semantics:
 * The returned `confidence` value represents a deterministic heuristic relevance
 * score based on token stem overlap and exact phrase matching (0.0 to 1.0).
 * It is NOT an empirically calibrated probability or machine-learning confidence estimate.
 * When evidence is insufficient or text is out-of-domain (score <= 0.30), the algorithm
 * abstains with bestTopicId: undefined, confidence: undefined, and empty candidateTopics.
 */
export function mapQuestionToTopics(
  questionText: string,
  academicNodes: AcademicNode[],
): {
  candidateTopics: CandidateTopicMatch[];
  bestTopicId?: string | undefined;
  bestTopicTitle?: string | undefined;
  confidence?: number | undefined;
} {
  const topics = academicNodes.filter((n) => n.type === 'topic');
  if (topics.length === 0) {
    return { candidateTopics: [] };
  }

  const qLower = questionText.toLowerCase();
  const qNormWords = new Set(
    qLower
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
      .map(normalizeStem),
  );

  const scored: Array<{
    node: AcademicNode;
    score: number;
    matchCount: number;
    titleOverlap: boolean;
  }> = [];

  for (const node of topics) {
    const tLower = node.title.toLowerCase();
    const tWords = tLower
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

    let matchCount = 0;
    for (const w of tWords) {
      if (qNormWords.has(normalizeStem(w))) {
        matchCount++;
      }
    }

    const titleOverlap = qLower.includes(tLower);
    let score = 0;

    if (titleOverlap) {
      score = 0.9 + Math.min(0.09, tWords.length * 0.02);
    } else if (tWords.length > 0 && matchCount > 0) {
      const ratio = matchCount / tWords.length;
      score = Math.min(0.85, 0.4 + ratio * 0.45);
    }

    if (score > 0.3) {
      scored.push({ node, score, matchCount, titleOverlap });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const candidates: CandidateTopicMatch[] = scored.slice(0, 4).map((s) => ({
    topicId: s.node.id,
    topicTitle: s.node.title,
    confidence: Number(s.score.toFixed(3)),
    rationale: s.titleOverlap
      ? 'Exact topic phrase present in question statement.'
      : `Matched ${s.matchCount} key academic terms with syllabus node.`,
  }));

  const best = candidates[0];
  return {
    candidateTopics: candidates,
    bestTopicId: best?.topicId,
    bestTopicTitle: best?.topicTitle,
    confidence: best?.confidence,
  };
}

/**
 * Deterministic Question Paper and Question Boundary Parser.
 */
export function parseExaminationDocument(
  extraction: DocumentExtractionResult,
  academicNodes: AcademicNode[] = [],
): ParsedExamPaper {
  const warnings: string[] = [];
  const unclearFields: string[] = [];

  if (!extraction.hasExtractableText) {
    return {
      title: 'Scanned Examination Paper',
      status: 'failed',
      questions: [],
      unclearFields: ['all_questions'],
      warnings: [
        'Document contains no extractable text. Scanned or image-only PDFs require OCR integration.',
      ],
    };
  }

  const { cleanText, injectionDetected } = sanitizeDocumentData(extraction.text);
  if (injectionDetected) {
    warnings.push(
      'Document contains adversarial instructional phrasing; content isolated as passive data.',
    );
  }

  // 1. Extract Paper Header Metadata
  const examTypeMatch = cleanText.match(
    /\b(CAT-1|CAT-2|FAT|Midterm|Mid\s*Sem(?:ester)?|Final\s*Exam|Quiz|Semester\s*End)\b/i,
  );
  const examType = examTypeMatch?.[1] ? examTypeMatch[1] : undefined;

  const yearMatch = cleanText.match(/\b(20\d{2}[-–]20\d{2}|20\d{2})\b/);
  const academicYear = yearMatch?.[1] ? yearMatch[1] : undefined;

  const marksMatch =
    cleanText.match(/Total\s*Marks?\s*[:=]?\s*(\d+)/i) ||
    cleanText.match(/Max(?:imum)?\s*Marks?\s*[:=]?\s*(\d+)/i);
  const totalMarks = marksMatch?.[1] ? parseInt(marksMatch[1], 10) : undefined;

  const durationMatch = cleanText.match(
    /(?:Time\s*(?:Allowed)?|Duration)\s*[:=]?\s*(\d+)\s*(?:Hours?|Hrs?|Minutes?|Mins?)/i,
  );
  let durationMinutes: number | undefined;
  if (durationMatch && durationMatch[1]) {
    const rawVal = parseInt(durationMatch[1], 10);
    const isHours = /hours?|hrs?/i.test(durationMatch[0]);
    durationMinutes = isHours ? rawVal * 60 : rawVal;
  }

  const titleMatch =
    cleanText.match(/Course\s*Title\s*[:=]?\s*([^\n]+)/i) ||
    cleanText.match(/Subject\s*[:=]?\s*([^\n]+)/i);
  const title = titleMatch?.[1] ? titleMatch[1].trim() : `${examType || 'Examination'} Paper`;

  const instructionsMatch = cleanText.match(
    /(?:Instructions?|Directions?)\s*[:=]?\s*([^\n]+(?:\n[^\n]+){1,4})/i,
  );
  const instructions = instructionsMatch?.[1] ? instructionsMatch[1].trim() : undefined;

  // Detect explicit attempt rules (e.g. "Answer any 10 out of 12 questions")
  const attemptRuleMatch = cleanText.match(
    /(?:Answer|Attempt)\s+(?:any\s+)?(\d+)\s+(?:out\s+of|from)\s+(\d+)\s+questions/i,
  );
  const attemptRuleGroup = attemptRuleMatch
    ? `Attempt ${attemptRuleMatch[1]} of ${attemptRuleMatch[2]}`
    : undefined;

  // 2. Question Boundary Splitting
  // Matches patterns: "1.", "Q1.", "Q1", "Question 1:", "1(a)", "4(a)", "Part B - 4", etc.
  const questionBoundaryRegex =
    /(?:^|\n)\s*(?:Q(?:uestion)?\.?\s*(\d+\([a-z]\)|\d+[a-z]?|\([a-z]\))\.?|(\d+\([a-z]\)|\d+[a-z]?)\.?)\s+/gi;

  interface RawQuestionBlock {
    qNum: string;
    text: string;
    startIndex: number;
    pageNumber: number;
  }

  const rawBlocks: RawQuestionBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = questionBoundaryRegex.exec(cleanText)) !== null) {
    const qNum = (match[1] || match[2] || '').trim();
    const startIndex = match.index;
    rawBlocks.push({ qNum, text: '', startIndex, pageNumber: 1 });
  }

  // If boundary regex failed, try simpler lines starting with "1.", "2."
  if (rawBlocks.length === 0) {
    const lineRegex = /(?:^|\n)\s*(\d+)\.\s+/g;
    while ((match = lineRegex.exec(cleanText)) !== null) {
      const qNum = match[1] || '';
      rawBlocks.push({
        qNum,
        text: '',
        startIndex: match.index,
        pageNumber: 1,
      });
    }
  }

  // Calculate text slices and page numbers for each question
  for (let i = 0; i < rawBlocks.length; i++) {
    const currentBlock = rawBlocks[i];
    if (!currentBlock) continue;
    const nextBlock = rawBlocks[i + 1];
    const start = currentBlock.startIndex;
    const end = nextBlock ? nextBlock.startIndex : cleanText.length;
    const rawSlice = cleanText.substring(start, end).trim();
    currentBlock.text = rawSlice;

    // Approximate page number from extraction pages
    let accumulatedChars = 0;
    for (const p of extraction.pages) {
      accumulatedChars += p.charCount;
      if (start <= accumulatedChars) {
        currentBlock.pageNumber = p.pageNumber;
        break;
      }
    }
  }

  // 3. Process each question
  const parsedQuestions: ParsedExamQuestion[] = [];

  for (const block of rawBlocks) {
    if (!block) continue;
    // Strip the question number header from the start of text
    const cleanHeaderRegex = /^(?:Q(?:uestion)?\.?\s*[\d()a-z]+\.?|[\d()a-z]+\.?)\s*/i;
    let body = block.text.replace(cleanHeaderRegex, '').trim();

    // Check optional or choice group indicators
    const isOrChoice = /\b(?:OR|Either\s*\(a\)\s*or\s*\(b\))\b/i.test(body);
    const choiceGroup = isOrChoice ? 'Choice Option' : attemptRuleGroup;
    const compulsory = !isOrChoice && !attemptRuleGroup;

    // Extract marks
    const { marks, cleanText: afterMarks } = extractMarks(body);
    body = afterMarks;

    // Extract MC options if any
    const { cleanQuestion, options } = extractMultipleChoiceOptions(body);
    body = cleanQuestion;

    // Format & Cognitive level
    const questionFormat = detectQuestionFormat(body, options);
    const { cognitiveLevel, difficulty, difficultyUncertainty } = estimateCognitiveAndDifficulty(
      body,
      marks,
    );

    // Map to topics
    const topicMapping = mapQuestionToTopics(body, academicNodes);

    // Subquestion detection: e.g. "1(a)" or "2.b"
    let parentQuestionNumber: string | undefined;
    const subMatch = block.qNum.match(/^(\d+)[.(]([a-z\d]+)\)?/i);
    if (subMatch) {
      parentQuestionNumber = subMatch[1];
    }

    parsedQuestions.push({
      questionNumber: block.qNum,
      parentQuestionNumber,
      questionText: body,
      marks,
      pageNumber: block.pageNumber,
      questionFormat,
      options,
      compulsory,
      choiceGroup,
      candidateTopics: topicMapping.candidateTopics,
      topicId: topicMapping.bestTopicId,
      topicTitle: topicMapping.bestTopicTitle,
      topicConfidence: topicMapping.confidence,
      difficulty,
      difficultyUncertainty,
      cognitiveLevel,
      sourceSnippet: block.text.substring(0, 150),
    });
  }

  // Structural consistency checks
  let sumQuestionMarks = 0;
  for (const q of parsedQuestions) {
    if (q.marks !== undefined && q.marks !== null) {
      sumQuestionMarks += q.marks;
    }
  }

  if (totalMarks !== undefined && parsedQuestions.length > 0) {
    if (attemptRuleMatch && attemptRuleMatch[1]) {
      const attemptedCount = parseInt(attemptRuleMatch[1], 10);
      const avgMarks = sumQuestionMarks / parsedQuestions.length;
      const expectedAttemptedMarks = attemptedCount * avgMarks;
      if (
        Math.abs(expectedAttemptedMarks - totalMarks) > 0.5 &&
        Math.abs(sumQuestionMarks - totalMarks) > 0.5
      ) {
        warnings.push(
          `Structural inconsistency: Calculated marks for attempted questions (~${expectedAttemptedMarks.toFixed(1)}) does not match declared total (${totalMarks}).`,
        );
      }
    } else if (sumQuestionMarks > 0 && Math.abs(sumQuestionMarks - totalMarks) > 0.5) {
      warnings.push(
        `Structural inconsistency: Sum of extracted question marks (${sumQuestionMarks}) differs from declared paper total (${totalMarks}).`,
      );
    }
  }

  if (parsedQuestions.length === 0) {
    warnings.push('Could not detect discrete question boundaries using deterministic patterns.');
    unclearFields.push('questions');
  }

  return {
    title,
    term: undefined,
    examType,
    academicYear,
    totalMarks,
    durationMinutes,
    instructions,
    status: parsedQuestions.length > 0 ? 'ready' : 'failed',
    questions: parsedQuestions,
    unclearFields,
    warnings,
  };
}
