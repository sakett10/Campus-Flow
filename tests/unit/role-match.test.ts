import { describe, it, expect } from 'vitest';
import {
  evaluateRoleMatch,
  EVIDENCE_LEVEL_WEIGHTS,
  ROLE_MATCH_DISCLAIMER,
} from '@campusflow/shared';
import type {
  Opportunity,
  OpportunitySkillRequirement,
  Skill,
  StudentSkillEvidence,
} from '@campusflow/types';

describe('Deterministic Role Match Engine', () => {
  const dummyOpportunity: Opportunity = {
    id: 'opp-swe-1',
    companyId: 'comp-1',
    roleFamilyId: 'rf-swe',
    title: 'Software Engineer',
    opportunityType: 'early_career',
    targetGraduationYears: [2026],
    degreeLevels: ['bachelors'],
    allowedMajors: ['Computer Science'],
    description: 'SWE position',
    season: 'Fall 2026',
    employmentType: 'full_time',
    workplaceType: 'hybrid',
    status: 'active',
    minGpa: null,
    minExperienceMonths: 0,
    requiresWorkAuth: 'any',
    sourceUrl: 'https://example.com/jobs/1',
    sourceOrganization: 'TechCo',
    retrievalTimestamp: new Date(),
    publicationDate: null,
    expirationDate: null,
    lastValidTimestamp: null,
    extractionVersion: 'v1.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const skills: Skill[] = [
    {
      id: 'skill-python',
      name: 'Python',
      category: 'language',
      synonyms: ['py', 'python3'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'skill-dsa',
      name: 'Data Structures and Algorithms',
      category: 'concept',
      synonyms: ['dsa', 'algorithms'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'skill-sql',
      name: 'SQL',
      category: 'language',
      synonyms: ['postgres', 'mysql', 'relational database'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'skill-dist-sys',
      name: 'Distributed Systems',
      category: 'concept',
      synonyms: ['distributed computing'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const skillRequirements: Array<OpportunitySkillRequirement & { skill?: Skill }> = [
    {
      id: 'req-python',
      opportunityId: dummyOpportunity.id,
      skillId: 'skill-python',
      requirementType: 'required',
      minProficiency: 'proficient',
      importanceWeight: '1.00',
      notes: null,
      createdAt: new Date(),
      skill: skills[0],
    },
    {
      id: 'req-dsa',
      opportunityId: dummyOpportunity.id,
      skillId: 'skill-dsa',
      requirementType: 'required',
      minProficiency: 'proficient',
      importanceWeight: '1.00',
      notes: null,
      createdAt: new Date(),
      skill: skills[1],
    },
    {
      id: 'req-dist-sys',
      opportunityId: dummyOpportunity.id,
      skillId: 'skill-dist-sys',
      requirementType: 'preferred',
      minProficiency: 'basic',
      importanceWeight: '0.80',
      notes: null,
      createdAt: new Date(),
      skill: skills[3],
    },
  ];

  it('Calculates score deterministically with supporting evidence and gaps', () => {
    const studentEvidence: StudentSkillEvidence[] = [
      {
        id: 'ev-1',
        userId: 'user-1',
        skillId: 'skill-python',
        evidenceLevel: 'demonstrated',
        evidenceSource: 'project',
        academicNodeId: null,
        courseId: null,
        title: 'Built REST API backend in Python',
        description: 'Used FastAPI and SQLAlchemy',
        artifactUrl: null,
        verifiedAt: null,
        confidenceScore: '0.85',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const result = evaluateRoleMatch({
      opportunity: dummyOpportunity,
      skillRequirements,
      skills,
      evidenceList: studentEvidence,
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);

    // Supporting evidence includes demonstrated Python
    expect(result.supportingEvidence.some((e) => e.includes('Python demonstrated'))).toBe(true);

    // Gaps must include missing Data Structures and Algorithms
    expect(
      result.gaps.some(
        (g) => g.includes('Data Structures and Algorithms') && g.includes('missing'),
      ),
    ).toBe(true);

    // Mandatory disclaimer
    expect(result.disclaimer).toBe(ROLE_MATCH_DISCLAIMER);
    expect(result.disclaimer).toContain('NOT a hiring probability');
  });

  it('CRITICAL: Manual self-reported claims receive significantly lower score than demonstrated evidence', () => {
    const claimedEvidence: StudentSkillEvidence[] = [
      {
        id: 'ev-claim-python',
        userId: 'user-1',
        skillId: 'skill-python',
        evidenceLevel: 'claimed',
        evidenceSource: 'self_reported',
        academicNodeId: null,
        courseId: null,
        title: 'I know Python',
        description: 'Self-reported in resume',
        artifactUrl: null,
        verifiedAt: null,
        confidenceScore: '0.20',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'ev-claim-dsa',
        userId: 'user-1',
        skillId: 'skill-dsa',
        evidenceLevel: 'claimed',
        evidenceSource: 'self_reported',
        academicNodeId: null,
        courseId: null,
        title: 'Did some LeetCode',
        description: 'Self-reported',
        artifactUrl: null,
        verifiedAt: null,
        confidenceScore: '0.20',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const demonstratedEvidence: StudentSkillEvidence[] = [
      {
        id: 'ev-demo-python',
        userId: 'user-1',
        skillId: 'skill-python',
        evidenceLevel: 'strongly_demonstrated',
        evidenceSource: 'project',
        academicNodeId: null,
        courseId: null,
        title: 'Distributed pipeline in Python',
        description: 'Production-ready project',
        artifactUrl: null,
        verifiedAt: null,
        confidenceScore: '0.90',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'ev-demo-dsa',
        userId: 'user-1',
        skillId: 'skill-dsa',
        evidenceLevel: 'verified',
        evidenceSource: 'academic_course',
        academicNodeId: null,
        courseId: null,
        title: 'Advanced Data Structures Course Grade: A',
        description: 'Verified coursework',
        artifactUrl: null,
        verifiedAt: new Date(),
        confidenceScore: '1.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const claimedResult = evaluateRoleMatch({
      opportunity: dummyOpportunity,
      skillRequirements,
      skills,
      evidenceList: claimedEvidence,
    });

    const demonstratedResult = evaluateRoleMatch({
      opportunity: dummyOpportunity,
      skillRequirements,
      skills,
      evidenceList: demonstratedEvidence,
    });

    // Claimed multiplier is 0.20 vs verified/strongly_demonstrated (0.90-1.00)
    expect(demonstratedResult.score).toBeGreaterThan(claimedResult.score * 2.5);
    expect(claimedResult.evidenceConfidence).toBe('low');
    expect(demonstratedResult.evidenceConfidence).toBe('high');
  });

  it('Evidence weights match specification: verified=1.0, claimed=0.2, unknown=0.0', () => {
    expect(EVIDENCE_LEVEL_WEIGHTS.verified).toBe(1.0);
    expect(EVIDENCE_LEVEL_WEIGHTS.strongly_demonstrated).toBe(0.9);
    expect(EVIDENCE_LEVEL_WEIGHTS.demonstrated).toBe(0.75);
    expect(EVIDENCE_LEVEL_WEIGHTS.weak).toBe(0.4);
    expect(EVIDENCE_LEVEL_WEIGHTS.claimed).toBe(0.2);
    expect(EVIDENCE_LEVEL_WEIGHTS.unknown).toBe(0.0);
  });

  it('Student with no matching evidence receives a score reflecting missing qualifications', () => {
    const result = evaluateRoleMatch({
      opportunity: dummyOpportunity,
      skillRequirements,
      skills,
      evidenceList: [],
    });

    expect(result.score).toBe(0);
    expect(result.evidenceConfidence).toBe('low');
    expect(result.supportingEvidence).toHaveLength(0);
    expect(result.gaps.length).toBeGreaterThanOrEqual(skillRequirements.length);
  });
});
