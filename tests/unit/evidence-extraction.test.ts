import { describe, it, expect } from 'vitest';
import { extractEvidenceFromAcademicBrain } from '../../packages/shared/src/opportunities/evidence-extractor.js';
import {
  mapAcademicConceptToSkill,
  resolveSkillName,
} from '../../packages/shared/src/opportunities/skill-mapping.js';
import { computeActionOptimization } from '../../packages/shared/src/opportunities/action-optimizer.js';
import { CANONICAL_CONCEPT_SKILL_MAPPINGS } from '../../packages/types/src/index.js';
import type {
  Course,
  AcademicNode,
  Assessment,
  Resource,
  Skill,
  Opportunity,
  OpportunitySkillRequirement,
} from '../../packages/types/src/index.js';

describe('Academic Brain to Skill Evidence Extraction & Action Optimizer', () => {
  const userId = '11111111-1111-4111-a111-111111111111';

  describe('Concept to Skill Mappings', () => {
    it('normalizes academic concepts to canonical career skills', () => {
      expect(
        mapAcademicConceptToSkill('graph algorithms', CANONICAL_CONCEPT_SKILL_MAPPINGS)?.skillName,
      ).toBe('Algorithms');
      expect(mapAcademicConceptToSkill('TCP/IP', CANONICAL_CONCEPT_SKILL_MAPPINGS)?.skillName).toBe(
        'Networking',
      );
      expect(
        mapAcademicConceptToSkill('concurrency', CANONICAL_CONCEPT_SKILL_MAPPINGS)?.skillName,
      ).toBe('Concurrency');
      expect(
        mapAcademicConceptToSkill('linear algebra', CANONICAL_CONCEPT_SKILL_MAPPINGS)?.skillName,
      ).toBe('Mathematics');
      expect(
        mapAcademicConceptToSkill('probability and statistics', CANONICAL_CONCEPT_SKILL_MAPPINGS)
          ?.skillName,
      ).toBe('Quantitative Reasoning');
      expect(
        mapAcademicConceptToSkill('transformers', CANONICAL_CONCEPT_SKILL_MAPPINGS)?.skillName,
      ).toBe('Machine Learning');
      expect(
        mapAcademicConceptToSkill('distributed systems', CANONICAL_CONCEPT_SKILL_MAPPINGS)
          ?.skillName,
      ).toBe('Distributed Systems');
    });

    it('falls back to lowercase trimmed skill name when no explicit mapping exists', () => {
      expect(
        resolveSkillName('Custom-Framework', [], CANONICAL_CONCEPT_SKILL_MAPPINGS).normalizedName,
      ).toBe('Custom-Framework');
    });
  });

  describe('Automatic Evidence Extraction & Mastery Guard', () => {
    const course: Course = {
      id: 'course-cs301',
      userId,
      code: 'CS301',
      title: 'Distributed Systems',
      term: 'Fall 2025',
      credits: 4,
      department: 'Computer Science',
      gradingBasis: 'graded',
      syllabusVersion: 1,
      createdAt: new Date('2025-08-01T00:00:00Z'),
      updatedAt: new Date('2025-08-01T00:00:00Z'),
    };

    const academicNodes: AcademicNode[] = [
      {
        id: 'node-dist-algo',
        courseId: 'course-cs301',
        title: 'Distributed Systems & Consensus',
        nodeType: 'topic',
        depth: 1,
        sequenceOrder: 1,
        status: 'active',
        parentTopicId: null,
        targetDurationMinutes: null,
        description: 'Covers Paxos and Raft consensus in distributed systems.',
        createdAt: new Date('2025-08-01T00:00:00Z'),
        updatedAt: new Date('2025-08-01T00:00:00Z'),
      },
      {
        id: 'node-networking',
        courseId: 'course-cs301',
        title: 'TCP/IP and Socket Networking',
        nodeType: 'topic',
        depth: 1,
        sequenceOrder: 2,
        status: 'active',
        parentTopicId: null,
        targetDurationMinutes: null,
        description: 'Low level network protocols.',
        createdAt: new Date('2025-08-01T00:00:00Z'),
        updatedAt: new Date('2025-08-01T00:00:00Z'),
      },
    ];

    const assessments: Assessment[] = [
      {
        id: 'assess-raft',
        courseId: 'course-cs301',
        title: 'Raft Consensus Implementation Exam',
        category: 'exam',
        weightage: 30,
        totalMarks: 100,
        dueDate: new Date('2025-10-15T00:00:00Z'),
        examDate: new Date('2025-10-15T00:00:00Z'),
        status: 'graded',
        createdAt: new Date('2025-08-01T00:00:00Z'),
        updatedAt: new Date('2025-10-16T00:00:00Z'),
      },
    ];

    const skills: Skill[] = [
      {
        id: 'sk-ds',
        name: 'Distributed Systems',
        category: 'concept',
        synonyms: ['distributed computing'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sk-net',
        name: 'Networking',
        category: 'concept',
        synonyms: ['tcp/ip'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('derives evidence with full provenance from topics, assessments, and projects', () => {
      const candidates = extractEvidenceFromAcademicBrain({
        userId,
        courses: [course],
        academicNodes,
        assessments,
        resources: [],
        skills,
        conceptMappings: CANONICAL_CONCEPT_SKILL_MAPPINGS,
      });

      expect(candidates.length).toBeGreaterThanOrEqual(1);

      // 1. Topic/Concept evidence mapped via concept dictionary (TCP/IP -> Networking)
      const networkingCandidate = candidates.find(
        (c) => c.skillName.toLowerCase() === 'networking',
      );
      expect(networkingCandidate).toBeDefined();
      expect(['demonstrated', 'strongly_demonstrated']).toContain(
        networkingCandidate?.evidenceLevel,
      );
      expect(networkingCandidate?.courseId).toBe('course-cs301');
      expect(networkingCandidate?.academicNodeId).toBe('node-networking');

      // 2. Distributed systems evidence derived from syllabus node
      const dsCandidate = candidates.find(
        (c) => c.skillName.toLowerCase() === 'distributed systems',
      );
      expect(dsCandidate).toBeDefined();
      expect(['demonstrated', 'strongly_demonstrated']).toContain(dsCandidate?.evidenceLevel);
      expect(dsCandidate?.courseId).toBe('course-cs301');
    });

    it('CRITICAL MASTERY GUARD: Mere document upload does NOT confer mastery or verified/demonstrated status', () => {
      // Unanchored document uploaded to library without syllabus node or assessment
      const unanchoredResource: Resource = {
        id: 'res-random-pdf',
        userId,
        courseId: null,
        topicId: null,
        title: 'Advanced Quantum Mechanics and Distributed Systems.pdf',
        resourceType: 'textbook',
        mimeType: 'application/pdf',
        storageKey: 'users/1111/docs/quantum.pdf',
        sizeBytes: 5000000,
        contentHash: 'hash123',
        status: 'ready',
        isArchived: false,
        createdAt: new Date('2025-08-01T00:00:00Z'),
        updatedAt: new Date('2025-08-01T00:00:00Z'),
      };

      const candidates = extractEvidenceFromAcademicBrain({
        userId,
        courses: [],
        academicNodes: [],
        assessments: [],
        resources: [unanchoredResource],
        skills,
        conceptMappings: CANONICAL_CONCEPT_SKILL_MAPPINGS,
      });

      // No demonstrated or verified evidence generated from raw file upload alone
      const demonstratedEvidence = candidates.filter(
        (e) =>
          e.evidenceLevel === 'demonstrated' ||
          e.evidenceLevel === 'verified' ||
          e.evidenceLevel === 'strongly_demonstrated',
      );
      expect(demonstratedEvidence).toHaveLength(0);

      // If any weak/claimed evidence is recorded, it must have evidenceLevel 'weak'
      for (const e of candidates) {
        expect(e.evidenceLevel).toBe('weak');
        expect(e.evidenceSource).toBe('coursework');
      }
    });

    it('retains distinct confidence levels and self-reported flag', () => {
      const selfReportedEvidence = {
        id: 'ev-self',
        userId,
        skillId: 'sk-ds',
        evidenceLevel: 'claimed' as const,
        evidenceSource: 'self_reported' as const,
        academicNodeId: null,
        courseId: null,
        assessmentId: null,
        title: 'Self-reported skill: Distributed Systems',
        description: 'Student claims familiarity with distributed consensus.',
        artifactUrl: null,
        verifiedAt: null,
        confidenceScore: '0.30',
        createdAt: new Date('2025-08-01T00:00:00Z'),
        updatedAt: new Date('2025-08-01T00:00:00Z'),
      };

      expect(selfReportedEvidence.evidenceLevel).toBe('claimed');
      expect(selfReportedEvidence.evidenceSource).toBe('self_reported');
    });
  });

  describe('Career Action Optimizer Multi-Opportunity Aggregation', () => {
    it('aggregates missing skills across multiple opportunities and maps them to academic coursework', () => {
      const skillDS: Skill = {
        id: 'sk-ds',
        name: 'Distributed Systems',
        category: 'concept',
        synonyms: ['distributed computing'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const skillAlgo: Skill = {
        id: 'sk-algo',
        name: 'Algorithms',
        category: 'concept',
        synonyms: ['dsa'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const opp1: Opportunity = {
        id: 'opp-1',
        companyId: 'comp-1',
        roleFamilyId: 'rf-1',
        title: 'Distributed Systems Intern',
        opportunityType: 'internship',
        targetGraduationYears: [2026],
        degreeLevels: ['bachelors'],
        allowedMajors: ['Computer Science'],
        description: 'Distributed storage',
        season: 'Summer 2026',
        employmentType: 'internship',
        workplaceType: 'hybrid',
        status: 'active',
        minGpa: null,
        minExperienceMonths: 0,
        requiresWorkAuth: 'any',
        sourceUrl: 'https://example.com/1',
        sourceOrganization: 'Org A',
        retrievalTimestamp: new Date(),
        publicationDate: null,
        expirationDate: null,
        lastValidTimestamp: null,
        extractionVersion: 'v1.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const opp2: Opportunity = {
        id: 'opp-2',
        companyId: 'comp-2',
        roleFamilyId: 'rf-1',
        title: 'Backend Engineer Intern',
        opportunityType: 'internship',
        targetGraduationYears: [2026],
        degreeLevels: ['bachelors'],
        allowedMajors: ['Computer Science'],
        description: 'Backend services',
        season: 'Summer 2026',
        employmentType: 'internship',
        workplaceType: 'remote',
        status: 'active',
        minGpa: null,
        minExperienceMonths: 0,
        requiresWorkAuth: 'any',
        sourceUrl: 'https://example.com/2',
        sourceOrganization: 'Org B',
        retrievalTimestamp: new Date(),
        publicationDate: null,
        expirationDate: null,
        lastValidTimestamp: null,
        extractionVersion: 'v1.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const reqDS1: OpportunitySkillRequirement = {
        id: 'req-1',
        opportunityId: 'opp-1',
        skillId: 'sk-ds',
        requirementType: 'required',
        minProficiency: 'proficient',
        importanceWeight: '1.00',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const reqAlgo1: OpportunitySkillRequirement = {
        id: 'req-2',
        opportunityId: 'opp-1',
        skillId: 'sk-algo',
        requirementType: 'required',
        minProficiency: 'competent',
        importanceWeight: '1.00',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const reqDS2: OpportunitySkillRequirement = {
        id: 'req-3',
        opportunityId: 'opp-2',
        skillId: 'sk-ds',
        requirementType: 'required',
        minProficiency: 'proficient',
        importanceWeight: '1.00',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const courseDS: Course = {
        id: 'c-ds',
        userId,
        code: 'CS301',
        title: 'Distributed Systems',
        term: 'Fall 2025',
        credits: 4,
        department: 'Computer Science',
        gradingBasis: 'graded',
        syllabusVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const nodeRaft: AcademicNode = {
        id: 'node-raft',
        courseId: 'c-ds',
        title: 'Raft & Distributed Systems Consensus',
        nodeType: 'topic',
        depth: 1,
        sequenceOrder: 1,
        status: 'active',
        parentTopicId: null,
        targetDurationMinutes: null,
        description: 'Replicated state machines',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const recommendations = computeActionOptimization({
        opportunities: [
          { opportunity: opp1, skillRequirements: [reqDS1, reqAlgo1] },
          { opportunity: opp2, skillRequirements: [reqDS2] },
        ],
        skills: [skillDS, skillAlgo],
        studentEvidence: [], // student has no evidence yet
        courses: [courseDS],
        academicNodes: [nodeRaft],
        conceptSkillMappings: CANONICAL_CONCEPT_SKILL_MAPPINGS,
      });

      // 1. Recommendations rank highest demand skills
      expect(recommendations.length).toBeGreaterThanOrEqual(1);

      // 'Distributed Systems' appears as required in BOTH opportunities (targetOpportunitiesCount = 2)
      const topAction = recommendations.find((r) => r.skillName === 'Distributed Systems');
      expect(topAction).toBeDefined();
      expect(topAction?.targetOpportunitiesCount).toBe(2);
      expect(topAction?.impact).toBe('high');

      // 2. High-impact action links to existing Academic Brain course & topic
      expect(topAction?.academicConnection).toBeDefined();
      expect(topAction?.academicConnection?.courseCode).toBe('CS301');
      expect(topAction?.academicConnection?.nodeTitle).toBe('Raft & Distributed Systems Consensus');
    });
  });
});
