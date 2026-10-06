import { describe, it, expect } from 'vitest';
import {
  evaluateProbability,
  validateProbabilityIntegrity,
  MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE,
  MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE,
  MIN_OBSERVED_POSITIVE_OUTCOMES,
  UNOBSERVED_FACTORS,
  PROBABILITY_ETHICAL_DISCLAIMER,
  type EmpiricalOutcomeDataset,
} from '@campusflow/shared';
import type {
  Opportunity,
  StudentCareerProfile,
  StudentSkillEvidence,
  CalculatedProbabilityPrediction,
  UnavailableProbabilityPrediction,
} from '@campusflow/types';

describe('Probability Integrity Rule', () => {
  const dummyOpportunity: Opportunity = {
    id: 'opp-probability-test-1',
    companyId: 'comp-alpha-1',
    roleFamilyId: 'rf-swe-1',
    title: 'Distributed Systems Intern',
    opportunityType: 'internship',
    targetGraduationYears: [2026, 2027],
    degreeLevels: ['bachelors'],
    allowedMajors: ['Computer Science'],
    description: 'Distributed systems backend engineering role.',
    season: 'Summer 2026',
    employmentType: 'full_time',
    workplaceType: 'remote',
    status: 'active',
    minGpa: null,
    minExperienceMonths: 0,
    requiresWorkAuth: 'any',
    sourceUrl: 'https://careers.example.com/roles/dist-sys-1',
    sourceOrganization: 'Apex Cloud Systems',
    retrievalTimestamp: new Date('2026-10-01'),
    publicationDate: null,
    expirationDate: null,
    lastValidTimestamp: null,
    extractionVersion: 'v1.0',
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
  };

  const dummyProfile: StudentCareerProfile = {
    id: 'prof-test-1',
    userId: 'user-test-1',
    targetCareerPath: 'Backend Engineer',
    targetGeography: ['Bengaluru'],
    targetRecruitingPeriod: 'Summer 2026',
    degreeLevel: 'bachelors',
    major: 'Computer Science',
    university: 'Vellore Institute of Technology',
    graduationYear: 2026,
    graduationMonth: 5,
    currentYearOfStudy: 4,
    isEnrolled: true,
    workAuthorization: 'citizen',
    gpa: '8.85',
    yearsExperience: '0',
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
  };

  const dummyEvidence: StudentSkillEvidence[] = [
    {
      id: 'ev-dist-1',
      studentProfileId: 'prof-test-1',
      skillId: 'skill-distributed-systems',
      evidenceSource: 'academic_course',
      evidenceLevel: 'verified',
      title: 'Distributed Systems Course Project',
      summary: 'Implemented Raft consensus engine in Go with 98% test coverage',
      academicNodeId: 'node-raft',
      courseId: 'course-cse3002',
      verificationDetails: { grade: 'A+' },
      createdAt: new Date('2026-10-01'),
      updatedAt: new Date('2026-10-01'),
    },
    {
      id: 'ev-claim-1',
      studentProfileId: 'prof-test-1',
      skillId: 'skill-kubernetes',
      evidenceSource: 'self_reported',
      evidenceLevel: 'claimed',
      title: 'Self-reported K8s familiarity',
      summary: 'Watched a tutorial on Kubernetes',
      verificationDetails: null,
      createdAt: new Date('2026-10-01'),
      updatedAt: new Date('2026-10-01'),
    },
  ];

  const validEmpiricalDataset: EmpiricalOutcomeDataset = {
    modelVersion: '1.2.0-beta',
    trainingDatasetVersion: 'emp-outcomes-2025-q4',
    trainingDateRange: {
      start: '2024-01-01T00:00:00Z',
      end: '2025-12-31T23:59:59Z',
    },
    populationDefinition: 'Indian Engineering Undergraduates (CS/IT) 2024-2025 cohorts',
    comparableSampleSize: 185,
    observedPositiveOutcomes: 28,
    uncertaintyInterval: {
      lower: 0.11,
      upper: 0.19,
      confidenceLevel: 0.95,
    },
    calibrationMetrics: {
      brierScore: 0.138,
      logLoss: 0.382,
      rocAuc: 0.76,
      prAuc: 0.42,
      calibrationError: 0.041,
      validationPopulation: 'Out-of-time test cohort (Spring 2026 offers)',
      evaluationDate: '2026-03-15T00:00:00Z',
      isOutOfTimeValidation: true,
    },
    featureSnapshot: {
      domainRequirementMatch: 'high',
      gpaPercentileBand: 'top_15_percent',
      benchmarkSchoolCategory: 'tier_1_engineering',
    },
    predictionProvenance: {
      pipelineVersion: '2.4.0',
      inputDataHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      calculatedBy: 'CalibratedEmpiricalOutcomeModel',
    },
    knownLimitations: [
      'Historical sample reflects 2024-2025 tech hiring cycle and may differ during macroeconomic hiring contractions.',
      'Does not observe non-public referral chains.',
    ],
    baseRateProbability: 0.151,
  };

  describe('1. Mandatory Insufficiency Guard', () => {
    it('returns exact mandatory string when no empirical dataset exists', () => {
      const result = evaluateProbability({
        opportunity: dummyOpportunity,
        profile: dummyProfile,
        evidenceList: dummyEvidence,
        empiricalDataset: null,
      });

      expect(result.status).toBe('unavailable');
      expect(result.message).toBe(MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE);
      expect(result.message).toBe('Probability unavailable: insufficient comparable outcome data.');
      if (result.status === 'unavailable') {
        expect(result.comparableSampleSize).toBe(0);
        expect(result.minimumRequiredSampleSize).toBe(MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE);
        expect(result.unobservedFactors).toEqual(UNOBSERVED_FACTORS);
      }
    });

    it('rejects calculation when comparable sample size is below minimum threshold (N < 100)', () => {
      const underpoweredDataset: EmpiricalOutcomeDataset = {
        ...validEmpiricalDataset,
        comparableSampleSize: 65, // Below 100
      };

      const result = evaluateProbability({
        opportunity: dummyOpportunity,
        profile: dummyProfile,
        evidenceList: dummyEvidence,
        empiricalDataset: underpoweredDataset,
      });

      expect(result.status).toBe('unavailable');
      expect(result.message).toBe(MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE);
      if (result.status === 'unavailable') {
        expect(result.comparableSampleSize).toBe(65);
        expect(result.reason).toBe('insufficient_comparable_outcomes');
      }
    });

    it('rejects calculation when observed positive outcomes is below minimum (k < 15)', () => {
      const smallPositiveDataset: EmpiricalOutcomeDataset = {
        ...validEmpiricalDataset,
        comparableSampleSize: 120, // Sample size fine
        observedPositiveOutcomes: 7, // Below 15
      };

      const result = evaluateProbability({
        opportunity: dummyOpportunity,
        profile: dummyProfile,
        evidenceList: dummyEvidence,
        empiricalDataset: smallPositiveDataset,
      });

      expect(result.status).toBe('unavailable');
      expect(result.message).toBe(MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE);
      expect(MIN_OBSERVED_POSITIVE_OUTCOMES).toBe(15);
    });

    it('rejects calculation when model Brier score exceeds acceptable calibration threshold (> 0.25)', () => {
      const uncalibratedDataset: EmpiricalOutcomeDataset = {
        ...validEmpiricalDataset,
        calibrationMetrics: {
          ...validEmpiricalDataset.calibrationMetrics,
          brierScore: 0.32, // Exceeds 0.25
        },
      };

      const result = evaluateProbability({
        opportunity: dummyOpportunity,
        profile: dummyProfile,
        evidenceList: dummyEvidence,
        empiricalDataset: uncalibratedDataset,
      });

      expect(result.status).toBe('unavailable');
      if (result.status === 'unavailable') {
        expect(result.reason).toBe('uncalibrated_model');
        expect(result.message).toBe(MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE);
      }
    });
  });

  describe('2. Mandatory Metadata & Provenance Retention', () => {
    it('produces a fully traceable prediction when empirical criteria are met', () => {
      const result = evaluateProbability({
        opportunity: dummyOpportunity,
        profile: dummyProfile,
        evidenceList: dummyEvidence,
        empiricalDataset: validEmpiricalDataset,
      });

      expect(result.status).toBe('calculated');
      if (result.status === 'calculated') {
        expect(result.probability).toBeGreaterThanOrEqual(0);
        expect(result.probability).toBeLessThanOrEqual(1);
        expect(result.probability).toBeCloseTo(0.151, 3);

        // Verify all 13 mandatory metadata fields:
        const { metadata } = result;
        expect(metadata.modelVersion).toBe('1.2.0-beta');
        expect(metadata.trainingDatasetVersion).toBe('emp-outcomes-2025-q4');
        expect(metadata.trainingDateRange.start).toBe('2024-01-01T00:00:00Z');
        expect(metadata.trainingDateRange.end).toBe('2025-12-31T23:59:59Z');
        expect(metadata.predictionDate).toBeDefined();
        expect(metadata.populationDefinition).toBe(
          'Indian Engineering Undergraduates (CS/IT) 2024-2025 cohorts',
        );
        expect(metadata.opportunityRoleContext.roleTitle).toBe('Distributed Systems Intern');
        expect(metadata.opportunityRoleContext.companyName).toBe('Apex Cloud Systems');
        expect(metadata.comparableSampleSize).toBe(185);
        expect(metadata.observedPositiveOutcomes).toBe(28);
        expect(metadata.uncertaintyInterval).toEqual({
          lower: 0.11,
          upper: 0.19,
          confidenceLevel: 0.95,
        });
        expect(metadata.calibrationMetrics.brierScore).toBe(0.138);
        expect(metadata.calibrationMetrics.logLoss).toBe(0.382);
        expect(metadata.calibrationMetrics.isOutOfTimeValidation).toBe(true);
        expect(metadata.featureSnapshot.demonstratedSkillCount).toBe(1); // Only verified skill counted, not claimed!
        expect(metadata.predictionProvenance.inputDataHash).toHaveLength(64); // SHA-256
        expect(metadata.knownLimitations.length).toBeGreaterThan(0);

        // Ethical disclaimer
        expect(result.disclaimer).toBe(PROBABILITY_ETHICAL_DISCLAIMER);
      }
    });

    it('passes comprehensive validation when all mandatory fields are intact', () => {
      const result = evaluateProbability({
        opportunity: dummyOpportunity,
        profile: dummyProfile,
        evidenceList: dummyEvidence,
        empiricalDataset: validEmpiricalDataset,
      });

      const validation = validateProbabilityIntegrity(result);
      expect(validation.isValid).toBe(true);
      expect(validation.violations).toHaveLength(0);
    });
  });

  describe('3. Validation Rule Enforcement & Anti-Fabrication Guards', () => {
    it('flags altered or non-compliant unavailable messages', () => {
      const invalidUnavailable: UnavailableProbabilityPrediction = {
        status: 'unavailable',
        reason: 'insufficient_comparable_outcomes',
        message: 'Prediction coming soon!', // Non-compliant message
        comparableSampleSize: 0,
        minimumRequiredSampleSize: 100,
        unobservedFactors: UNOBSERVED_FACTORS,
        disclaimer: PROBABILITY_ETHICAL_DISCLAIMER,
      };

      const validation = validateProbabilityIntegrity(invalidUnavailable);
      expect(validation.isValid).toBe(false);
      expect(
        validation.violations.some((v) =>
          v.includes('Unavailable prediction message must strictly match'),
        ),
      ).toBe(true);
    });

    it('flags calculated predictions with inverted uncertainty intervals', () => {
      const validResult = evaluateProbability({
        opportunity: dummyOpportunity,
        profile: dummyProfile,
        evidenceList: dummyEvidence,
        empiricalDataset: validEmpiricalDataset,
      }) as CalculatedProbabilityPrediction;

      const invertedIntervalResult: CalculatedProbabilityPrediction = {
        ...validResult,
        metadata: {
          ...validResult.metadata,
          uncertaintyInterval: {
            lower: 0.25,
            upper: 0.1, // Inverted!
            confidenceLevel: 0.95,
          },
        },
      };

      const validation = validateProbabilityIntegrity(invertedIntervalResult);
      expect(validation.isValid).toBe(false);
      expect(
        validation.violations.some((v) =>
          v.includes('uncertaintyInterval lower bound cannot exceed upper bound'),
        ),
      ).toBe(true);
    });

    it('flags predictions missing unobserved factors disclosures', () => {
      const validResult = evaluateProbability({
        opportunity: dummyOpportunity,
        profile: dummyProfile,
        evidenceList: dummyEvidence,
        empiricalDataset: validEmpiricalDataset,
      }) as CalculatedProbabilityPrediction;

      const missingUnobserved: CalculatedProbabilityPrediction = {
        ...validResult,
        unobservedFactors: [], // Empty!
      };

      const validation = validateProbabilityIntegrity(missingUnobserved);
      expect(validation.isValid).toBe(false);
      expect(
        validation.violations.some((v) =>
          v.includes('Prediction must disclose unobserved factors'),
        ),
      ).toBe(true);
    });

    it('strictly separates self-reported claims from demonstrated technical evidence', () => {
      const onlyClaimedEvidence: StudentSkillEvidence[] = [
        {
          id: 'ev-only-claimed',
          studentProfileId: 'prof-test-1',
          skillId: 'skill-python',
          evidenceSource: 'self_reported',
          evidenceLevel: 'claimed',
          title: 'Self-reported Python',
          summary: 'I know Python',
          verificationDetails: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = evaluateProbability({
        opportunity: dummyOpportunity,
        profile: dummyProfile,
        evidenceList: onlyClaimedEvidence,
        empiricalDataset: validEmpiricalDataset,
      });

      if (result.status === 'calculated') {
        expect(result.metadata.featureSnapshot.demonstratedSkillCount).toBe(0);
        expect(result.evidenceTraceability).toHaveLength(1); // Only cohort graduation year, no claimed skills
        expect(result.evidenceTraceability.some((t) => t.factor.includes('skill-python'))).toBe(
          false,
        );
      }
    });
  });

  describe('4. Unobserved Factors & Ethical AI Transparency', () => {
    it('always discloses comprehensive unobserved factors', () => {
      expect(UNOBSERVED_FACTORS).toContain(
        'Live technical interview performance and real-time problem solving under pressure',
      );
      expect(UNOBSERVED_FACTORS).toContain(
        'Behavioral interview dynamics, executive presence, and interpersonal rapport',
      );
      expect(UNOBSERVED_FACTORS).toContain(
        'Internal company referral pathways, employee endorsements, and institutional networks',
      );
      expect(UNOBSERVED_FACTORS).toContain(
        'Non-public applicant pool volume, diversity initiatives, and competitor candidate strengths',
      );
      expect(UNOBSERVED_FACTORS).toContain(
        'Unannounced hiring freezes, internal team reorganizations, or sudden budget reallocations',
      );
    });

    it('prohibits treating target company selection or application bookmarks as evidence of employability', () => {
      expect(PROBABILITY_ETHICAL_DISCLAIMER).toContain(
        'Role Match and Eligibility are distinct metrics and are NOT probabilities',
      );
      expect(PROBABILITY_ETHICAL_DISCLAIMER).toContain('A probability is NEVER a guarantee');
    });
  });
});
