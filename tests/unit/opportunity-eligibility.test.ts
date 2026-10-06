import { describe, it, expect } from 'vitest';
import { evaluateEligibility } from '@campusflow/shared';
import type { Opportunity, StudentCareerProfile, OpportunityRequirement } from '@campusflow/types';

describe('Opportunity Eligibility Engine', () => {
  const baseOpportunity: Opportunity = {
    id: 'opp-1111-1111',
    companyId: 'comp-1111',
    roleFamilyId: 'rf-1111',
    title: 'Software Engineering Intern',
    opportunityType: 'internship',
    targetGraduationYears: [2026, 2027],
    degreeLevels: ['bachelors'],
    allowedMajors: ['Computer Science', 'Software Engineering'],
    description: 'Summer 2026 internship',
    season: 'Summer 2026',
    employmentType: 'internship',
    workplaceType: 'hybrid',
    status: 'active',
    minGpa: '3.0',
    minExperienceMonths: 0,
    requiresWorkAuth: 'any',
    sourceUrl: 'https://careers.example.com/swe-intern',
    sourceOrganization: 'Example Corp',
    retrievalTimestamp: new Date(),
    publicationDate: new Date('2026-09-01'),
    expirationDate: new Date('2026-12-31'),
    lastValidTimestamp: new Date(),
    extractionVersion: 'v1.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validProfile: StudentCareerProfile = {
    id: 'profile-1',
    userId: 'user-1',
    targetCareerPath: 'Software Engineer',
    targetGeography: ['San Francisco', 'Remote'],
    targetRecruitingPeriod: 'Summer 2026',
    degreeLevel: 'BTech',
    major: 'Computer Science',
    university: 'State University',
    graduationYear: 2027,
    graduationMonth: 5,
    currentYearOfStudy: 3,
    isEnrolled: true,
    workAuthorization: 'us_citizen',
    gpa: '3.65',
    yearsExperience: '1.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('Missing student profile results in UNCERTAIN status without inventing data', () => {
    const result = evaluateEligibility({
      opportunity: baseOpportunity,
      profile: null,
    });

    expect(result.status).toBe('uncertain');
    expect(result.reasons[0]).toMatch(/No student career profile found/i);
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0]?.status).toBe('uncertain');
  });

  it('Eligible student with matching degree, graduation year, major and GPA returns ELIGIBLE', () => {
    const result = evaluateEligibility({
      opportunity: baseOpportunity,
      profile: validProfile,
    });

    expect(result.status).toBe('eligible');
    expect(result.reasons).toHaveLength(0);
    expect(result.criteria.every((c) => c.status === 'pass')).toBe(true);
  });

  it('Graduation year mismatch results in deterministic NOT_ELIGIBLE with clear reason', () => {
    const mismatchProfile: StudentCareerProfile = {
      ...validProfile,
      graduationYear: 2029, // baseOpportunity requires [2026, 2027]
    };

    const result = evaluateEligibility({
      opportunity: baseOpportunity,
      profile: mismatchProfile,
    });

    expect(result.status).toBe('not_eligible');
    const gradCriterion = result.criteria.find((c) => c.criterion === 'Graduation Timing');
    expect(gradCriterion?.status).toBe('fail');
    expect(gradCriterion?.detail).toContain('Target graduation years: [2026, 2027]');
    expect(result.reasons.some((r) => r.includes('Graduation Timing'))).toBe(true);
  });

  it('Missing eligibility criteria in profile produces UNCERTAIN instead of a confident guess', () => {
    const incompleteProfile: StudentCareerProfile = {
      ...validProfile,
      graduationYear: null, // missing grad year
      gpa: null, // missing gpa
    };

    const result = evaluateEligibility({
      opportunity: baseOpportunity,
      profile: incompleteProfile,
    });

    expect(result.status).toBe('uncertain');
    const uncertainCriteria = result.criteria.filter((c) => c.status === 'uncertain');
    expect(uncertainCriteria.length).toBeGreaterThanOrEqual(1);
    expect(result.reasons.some((r) => r.includes('[UNCERTAIN]'))).toBe(true);
  });

  it('Work authorization mismatch results in NOT_ELIGIBLE when position requires US citizen/PR', () => {
    const restrictedOpportunity: Opportunity = {
      ...baseOpportunity,
      requiresWorkAuth: 'us_citizen_or_pr',
    };

    const visaProfile: StudentCareerProfile = {
      ...validProfile,
      workAuthorization: 'f1_opt',
    };

    const result = evaluateEligibility({
      opportunity: restrictedOpportunity,
      profile: visaProfile,
    });

    expect(result.status).toBe('not_eligible');
    const workAuthCriterion = result.criteria.find((c) => c.criterion === 'Work Authorization');
    expect(workAuthCriterion?.status).toBe('fail');
  });

  it('Expired opportunity results in NOT_ELIGIBLE with expired notice', () => {
    const expiredOpportunity: Opportunity = {
      ...baseOpportunity,
      expirationDate: new Date('2024-01-01'), // past date
    };

    const result = evaluateEligibility({
      opportunity: expiredOpportunity,
      profile: validProfile,
    });

    expect(result.status).toBe('not_eligible');
    expect(result.reasons.some((r) => r.includes('Position deadline has passed'))).toBe(true);
  });

  it('Mandatory requirement failure makes the student NOT_ELIGIBLE with cited requirement', () => {
    const requirements: OpportunityRequirement[] = [
      {
        id: 'req-1',
        opportunityId: baseOpportunity.id,
        category: 'coursework',
        description: 'Must have completed Operating Systems course',
        isMandatory: true,
        createdAt: new Date(),
      },
    ];

    // Profile without Operating Systems
    const result = evaluateEligibility({
      opportunity: baseOpportunity,
      requirements,
      profile: validProfile,
    });

    // Unverified specific coursework without academic evidence produces uncertain or failure
    expect(result.status).toBe('uncertain');
  });

  it('Minimum experience requirement failure results in NOT_ELIGIBLE', () => {
    const seniorOpportunity: Opportunity = {
      ...baseOpportunity,
      minExperienceMonths: 24, // 2 years
    };

    const entryProfile: StudentCareerProfile = {
      ...validProfile,
      yearsExperience: '0.5', // 6 months
    };

    const result = evaluateEligibility({
      opportunity: seniorOpportunity,
      profile: entryProfile,
    });

    expect(result.status).toBe('not_eligible');
    const expCriterion = result.criteria.find((c) => c.criterion === 'Experience Level');
    expect(expCriterion?.status).toBe('fail');
  });
});
