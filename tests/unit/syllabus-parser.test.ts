import { describe, it, expect } from 'vitest';
import { parseSyllabusDocument } from '@campusflow/shared';
import type { DocumentExtractionResult } from '@campusflow/types';

describe('Syllabus Parser', () => {
  const sampleSyllabusText = `
Course Code: CSE3001
Course Title: Database Management Systems
Semester: Fall 2026

Prerequisites: Discrete Mathematics, Data Structures and Algorithms

Module 1: Relational Model and Algebra (6 Hours)
- Introduction to Database Systems
- Relational Data Model and Schemas
- Relational Algebra Operations -- Selection and Projection; Joins and Division

Module 2: Structured Query Language (SQL) (8 Hours)
- DDL and DML Statements
- Complex Queries and Nested Subqueries
- Views, Assertions, and Triggers

Module 3: Normalization and Schema Refinement (7 Hours)
- Functional Dependencies
- Boyce-Codd Normal Form (BCNF)
- Third Normal Form (3NF) and Decomposition Algorithms

Text Books:
1. Silberschatz, Korth, Sudarshan, "Database System Concepts", 7th Edition, McGraw-Hill
2. Ramakrishnan and Gehrke, "Database Management Systems", 3rd Edition, WCB/McGraw-Hill

Assessment Scheme:
CAT-1: 20% weightage, Total Marks: 50
CAT-2: 20% weightage, Total Marks: 50
FAT: 40% weightage, Total Marks: 100
Quizzes: 20% weightage
`;

  it('correctly parses course metadata, modules, and topics', () => {
    const doc: DocumentExtractionResult = {
      text: sampleSyllabusText,
      pages: [
        {
          pageNumber: 1,
          text: sampleSyllabusText,
          charCount: sampleSyllabusText.length,
        },
      ],
      pageCount: 1,
      extractionVersion: 'v1.0',
      hasExtractableText: true,
    };

    const parsed = parseSyllabusDocument(doc);

    expect(parsed.code).toBe('CSE3001');
    expect(parsed.title).toBe('Database Management Systems');
    expect(parsed.term).toBe('Fall 2026');
    expect(parsed.prerequisites).toContain('Discrete Mathematics');
    expect(parsed.modules.length).toBe(3);

    // Module 1 check
    const m1 = parsed.modules[0]!;
    expect(m1.title).toContain('Relational Model and Algebra');
    expect(m1.teachingHours).toBe(6);
    expect(m1.topics.length).toBeGreaterThanOrEqual(3);
    expect(m1.topics[0]!.title).toBe('Introduction to Database Systems');
    expect(m1.topics[0]!.estimatedMinutes).toBe(60);

    // Provenance page check
    expect(m1.topics[0]!.pageReferences).toBe('Page 1');

    // Textbooks check
    expect(parsed.prescribedTextbooks.length).toBe(2);
    expect(parsed.prescribedTextbooks[0]!.title).toContain('Database System Concepts');

    // Assessments check
    expect(parsed.assessments.length).toBeGreaterThanOrEqual(3);
    const cat1 = parsed.assessments.find((a) => a.title.includes('CAT-1'));
    expect(cat1).toBeDefined();
    expect(cat1?.type).toBe('CAT');
    expect(cat1?.totalMarks).toBe(50);
  });

  it('provides safe fallbacks and flags unclear fields when document has minimal structure', () => {
    const emptyDoc: DocumentExtractionResult = {
      text: 'Overview of Computing\nIntroduction to technology\nBasic principles of computing',
      pages: [{ pageNumber: 1, text: 'Overview of Computing', charCount: 21 }],
      pageCount: 1,
      extractionVersion: 'v1.0',
      hasExtractableText: true,
    };

    const parsed = parseSyllabusDocument(emptyDoc);

    expect(parsed.code).toBe('CSE101');
    expect(parsed.unclearFields).toBeDefined();
    expect(parsed.unclearFields).toContain('code');
    expect(parsed.modules.length).toBe(1);
    expect(parsed.modules[0]!.topics.length).toBeGreaterThanOrEqual(1);
    expect(parsed.confidence).toBeLessThan(0.9);
  });
});
