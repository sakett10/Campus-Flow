import { describe, it, expect } from 'vitest';
import {
  validateFile,
  computeContentHash,
  normalizeText,
  chunkDocument,
  classifyDocumentStructure,
} from '@campusflow/shared';

describe('Resource Intelligence - Ingestion Pipeline Units', () => {
  describe('1. File Validation & Magic Bytes', () => {
    it('accepts valid text file with normalized filename', async () => {
      const buffer = Buffer.from(
        'Chapter 1: Foundations of Database Systems\nRelational algebra and calculus.',
        'utf-8',
      );
      const result = await validateFile({
        buffer,
        originalFileName: 'syllabus_cs3001.txt',
        declaredMimeType: 'text/plain',
      });

      expect(result.isValid).toBe(true);
      expect(result.detectedMimeType).toBe('text/plain');
      expect(result.fileExtension).toBe('.txt');
      expect(result.sizeBytes).toBe(buffer.length);
    });

    it('accepts valid markdown file', async () => {
      const buffer = Buffer.from(
        '# Course Overview\n\n## Module 1: Kinematics\n- Velocity\n- Acceleration',
        'utf-8',
      );
      const result = await validateFile({
        buffer,
        originalFileName: 'notes.md',
        declaredMimeType: 'text/markdown',
      });

      expect(result.isValid).toBe(true);
      expect(result.detectedMimeType).toBe('text/markdown');
      expect(result.fileExtension).toBe('.md');
    });

    it('rejects hostile executable binaries (MZ Windows PE Header)', async () => {
      // Magic bytes 4D 5A
      const maliciousBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const result = await validateFile({
        buffer: maliciousBuffer,
        originalFileName: 'notes.pdf',
        declaredMimeType: 'application/pdf',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Executable binary');
    });

    it('rejects hostile executable binaries (ELF Linux Header)', async () => {
      // Magic bytes 7F 45 4C 46
      const maliciousBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
      const result = await validateFile({
        buffer: maliciousBuffer,
        originalFileName: 'assignment.pdf',
        declaredMimeType: 'application/pdf',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Executable binary');
    });

    it('rejects unsupported extensions and formats (e.g. .exe, .sh, .docx)', async () => {
      const buffer = Buffer.from('echo "malicious script"', 'utf-8');
      const result = await validateFile({
        buffer,
        originalFileName: 'script.sh',
        declaredMimeType: 'application/x-sh',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unsupported file format');
    });

    it('rejects oversized files exceeding 50MB limit', async () => {
      // Create a mock large buffer or small buffer tested with smaller limit
      const oversizedBuffer = Buffer.alloc(100);
      const result = await validateFile({
        buffer: oversizedBuffer,
        originalFileName: 'large.pdf',
        maxSizeBytes: 50, // 50 bytes limit for test
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });

    it('sanitizes dangerous characters in filename', async () => {
      const buffer = Buffer.from('Simple content', 'utf-8');
      const result = await validateFile({
        buffer,
        originalFileName: '../../../etc/passwd.txt',
        declaredMimeType: 'text/plain',
      });

      expect(result.isValid).toBe(true);
      expect(result.normalizedFileName).not.toContain('..');
      expect(result.normalizedFileName).not.toContain('/');
    });
  });

  describe('2. Content Hash & Duplicate Detection', () => {
    it('computes deterministic SHA-256 hash of bytes', () => {
      const content1 = Buffer.from('Physics Lecture 1: Coulomb Law', 'utf-8');
      const content2 = Buffer.from('Physics Lecture 1: Coulomb Law', 'utf-8');
      const differentContent = Buffer.from('Physics Lecture 2: Gauss Law', 'utf-8');

      const hash1 = computeContentHash(content1);
      const hash2 = computeContentHash(content2);
      const hash3 = computeContentHash(differentContent);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('3. Text Normalization', () => {
    it('repairs broken hyphenation across linebreaks while preserving structure', () => {
      const rawText = 'This is an impor-\ntant property of electro-\nstatics in continuous media.';
      const normalized = normalizeText(rawText);

      expect(normalized).toContain('important property of electrostatics');
    });

    it('preserves mathematical equations and formulas intact', () => {
      const rawMath =
        'Maxwell Equation: \\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\epsilon_0}\nF = G \\frac{m_1 m_2}{r^2}';
      const normalized = normalizeText(rawMath);

      expect(normalized).toContain('\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\epsilon_0}');
      expect(normalized).toContain('F = G \\frac{m_1 m_2}{r^2}');
    });

    it('preserves numbered questions and bullet lists', () => {
      const rawList =
        'Question 1. Derive the wave equation in free space.\n1.1 Calculate phase velocity.\n1.2 Compute attenuation constant.';
      const normalized = normalizeText(rawList);

      expect(normalized).toContain('Question 1. Derive the wave equation in free space.');
      expect(normalized).toContain('1.1 Calculate phase velocity.');
    });
  });

  describe('4. Semantic Chunking & Provenance Tracking', () => {
    it('chunks document text with page boundary preservation and token estimates', () => {
      const pages = [
        {
          pageNumber: 1,
          text: 'Module 1: Electrostatics in Vacuum. Coulomb Law describes the electrostatic force between two electric charges. The magnitude of the electrostatic force of attraction or repulsion between two point charges is directly proportional to the product of the magnitudes of charges and inversely proportional to the square of the distance between them.',
        },
        {
          pageNumber: 2,
          text: 'Module 2: Magnetostatics. Biot-Savart Law relates magnetic fields to the currents which are their sources. In magnetostatics, the divergence of magnetic field is always zero, demonstrating that magnetic monopoles do not exist in classical electromagnetism.',
        },
      ];

      const chunks = chunkDocument(pages, { targetChunkSize: 150, overlapSize: 30 });

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeGreaterThan(10);
        expect(chunk.pageStart).toBeGreaterThanOrEqual(1);
        expect(chunk.pageEnd).toBeGreaterThanOrEqual(chunk.pageStart);
        expect(chunk.charCount).toBe(chunk.content.length);
        expect(chunk.tokenCount).toBeGreaterThan(0);
      }
    });

    it('generates sequential sequence numbering without gaps', () => {
      const pages = [
        {
          pageNumber: 1,
          text: 'Section A. Introduction to Computer Architecture.\n'.repeat(15),
        },
      ];

      const chunks = chunkDocument(pages, { targetChunkSize: 100, overlapSize: 20 });
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i]?.sequence).toBe(i);
      }
    });
  });

  describe('5. Academic Map Classification Heuristics', () => {
    it('extracts module and topic hierarchy with high confidence when structured', () => {
      const text = `
Course Syllabus: Advanced Algorithms
Module 1: Divide and Conquer Algorithms
Topic: Master Theorem and Recurrence Relations
Topic: Strassen Matrix Multiplication
Module 2: Dynamic Programming
Topic: Bellman-Ford and Shortest Paths
Topic: Knapsack Problem
      `;

      const nodes = classifyDocumentStructure(text);
      expect(nodes.length).toBeGreaterThan(0);

      const modules = nodes.filter((n) => n.type === 'module');
      expect(modules.length).toBe(2);
      expect(modules[0]?.title).toContain('Module 1: Divide and Conquer');
      expect(modules[1]?.title).toContain('Module 2: Dynamic Programming');

      const topics = modules[0]?.children || [];
      expect(topics.length).toBeGreaterThanOrEqual(1);
      expect(topics[0]?.type).toBe('topic');
    });

    it('flags unstructured content as needsReview: yes with lower confidence', () => {
      const unstructuredText =
        'A random essay about history and philosophy with no syllabus headings or module indicators.';
      const nodes = classifyDocumentStructure(unstructuredText);

      expect(nodes.length).toBe(1);
      expect(nodes[0]?.needsReview).toBe('yes');
      expect(nodes[0]?.confidence).toBeLessThan(0.7);
    });
  });
});
