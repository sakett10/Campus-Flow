import { describe, it, expect } from 'vitest';
import { computeActionOptimization } from '@campusflow/shared';
import type {
  Opportunity,
  OpportunitySkillRequirement,
  Skill,
  StudentSkillEvidence,
  AcademicNode,
  Course,
} from '@campusflow/types';

describe('Action Optimizer Engine ("What would most improve my opportunity set?")', () => {
  const dummyOppA: Opportunity = {
    id: 'opp-1',
    companyId: 'comp-1',
    roleFamilyId: 'rf-swe',
    title: 'Software Engineer Intern',
    opportunityType: 'internship',
    targetGraduationYears: [2027],
    degreeLevels: ['bachelors'],
    allowedMajors: ['Computer Science'],
    description: null,
    season: 'Summer 2027',
    employmentType: 'internship',
    workplaceType: 'hybrid',
    status: 'active',
    minGpa: null,
    minExperienceMonths: 0,
    requiresWorkAuth: 'any',
    sourceUrl: 'https://example.com/opp1',
    sourceOrganization: 'Org A',
    retrievalTimestamp: new Date(),
    publicationDate: null,
    expirationDate: null,
    lastValidTimestamp: null,
    extractionVersion: 'v1.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const dummyOppB: Opportunity = {
    ...dummyOppA,
    id: 'opp-2',
    title: 'Backend Systems Intern',
    sourceUrl: 'https://example.com/opp2',
  };

  const skills: Skill[] = [
    {
      id: 'skill-dsa',
      name: 'Data Structures and Algorithms',
      category: 'concept',
      synonyms: ['dsa'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'skill-dist-sys',
      name: 'Distributed Systems',
      category: 'concept',
      synonyms: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'skill-python',
      name: 'Python',
      category: 'language',
      synonyms: ['py'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const skillReqsA: Array<OpportunitySkillRequirement & { skill?: Skill }> = [
    {
      id: 'sr-1',
      opportunityId: 'opp-1',
      skillId: 'skill-dsa',
      requirementType: 'required',
      minProficiency: 'proficient',
      importanceWeight: '1.00',
      notes: null,
      createdAt: new Date(),
      skill: skills[0],
    },
    {
      id: 'sr-2',
      opportunityId: 'opp-1',
      skillId: 'skill-python',
      requirementType: 'required',
      minProficiency: 'proficient',
      importanceWeight: '1.00',
      notes: null,
      createdAt: new Date(),
      skill: skills[2],
    },
  ];

  const skillReqsB: Array<OpportunitySkillRequirement & { skill?: Skill }> = [
    {
      id: 'sr-3',
      opportunityId: 'opp-2',
      skillId: 'skill-dsa',
      requirementType: 'required',
      minProficiency: 'proficient',
      importanceWeight: '1.00',
      notes: null,
      createdAt: new Date(),
      skill: skills[0],
    },
    {
      id: 'sr-4',
      opportunityId: 'opp-2',
      skillId: 'skill-dist-sys',
      requirementType: 'required',
      minProficiency: 'proficient',
      importanceWeight: '1.00',
      notes: null,
      createdAt: new Date(),
      skill: skills[1],
    },
  ];

  const course: Course = {
    id: 'course-dsa',
    userId: 'user-1',
    code: 'CSE2003',
    title: 'Data Structures and Algorithms',
    term: 'Fall 2026',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const academicNodes: AcademicNode[] = [
    {
      id: 'node-dsa-trees',
      courseId: course.id,
      userId: 'user-1',
      parentId: null,
      type: 'topic',
      title: 'Trees and Graphs Algorithms',
      description: 'Binary trees, AVL, BFS, DFS, Dijkstra',
      orderIndex: 3,
      origin: 'extracted',
      confidence: 0.9,
      needsReview: 'verified',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('Identifies highest-impact missing skill across multiple opportunities and maps to academic node', () => {
    // Student only has Python demonstrated, lacks DSA and Distributed Systems
    const studentEvidence: StudentSkillEvidence[] = [
      {
        id: 'ev-python',
        userId: 'user-1',
        skillId: 'skill-python',
        evidenceLevel: 'verified',
        evidenceSource: 'project',
        academicNodeId: null,
        courseId: null,
        title: 'Python Web API',
        description: null,
        artifactUrl: null,
        verifiedAt: new Date(),
        confidenceScore: '1.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const actions = computeActionOptimization({
      opportunities: [
        { opportunity: dummyOppA, skillRequirements: skillReqsA },
        { opportunity: dummyOppB, skillRequirements: skillReqsB },
      ],
      skills,
      studentEvidence,
      courses: [course],
      academicNodes,
    });

    expect(actions.length).toBeGreaterThanOrEqual(1);

    // DSA is required in both opp 1 and opp 2, so it should be ranked #1 high impact
    const topAction = actions[0]!;
    expect(topAction.skillName).toBe('Data Structures and Algorithms');
    expect(topAction.impact).toBe('high');
    expect(topAction.targetOpportunitiesCount).toBe(2);

    // It should have mapped to the academic course CSE2003
    expect(topAction.academicConnection).toBeDefined();
    expect(topAction.academicConnection?.courseCode).toBe('CSE2003');
    expect(topAction.academicConnection?.nodeTitle).toBe('Trees and Graphs Algorithms');
  });

  it('Verified and strongly demonstrated skills are excluded from action gap recommendations', () => {
    const fullyDemonstratedEvidence: StudentSkillEvidence[] = [
      {
        id: 'ev-1',
        userId: 'user-1',
        skillId: 'skill-dsa',
        evidenceLevel: 'verified',
        evidenceSource: 'academic_course',
        academicNodeId: null,
        courseId: null,
        title: 'DSA Final Grade A+',
        description: null,
        artifactUrl: null,
        verifiedAt: new Date(),
        confidenceScore: '1.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'ev-2',
        userId: 'user-1',
        skillId: 'skill-dist-sys',
        evidenceLevel: 'strongly_demonstrated',
        evidenceSource: 'project',
        academicNodeId: null,
        courseId: null,
        title: 'Raft consensus implementation',
        description: null,
        artifactUrl: null,
        verifiedAt: null,
        confidenceScore: '0.90',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const actions = computeActionOptimization({
      opportunities: [{ opportunity: dummyOppB, skillRequirements: skillReqsB }],
      skills,
      studentEvidence: fullyDemonstratedEvidence,
      courses: [course],
      academicNodes,
    });

    // Neither DSA nor Distributed Systems should be recommended as missing gaps
    const dsaAction = actions.find((a) => a.skillId === 'skill-dsa');
    const distSysAction = actions.find((a) => a.skillId === 'skill-dist-sys');
    expect(dsaAction).toBeUndefined();
    expect(distSysAction).toBeUndefined();
  });
});
