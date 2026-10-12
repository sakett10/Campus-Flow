import { describe, it, expect } from 'vitest';
import {
  parseExaminationDocument,
  mapQuestionToTopics,
} from '../../packages/shared/src/ingestion/exam-parser.js';
import { verifyNumericalAnswer } from '../../packages/shared/src/examination/practice-generator.js';
import { compareCrossPapers } from '../../packages/shared/src/examination/exam-analyzer.js';
import type {
  AcademicNode,
  DocumentExtractionResult,
  ExaminationPaper,
  ExaminationQuestion,
} from '@campusflow/types';

describe('Examination Evaluation Benchmark Suite', () => {
  const benchmarkNodes: AcademicNode[] = [
    {
      id: 'topic-concurrency',
      courseId: 'course-os',
      userId: 'user-1',
      parentId: 'mod-1',
      type: 'topic',
      title: 'Deadlock Detection and Prevention',
      description: 'Bankers algorithm, resource allocation graph',
      orderIndex: 1,
      origin: 'user',
      confidence: 1.0,
      needsReview: 'no',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'topic-memory',
      courseId: 'course-os',
      userId: 'user-1',
      parentId: 'mod-1',
      type: 'topic',
      title: 'Virtual Memory and Page Replacement',
      description: 'LRU, FIFO, page fault frequency',
      orderIndex: 2,
      origin: 'user',
      confidence: 1.0,
      needsReview: 'no',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'topic-storage',
      courseId: 'course-os',
      userId: 'user-1',
      parentId: 'mod-1',
      type: 'topic',
      title: 'File System Implementation and Inodes',
      description: 'Directory structure, disk scheduling',
      orderIndex: 3,
      origin: 'user',
      confidence: 1.0,
      needsReview: 'no',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('1. Evaluates Question Boundary Detection & Marks Extraction against Ground Truth', () => {
    const rawDocumentText = `
VIT UNIVERSITY - SCHOOL OF COMPUTER SCIENCE
Operating Systems (CSE2005) - Semester Final Examination
Max Marks: 100
Duration: 180 Minutes

Q1. Explain the four necessary conditions for deadlock occurrence. [10 Marks]
Q2. Consider a system with 5 processes P0-P4 and 3 resource types. Run the Banker's algorithm to determine safe state. [15 Marks]
Q3. Compare LRU and Optimal page replacement algorithms given reference string: 7, 0, 1, 2, 0, 3, 0, 4. [15 Marks]
Q4. Explain inode data structures and calculate the maximum file size for a system with 4KB blocks and 12 direct pointers. [20 Marks]
Q5. Draw a block diagram of the RAID 5 disk architecture showing parity distribution across 4 disks. [15 Marks]
Q6(a) What is thrashing in virtual memory? (5 Marks)
Q6(b) Differentiate between internal and external fragmentation. (5 Marks)
Q7. Which CPU scheduling algorithm provides the minimum average waiting time?
(A) First-Come First-Served
(B) Shortest Job First
(C) Priority Scheduling
(D) Round Robin
[5 Marks]
`;

    const extraction: DocumentExtractionResult = {
      text: rawDocumentText,
      pages: [{ pageNumber: 1, text: rawDocumentText, charCount: rawDocumentText.length }],
      pageCount: 1,
      extractionVersion: 'v1.0',
      hasExtractableText: true,
      metadata: { pageCount: 1, totalChars: rawDocumentText.length },
    };

    const parsed = parseExaminationDocument(extraction, benchmarkNodes);

    // Ground truth: 8 discrete question boundaries expected (Q1, Q2, Q3, Q4, Q5, Q6a, Q6b, Q7)
    const expectedQuestions = 8;
    const detectedQuestions = parsed.questions.length;

    // Boundary recall
    expect(detectedQuestions).toBe(expectedQuestions);

    // Header metadata evaluation
    expect(parsed.totalMarks).toBe(100);
    expect(parsed.durationMinutes).toBe(180);

    // Marks fidelity measurement
    let correctlyExtractedMarks = 0;
    for (const q of parsed.questions) {
      if (q.marks !== undefined && q.marks > 0) {
        correctlyExtractedMarks++;
      }
    }
    const marksAccuracy = (correctlyExtractedMarks / detectedQuestions) * 100;
    expect(marksAccuracy).toBeGreaterThanOrEqual(85);
  });

  it('2. Evaluates Topic-to-Question Mapping Precision & Deterministic Heuristic Relevance Scoring', () => {
    // Ground-truth mapping fixtures evaluating precise routing and honest abstention
    const testCases = [
      {
        question: 'Explain how the Banker algorithm avoids system deadlocks.',
        expectedTopicId: 'topic-concurrency',
        expectHighConfidence: true,
      },
      {
        question: 'Calculate page fault rate under LRU page replacement with 3 memory frames.',
        expectedTopicId: 'topic-memory',
        expectHighConfidence: true,
      },
      {
        question:
          'Explain inode data structures and calculate the maximum file size for a system with 4KB blocks.',
        expectedTopicId: 'topic-storage',
        expectHighConfidence: true,
      },
      {
        question: 'Discuss photosynthesis light reactions and ATP synthase in thylakoids.',
        expectedTopicId: undefined, // Out of syllabus / unrelated
        expectHighConfidence: false,
      },
      {
        question: 'Explain quantum entanglement and violation of Bell inequalities in optics.',
        expectedTopicId: undefined, // Completely unrelated domain
        expectHighConfidence: false,
      },
    ];

    let correctMatches = 0;

    for (const tc of testCases) {
      const match = mapQuestionToTopics(tc.question, benchmarkNodes);

      if (tc.expectedTopicId) {
        if (match.bestTopicId === tc.expectedTopicId) {
          correctMatches++;
        }
        if (tc.expectHighConfidence) {
          expect(match.confidence).toBeGreaterThanOrEqual(0.4);
        }
      } else {
        // Honest abstention on out-of-domain concepts
        if (!match.bestTopicId || (match.confidence ?? 0) < 0.3) {
          correctMatches++;
        }
      }
    }

    const mappingAccuracy = (correctMatches / testCases.length) * 100;
    expect(mappingAccuracy).toBe(100);
  });

  it('2b. Accurately Handles Ambiguity, Multiple Candidates, Missing Topics & Insufficient Evidence', () => {
    // 1. Ambiguous question matching multiple valid syllabus topics
    const ambiguousQuestion =
      'Analyze memory allocation deadlock where processes waiting for virtual memory pages create circular wait.';
    const ambiguousMatch = mapQuestionToTopics(ambiguousQuestion, benchmarkNodes);
    expect(ambiguousMatch.candidateTopics.length).toBeGreaterThanOrEqual(2);
    // Both concurrency/deadlock and memory should be suggested as candidates
    const topicIds = ambiguousMatch.candidateTopics.map((c) => c.topicId);
    expect(topicIds).toContain('topic-concurrency');
    expect(topicIds).toContain('topic-memory');

    // 2. Empty / missing topics in syllabus -> abstains safely without errors
    const emptyMatch = mapQuestionToTopics('Explain CPU scheduling and context switches.', []);
    expect(emptyMatch.candidateTopics).toEqual([]);
    expect(emptyMatch.bestTopicId).toBeUndefined();
    expect(emptyMatch.confidence).toBeUndefined();

    // 3. Insufficient evidence / trivial text -> abstains cleanly
    const insufficientMatch = mapQuestionToTopics('What is it?', benchmarkNodes);
    expect(insufficientMatch.candidateTopics).toEqual([]);
    expect(insufficientMatch.bestTopicId).toBeUndefined();

    // 4. Exact topic phrase match produces deterministic score (~0.940)
    const exactPhraseMatch = mapQuestionToTopics(
      'Detailed tutorial on Virtual Memory and Page Replacement in modern Unix kernels.',
      benchmarkNodes,
    );
    // For 4 non-stop words ("virtual", "memory", "page", "replacement"), score = 0.9 + 4*0.02 = 0.980
    expect(exactPhraseMatch.confidence).toBe(0.98);
  });

  it('3. Evaluates Numerical Answer Verification Accuracy', () => {
    const verified = verifyNumericalAnswer('The impedance is 45.2 ohms', '45.2 ohms', 0.05);
    expect(verified.isCorrect).toBe(true);

    const withinTolerance = verifyNumericalAnswer('45.5', '45.2', 0.05);
    expect(withinTolerance.isCorrect).toBe(true);

    const incorrect = verifyNumericalAnswer('92.0', '45.2', 0.05);
    expect(incorrect.isCorrect).toBe(false);
  });

  it('4. Preserves Attempt-Count Rules (e.g., Attempt 10 of 12) and Flags Optional Questions', () => {
    const paperWithAttemptRule = `
MIDTERM EXAMINATION - OPERATING SYSTEMS
Max Marks: 50
Duration: 90 Minutes

Instructions:
Answer any 3 out of 4 questions. All questions carry equal marks.

1. Explain Mutual Exclusion using Peterson's Algorithm. [15 Marks]
2. Describe Semaphore primitives wait() and signal(). [15 Marks]
3. Explain Deadlock Prevention techniques. [15 Marks]
4. Describe Priority Inversion and Priority Ceiling Protocol. [15 Marks]
`;

    const extraction: DocumentExtractionResult = {
      text: paperWithAttemptRule,
      pages: [
        { pageNumber: 1, text: paperWithAttemptRule, charCount: paperWithAttemptRule.length },
      ],
      pageCount: 1,
      extractionVersion: 'v1.0',
      hasExtractableText: true,
      metadata: { pageCount: 1, totalChars: paperWithAttemptRule.length },
    };

    const parsed = parseExaminationDocument(extraction, benchmarkNodes);
    expect(parsed.questions.length).toBe(4);

    // Rule preservation: questions must NOT be marked compulsory
    for (const q of parsed.questions) {
      expect(q.compulsory).toBe(false);
      expect(q.choiceGroup).toBe('Attempt 3 of 4');
    }
  });

  it('5. Detects and Warns on Structural Marks Inconsistency', () => {
    const inconsistentMarksPaper = `
SEMESTER EXAMINATION - OPERATING SYSTEMS
Total Marks: 50
Duration: 90 Minutes

Instructions:
Answer all questions.

1. Define critical section problem. [10 Marks]
2. Explain Dining Philosophers problem. [10 Marks]
`;

    const extraction: DocumentExtractionResult = {
      text: inconsistentMarksPaper,
      pages: [
        { pageNumber: 1, text: inconsistentMarksPaper, charCount: inconsistentMarksPaper.length },
      ],
      pageCount: 1,
      extractionVersion: 'v1.0',
      hasExtractableText: true,
      metadata: { pageCount: 1, totalChars: inconsistentMarksPaper.length },
    };

    const parsed = parseExaminationDocument(extraction, benchmarkNodes);
    // Extracted marks = 10 + 10 = 20, but declared Total Marks = 50.
    expect(parsed.warnings.some((w) => w.toLowerCase().includes('inconsistency'))).toBe(true);
  });

  it('6. Evaluates Cross-Paper Topic Recurrence & Identifies Unobserved Syllabus Topics with Exact Denominators', () => {
    const dummyPapers: ExaminationPaper[] = [
      {
        id: 'p1',
        userId: 'u1',
        courseId: 'course-os',
        resourceId: null,
        title: 'Fall 2024 Exam',
        term: 'Fall 2024',
        examType: 'FAT',
        academicYear: '2024',
        totalMarks: 100,
        durationMinutes: 180,
        instructions: null,
        status: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'p2',
        userId: 'u1',
        courseId: 'course-os',
        resourceId: null,
        title: 'Spring 2025 Exam',
        term: 'Spring 2025',
        examType: 'FAT',
        academicYear: '2025',
        totalMarks: 100,
        durationMinutes: 180,
        instructions: null,
        status: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const dummyQuestions: ExaminationQuestion[] = [
      // In Paper 1: Topic Concurrency
      {
        id: 'q1-1',
        paperId: 'p1',
        userId: 'u1',
        courseId: 'course-os',
        questionNumber: '1',
        questionText: 'Deadlock avoidance question',
        marks: 20,
        topicId: 'topic-concurrency',
        questionFormat: 'short_answer',
        compulsory: true,
        difficulty: 'medium',
        verificationStatus: 'extracted',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // In Paper 2: Topic Concurrency AGAIN (Observed in 2 of 2 papers)
      {
        id: 'q2-1',
        paperId: 'p2',
        userId: 'u1',
        courseId: 'course-os',
        questionNumber: '1',
        questionText: 'Banker algorithm question',
        marks: 20,
        topicId: 'topic-concurrency',
        questionFormat: 'short_answer',
        compulsory: true,
        difficulty: 'hard',
        verificationStatus: 'extracted',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // In Paper 2: Topic Memory (Observed in 1 of 2 papers)
      {
        id: 'q2-2',
        paperId: 'p2',
        userId: 'u1',
        courseId: 'course-os',
        questionNumber: '2',
        questionText: 'Page replacement LRU',
        marks: 20,
        topicId: 'topic-memory',
        questionFormat: 'numerical',
        compulsory: true,
        difficulty: 'medium',
        verificationStatus: 'extracted',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Topic Storage is NEVER observed in any uploaded paper!
    ];

    const report = compareCrossPapers(dummyPapers, dummyQuestions, benchmarkNodes);

    expect(report.paperCount).toBe(2);
    expect(report.totalQuestionsAnalyzed).toBe(3);

    // Topic Concurrency: appeared in 2 of 2 papers
    const concurrencySpread = report.topicCoverageSpread.find(
      (t) => t.topicId === 'topic-concurrency',
    );
    expect(concurrencySpread).toBeDefined();
    expect(concurrencySpread?.papersAppearedIn).toBe(2);
    expect(concurrencySpread?.totalPapers).toBe(2);
    expect(concurrencySpread?.coverageRatio).toBe(1.0);

    // Topic Memory: appeared in 1 of 2 papers
    const memorySpread = report.topicCoverageSpread.find((t) => t.topicId === 'topic-memory');
    expect(memorySpread).toBeDefined();
    expect(memorySpread?.papersAppearedIn).toBe(1);
    expect(memorySpread?.totalPapers).toBe(2);
    expect(memorySpread?.coverageRatio).toBe(0.5);

    // Topic Storage: 0 appearances -> Identified in uncoveredCourseTopics
    const storageUncovered = report.uncoveredCourseTopics.find(
      (t) => t.topicId === 'topic-storage',
    );
    expect(storageUncovered).toBeDefined();
    expect(storageUncovered?.topicTitle).toBe('File System Implementation and Inodes');
  });
});
