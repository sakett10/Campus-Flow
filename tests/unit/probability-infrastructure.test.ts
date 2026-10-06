import { describe, it, expect } from 'vitest';
import {
  createPredictionSnapshot,
  createOpportunitySnapshot,
  TARGET_DEFINITIONS,
  evaluateTargetOutcome,
  validateTrainingRowLeakage,
  validateDatasetLeakage,
  createDatasetSpecification,
  createPopulationDefinition,
  validatePopulationCompatibility,
  calculateBrierScore,
  calculateLogLoss,
  calculateRocAuc,
  calculatePrAuc,
  calculateExpectedCalibrationError,
  calculateCalibrationSlopeIntercept,
  bootstrapMetricConfidenceInterval,
  evaluateComprehensiveValidation,
  createTemporalSplit,
  createWalkForwardSplits,
  assessModelReadiness,
  PRODUCTION_READINESS_THRESHOLDS,
  generateModelCard,
  canModelBeUsedForProbabilities,
  validateModelApprovalTransition,
} from '@campusflow/shared';
import type {
  PredictionSnapshot,
  OpportunitySnapshot,
  OutcomeTrainingExample,
  ModelRegistryEntry,
  Opportunity,
  StudentCareerProfile,
  StudentSkillEvidence,
  ComprehensiveValidationMetrics,
} from '@campusflow/types';

describe('Data and Validation Infrastructure for Probability Integrity', () => {
  const dummyProfile: StudentCareerProfile = {
    id: 'prof-test-1',
    userId: 'user-test-1',
    targetCareerPath: 'Distributed Systems Engineer',
    targetGeography: ['India', 'Bengaluru'],
    targetRecruitingPeriod: 'Summer 2027',
    degreeLevel: 'bachelors',
    major: 'Computer Science and Engineering',
    university: 'Vellore Institute of Technology',
    graduationYear: 2027,
    graduationMonth: 5,
    currentYearOfStudy: 3,
    isEnrolled: true,
    workAuthorization: 'citizen',
    gpa: '9.10',
    yearsExperience: '1',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };

  const dummyEvidence: StudentSkillEvidence[] = [
    {
      id: 'ev-dist-1',
      studentProfileId: 'prof-test-1',
      skillId: 'skill-rust',
      evidenceSource: 'academic_course',
      evidenceLevel: 'verified',
      confidenceScore: 0.95,
      notes: 'CSE3002 Operating Systems Lab - High Distinction',
      verifiedAt: new Date('2026-09-10T12:00:00Z'),
      createdAt: new Date('2026-09-10T12:00:00Z'),
      updatedAt: new Date('2026-09-10T12:00:00Z'),
    },
  ];

  const dummyOpportunity: Opportunity = {
    id: 'opp-infra-test-1',
    companyId: 'comp-omega-1',
    roleFamilyId: 'rf-swe-1',
    title: 'Systems Infrastructure Intern',
    opportunityType: 'internship',
    targetGraduationYears: [2027],
    degreeLevels: ['bachelors'],
    allowedMajors: ['Computer Science and Engineering'],
    description: 'Kernel and high-performance network engineering.',
    season: 'Summer 2027',
    employmentType: 'full_time',
    workplaceType: 'hybrid',
    status: 'active',
    minGpa: '8.0',
    minExperienceMonths: 0,
    requiresWorkAuth: 'citizen',
    sourceUrl: 'https://careers.omega-corp.example/jobs/infra-intern',
    sourceOrganization: 'Omega Infrastructure Corp',
    retrievalTimestamp: new Date('2026-09-15T08:00:00Z'),
    publicationDate: new Date('2026-09-14T00:00:00Z'),
    expirationDate: null,
    lastValidTimestamp: null,
    extractionVersion: 'v2.1',
    createdAt: new Date('2026-09-15T08:00:00Z'),
    updatedAt: new Date('2026-09-15T08:00:00Z'),
  };

  describe('1. Prediction Snapshots', () => {
    it('creates an immutable snapshot capturing student evidence at prediction time', () => {
      const predictionTime = '2026-09-20T10:00:00.000Z';
      const snapshot = createPredictionSnapshot({
        userId: dummyProfile.userId,
        opportunityId: dummyOpportunity.id,
        snapshotTimestamp: predictionTime,
        profile: dummyProfile,
        skillEvidence: dummyEvidence,
      });

      expect(snapshot.userId).toBe(dummyProfile.userId);
      expect(snapshot.opportunityId).toBe(dummyOpportunity.id);
      expect(snapshot.snapshotTimestamp).toBe(predictionTime);
      expect(snapshot.educationSnapshot.university).toBe('Vellore Institute of Technology');
      expect(snapshot.graduationTiming.graduationYear).toBe(2027);
      expect(snapshot.skillEvidenceSnapshot).toHaveLength(1);
      expect(snapshot.skillEvidenceSnapshot[0]!.skillId).toBe('skill-rust');
      expect(snapshot.contentHash).toBeDefined();
      expect(snapshot.contentHash.length).toBe(64); // SHA-256 hex
    });

    it('generates identical deterministic hashes for identical inputs', () => {
      const snapA = createPredictionSnapshot({
        userId: dummyProfile.userId,
        opportunityId: dummyOpportunity.id,
        snapshotTimestamp: '2026-09-20T10:00:00.000Z',
        profile: dummyProfile,
        skillEvidence: dummyEvidence,
      });

      const snapB = createPredictionSnapshot({
        userId: dummyProfile.userId,
        opportunityId: dummyOpportunity.id,
        snapshotTimestamp: '2026-09-20T10:00:00.000Z',
        profile: dummyProfile,
        skillEvidence: dummyEvidence,
      });

      expect(snapA.contentHash).toBe(snapB.contentHash);
    });

    it('mutations to original objects do not modify historical snapshot values (immutability)', () => {
      const profileCopy = { ...dummyProfile };
      const snapshot = createPredictionSnapshot({
        userId: profileCopy.userId,
        opportunityId: dummyOpportunity.id,
        profile: profileCopy,
        skillEvidence: [...dummyEvidence],
      });

      // Modify the external object after snapshot creation
      profileCopy.gpa = '10.00';
      profileCopy.targetCareerPath = 'Product Manager';

      expect(snapshot.educationSnapshot.gpa).toBe('9.10');
      expect(snapshot.targetContext.targetCareerPath).toBe('Distributed Systems Engineer');
    });
  });

  describe('2. Opportunity Snapshots', () => {
    it('captures company, role, requirements, and provenance at snapshot time', () => {
      const snapshot = createOpportunitySnapshot({
        opportunity: dummyOpportunity,
        company: {
          id: dummyOpportunity.companyId,
          name: 'Omega Infrastructure Corp',
          slug: 'omega-corp',
        },
        roleFamily: {
          id: dummyOpportunity.roleFamilyId,
          name: 'Software Engineering',
          slug: 'swe',
        },
        requiredSkills: [
          {
            skillId: 'skill-rust',
            requirementType: 'must_have',
            importanceWeight: '1.0',
            minProficiency: 'intermediate',
          },
        ],
        preferredSkills: [],
        programRules: [],
        locations: [
          {
            city: 'Bengaluru',
            stateProvince: 'Karnataka',
            country: 'India',
            isRemote: false,
          },
        ],
      });

      expect(snapshot.company.name).toBe('Omega Infrastructure Corp');
      expect(snapshot.role.title).toBe('Systems Infrastructure Intern');
      expect(snapshot.eligibilityRules.targetGraduationYears).toContain(2027);
      expect(snapshot.sourceProvenance.sourceUrl).toBe(
        'https://careers.omega-corp.example/jobs/infra-intern',
      );
      expect(snapshot.contentHash).toBeDefined();
    });

    it('subsequent edits to job posting do not modify historical snapshot content hash', () => {
      const snapshot = createOpportunitySnapshot({
        opportunity: dummyOpportunity,
        company: { id: 'c1', name: 'Omega', slug: 'omega' },
        roleFamily: { id: 'rf1', name: 'SWE' },
      });

      const initialHash = snapshot.contentHash;

      // Simulated subsequent change to the job posting
      const modifiedOpp = {
        ...dummyOpportunity,
        title: 'Senior Staff Infrastructure Engineer',
        minExperienceMonths: 60,
      };

      const subsequentSnapshot = createOpportunitySnapshot({
        opportunity: modifiedOpp,
        company: { id: 'c1', name: 'Omega', slug: 'omega' },
        roleFamily: { id: 'rf1', name: 'SWE' },
      });

      expect(snapshot.contentHash).toBe(initialHash);
      expect(snapshot.role.title).toBe('Systems Infrastructure Intern');
      expect(subsequentSnapshot.contentHash).not.toBe(initialHash);
    });
  });

  describe('3 & 4. Outcome Dataset & Target Definitions', () => {
    it('defines all 5 standardized targets with strict observation windows and censoring rules', () => {
      const targetKeys = Object.keys(TARGET_DEFINITIONS);
      expect(targetKeys).toEqual([
        'application_to_assessment',
        'assessment_to_interview',
        'interview_to_final',
        'final_to_offer',
        'application_to_offer',
      ]);

      const appToOffer = TARGET_DEFINITIONS['application_to_offer'];
      expect(appToOffer.observationWindowDays).toBe(120);
      expect(appToOffer.missingOutcomeBehavior).toBe('treat_as_censored');
    });

    it('strictly does not treat missing outcomes as rejection (censored = targetLabel: null)', () => {
      const appTime = '2026-08-01T00:00:00.000Z';
      const targetDef = TARGET_DEFINITIONS['application_to_offer'];

      // Scenario A: Candidate received offer within window -> positive outcome
      const offerOutcome = evaluateTargetOutcome(
        targetDef,
        appTime,
        'offer_received',
        '2026-09-01T00:00:00.000Z',
      );
      expect(offerOutcome.isSuccess).toBe(true);
      expect(offerOutcome.isCensored).toBe(false);
      expect(offerOutcome.targetLabel).toBe(1);

      // Scenario B: Candidate rejected within window -> negative outcome
      const rejectOutcome = evaluateTargetOutcome(
        targetDef,
        appTime,
        'rejected',
        '2026-08-20T00:00:00.000Z',
      );
      expect(rejectOutcome.isSuccess).toBe(false);
      expect(rejectOutcome.isCensored).toBe(false);
      expect(rejectOutcome.targetLabel).toBe(0);

      // Scenario C: Outcome missing / still in progress -> CENSORED, NOT REJECTED!
      const missingOutcome = evaluateTargetOutcome(targetDef, appTime, null, null);
      expect(missingOutcome.isSuccess).toBe(false);
      expect(missingOutcome.isCensored).toBe(true);
      expect(missingOutcome.targetLabel).toBeNull(); // Crucial: must never be 0 (rejection)
    });

    it('censors events that occur beyond the target observation window', () => {
      const appTime = '2026-01-01T00:00:00.000Z';
      const targetDef = TARGET_DEFINITIONS['application_to_assessment']; // 30 day window

      // Assessment received after 45 days
      const lateAssessment = evaluateTargetOutcome(
        targetDef,
        appTime,
        'assessment_received',
        '2026-02-15T00:00:00.000Z',
      );
      expect(lateAssessment.isCensored).toBe(true);
      expect(lateAssessment.targetLabel).toBeNull();
    });
  });

  describe('5. Data Leakage Prevention', () => {
    const validPredictionSnapshot: PredictionSnapshot = {
      id: 'pred-snap-1',
      userId: 'user-1',
      opportunityId: 'opp-1',
      snapshotTimestamp: '2026-09-10T10:00:00.000Z',
      educationSnapshot: {
        degreeLevel: 'bachelors',
        major: 'CS',
        university: 'VIT',
        currentYearOfStudy: 3,
        gpa: '9.0',
        isEnrolled: true,
        workAuthorization: 'citizen',
      },
      graduationTiming: { graduationYear: 2027, graduationMonth: 5 },
      academicEvidenceSnapshot: [],
      skillEvidenceSnapshot: [
        {
          id: 'ev-1',
          skillId: 's1',
          evidenceLevel: 'verified',
          evidenceSource: 'academic_course',
          confidenceScore: 0.9,
          title: 'Course evidence',
          verifiedAt: '2026-09-08T00:00:00.000Z', // Before prediction
        },
      ],
      projectEvidenceSnapshot: [],
      experienceSnapshot: { yearsExperience: '0' },
      targetContext: { targetGeography: ['India'] },
      contentHash: 'hash1',
      createdAt: '2026-09-10T10:00:00.000Z',
    };

    const validOpportunitySnapshot: OpportunitySnapshot = {
      id: 'opp-snap-1',
      opportunityId: 'opp-1',
      snapshotTimestamp: '2026-09-10T10:00:00.000Z',
      company: { id: 'c1', name: 'Omega', slug: 'omega' },
      role: {
        title: 'SWE Intern',
        opportunityType: 'internship',
        season: 'Summer 2027',
        employmentType: 'full_time',
        workplaceType: 'remote',
      },
      roleFamily: { id: 'rf1', name: 'Software' },
      eligibilityRules: {
        targetGraduationYears: [2027],
        degreeLevels: ['bachelors'],
        allowedMajors: ['CS'],
        minGpa: null,
        requiresWorkAuth: 'any',
      },
      requiredSkills: [],
      preferredSkills: [],
      programRules: [],
      sourceProvenance: {
        sourceUrl: 'https://careers.example.com',
        sourceOrganization: 'Omega',
        retrievalTimestamp: '2026-09-09T00:00:00.000Z', // Before prediction
        extractionVersion: 'v1.0',
      },
      contentHash: 'opphash1',
      createdAt: '2026-09-10T10:00:00.000Z',
    };

    it('accepts valid training rows with no future features or leakage', () => {
      const check = validateTrainingRowLeakage({
        predictionSnapshot: validPredictionSnapshot,
        opportunitySnapshot: validOpportunitySnapshot,
        applicationTimestamp: '2026-09-12T00:00:00.000Z',
        features: { verifiedSkillCount: 5, courseGpa: 9.0 },
      });
      expect(check.hasLeakage).toBe(false);
      expect(check.violations).toHaveLength(0);
    });

    it('rejects rows where student evidence was verified AFTER prediction timestamp', () => {
      const leakyPredictionSnapshot: PredictionSnapshot = {
        ...validPredictionSnapshot,
        skillEvidenceSnapshot: [
          {
            id: 'ev-leaky',
            skillId: 's1',
            evidenceLevel: 'verified',
            evidenceSource: 'academic_course',
            confidenceScore: 0.9,
            title: 'Future Evidence',
            verifiedAt: '2026-09-15T00:00:00.000Z', // 5 days AFTER snapshot time of 2026-09-10
          },
        ],
      };

      const check = validateTrainingRowLeakage({
        predictionSnapshot: leakyPredictionSnapshot,
        opportunitySnapshot: validOpportunitySnapshot,
        applicationTimestamp: '2026-09-12T00:00:00.000Z',
        features: { verifiedSkillCount: 5 },
      });
      expect(check.hasLeakage).toBe(true);
      expect(check.violations.some((v) => v.includes('Evidence leakage'))).toBe(true);
    });

    it('rejects rows where opportunity was updated after prediction snapshot time', () => {
      const lateOpportunitySnapshot: OpportunitySnapshot = {
        ...validOpportunitySnapshot,
        sourceProvenance: {
          ...validOpportunitySnapshot.sourceProvenance,
          retrievalTimestamp: '2026-09-18T00:00:00.000Z', // AFTER prediction timestamp of 2026-09-10
        },
      };

      const check = validateTrainingRowLeakage({
        predictionSnapshot: validPredictionSnapshot,
        opportunitySnapshot: lateOpportunitySnapshot,
        applicationTimestamp: '2026-09-12T00:00:00.000Z',
        features: { verifiedSkillCount: 5 },
      });
      expect(check.hasLeakage).toBe(true);
      expect(check.violations.some((v) => v.includes('Opportunity requirements leakage'))).toBe(
        true,
      );
    });

    it('rejects rows where outcome indicators leak into feature keys or values', () => {
      const check = validateTrainingRowLeakage({
        predictionSnapshot: validPredictionSnapshot,
        opportunitySnapshot: validOpportunitySnapshot,
        applicationTimestamp: '2026-09-12T00:00:00.000Z',
        features: {
          verifiedSkillCount: 5,
          offer_received: true, // Forbidden target leakage!
        },
      });
      expect(check.hasLeakage).toBe(true);
      expect(check.violations.some((v) => v.includes('Target outcome leakage'))).toBe(true);
    });

    it('dataset leakage validator catches duplicate applications', () => {
      const rowA = {
        predictionSnapshot: validPredictionSnapshot,
        opportunitySnapshot: validOpportunitySnapshot,
        applicationTimestamp: '2026-09-12T00:00:00.000Z',
        features: { verifiedSkillCount: 5 },
      };
      const rowB = {
        predictionSnapshot: validPredictionSnapshot,
        opportunitySnapshot: validOpportunitySnapshot,
        applicationTimestamp: '2026-09-12T00:00:00.000Z',
        features: { verifiedSkillCount: 5 },
      };

      const datasetCheck = validateDatasetLeakage([rowA, rowB]);

      expect(datasetCheck.isValid).toBe(false);
      expect(datasetCheck.duplicateCount).toBe(1);
    });
  });

  describe('6. Deterministic Dataset Versioning', () => {
    it('generates reproducible specification and specification hash', () => {
      const pop = createPopulationDefinition({
        country: 'India',
        roleFamily: 'Software Engineering',
        roleType: 'Intern',
        graduationCohort: 2027,
      });

      const examples: OutcomeTrainingExample[] = [
        {
          id: 'ex-1',
          predictionSnapshotId: 'ps-1',
          opportunitySnapshotId: 'os-1',
          applicationTimestamp: '2026-09-10T00:00:00.000Z',
          outcomeTimestamp: '2026-10-01T00:00:00.000Z',
          stageTransitions: [],
          finalOutcome: 'offer_received',
          targetLabel: 1,
          outcomeHorizonDays: 21,
          roleFamily: 'SWE',
          company: 'Omega',
          geography: 'India',
          graduationCohort: 2027,
          features: { gpa: 9.0, verifiedSkills: 4 },
        },
        {
          id: 'ex-2',
          predictionSnapshotId: 'ps-2',
          opportunitySnapshotId: 'os-2',
          applicationTimestamp: '2026-09-11T00:00:00.000Z',
          outcomeTimestamp: '2026-10-05T00:00:00.000Z',
          stageTransitions: [],
          finalOutcome: 'rejected',
          targetLabel: 0,
          outcomeHorizonDays: 24,
          roleFamily: 'SWE',
          company: 'Omega',
          geography: 'India',
          graduationCohort: 2027,
          features: { gpa: 8.5, verifiedSkills: null },
        },
      ];

      const specA = createDatasetSpecification({
        target: 'application_to_offer',
        sourcePopulation: pop,
        examples,
        featureSchema: { gpa: 'number', verifiedSkills: 'number' },
        datasetVersion: 'v1.0.0',
        featureData: [
          { gpa: 9.0, verifiedSkills: 4 },
          { gpa: 8.5, verifiedSkills: null },
        ],
      });

      const specB = createDatasetSpecification({
        target: 'application_to_offer',
        sourcePopulation: pop,
        examples,
        featureSchema: { gpa: 'number', verifiedSkills: 'number' },
        datasetVersion: 'v1.0.0',
        featureData: [
          { gpa: 9.0, verifiedSkills: 4 },
          { gpa: 8.5, verifiedSkills: null },
        ],
      });

      expect(specA.specificationHash).toBe(specB.specificationHash);
      expect(specA.totalRows).toBe(2);
      expect(specA.positiveOutcomes).toBe(1);
      expect(specA.negativeOutcomes).toBe(1);
      expect(specA.missingDataSummary['verifiedSkills']).toBe(0.5);
    });
  });

  describe('7. Explicit Population Definitions', () => {
    it('enforces explicit population declaration and blocks silent cross-cohort or cross-country mixing', () => {
      const popIndia2027 = createPopulationDefinition({
        country: 'India',
        roleFamily: 'Software Engineering',
        roleType: 'Intern',
        graduationCohort: 2027,
      });

      const popIndia2028 = createPopulationDefinition({
        country: 'India',
        roleFamily: 'Software Engineering',
        roleType: 'Intern',
        graduationCohort: 2028,
      });

      const popUS2027 = createPopulationDefinition({
        country: 'United States',
        roleFamily: 'Software Engineering',
        roleType: 'Intern',
        graduationCohort: 2027,
      });

      // Same population is compatible
      expect(validatePopulationCompatibility(popIndia2027, popIndia2027).compatible).toBe(true);

      // Mismatched cohort is rejected
      const cohortCompat = validatePopulationCompatibility(popIndia2027, popIndia2028);
      expect(cohortCompat.compatible).toBe(false);
      expect(cohortCompat.mismatchReasons.some((r) => r.includes('cohort mismatch'))).toBe(true);

      // Mismatched country is rejected
      const countryCompat = validatePopulationCompatibility(popIndia2027, popUS2027);
      expect(countryCompat.compatible).toBe(false);
      expect(countryCompat.mismatchReasons.some((r) => r.includes('Country mismatch'))).toBe(true);
    });
  });

  describe('8. Validation Infrastructure (Discrimination & Calibration)', () => {
    it('calculates Brier score, log loss, ROC-AUC, PR-AUC, ECE, and calibration slope/intercept', () => {
      // Correct param order: predictions first, outcomes second
      const yProb = [0.9, 0.8, 0.85, 0.7, 0.1, 0.2, 0.3, 0.15];
      const yTrue: (0 | 1)[] = [1, 1, 1, 1, 0, 0, 0, 0];

      const brier = calculateBrierScore(yProb, yTrue);
      expect(brier).toBeLessThan(0.08); // Very well calibrated

      const logLoss = calculateLogLoss(yProb, yTrue);
      expect(logLoss).toBeLessThan(0.35);

      const rocAuc = calculateRocAuc(yProb, yTrue);
      expect(rocAuc).toBe(1.0); // Perfect discrimination

      const prAuc = calculatePrAuc(yProb, yTrue);
      expect(prAuc).toBeCloseTo(1.0, 1);

      const ece = calculateExpectedCalibrationError(yProb, yTrue, 4);
      expect(ece.ece).toBeLessThan(0.25);
      expect(ece.bins).toHaveLength(4);

      const slopeIntercept = calculateCalibrationSlopeIntercept(yProb, yTrue);
      expect(slopeIntercept.slope).toBeGreaterThan(0);

      const ci = bootstrapMetricConfidenceInterval(yProb, yTrue, calculateBrierScore, 50);
      expect(ci.lower).toBeLessThanOrEqual(ci.pointEstimate);
      expect(ci.upper).toBeGreaterThanOrEqual(ci.pointEstimate);
    });

    it('evaluates comprehensive validation metrics across discrimination and calibration', () => {
      const yProb = [0.6, 0.4, 0.7, 0.3, 0.65, 0.35];
      const yTrue: (0 | 1)[] = [1, 0, 1, 0, 1, 0];

      const results = evaluateComprehensiveValidation({
        predictions: yProb,
        outcomes: yTrue,
        validationType: 'temporal_out_of_time',
      });

      expect(results.brierScore).toBeDefined();
      expect(results.expectedCalibrationError).toBeDefined();
      expect(results.calibrationSlope).toBeDefined();
      expect(results.rocAuc).toBeDefined();
      expect(results.prAuc).toBeDefined();
    });
  });

  describe('9. Temporal Validation', () => {
    it('creates strict out-of-time splits preventing random train/test leakage', () => {
      const records = [
        { id: '1', applicationTimestamp: '2025-06-01T00:00:00.000Z' },
        { id: '2', applicationTimestamp: '2025-11-01T00:00:00.000Z' },
        { id: '3', applicationTimestamp: '2026-03-01T00:00:00.000Z' },
        { id: '4', applicationTimestamp: '2026-09-01T00:00:00.000Z' },
        { id: '5', applicationTimestamp: '2027-02-01T00:00:00.000Z' },
        { id: '6', applicationTimestamp: '2027-08-01T00:00:00.000Z' },
      ];

      const split = createTemporalSplit(records, {
        trainEnd: '2026-01-01T00:00:00.000Z',
        validationStart: '2026-01-02T00:00:00.000Z',
        validationEnd: '2027-01-01T00:00:00.000Z',
        testStart: '2027-01-02T00:00:00.000Z',
        testEnd: '2028-01-01T00:00:00.000Z',
      });

      expect(split.train.map((r) => r.id)).toEqual(['1', '2']);
      expect(split.validation.map((r) => r.id)).toEqual(['3', '4']);
      expect(split.test.map((r) => r.id)).toEqual(['5', '6']);
    });

    it('generates walk-forward rolling splits as dataset grows', () => {
      const records = [
        { id: '1', applicationTimestamp: '2025-01-01T00:00:00.000Z' },
        { id: '2', applicationTimestamp: '2025-06-01T00:00:00.000Z' },
        { id: '3', applicationTimestamp: '2026-01-01T00:00:00.000Z' },
        { id: '4', applicationTimestamp: '2026-06-01T00:00:00.000Z' },
      ];

      const windows = createWalkForwardSplits(records, {
        trainWindowDays: 180,
        testWindowDays: 90,
        stepDays: 90,
      });

      expect(windows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('10. 10-Point Model Readiness Gate', () => {
    it('documents all production thresholds and their rationales', () => {
      expect(PRODUCTION_READINESS_THRESHOLDS.MIN_SAMPLE_SIZE).toBe(100);
      expect(PRODUCTION_READINESS_THRESHOLDS.MAX_BRIER_SCORE).toBe(0.25);
      expect(PRODUCTION_READINESS_THRESHOLDS.MAX_EXPECTED_CALIBRATION_ERROR).toBe(0.1);
    });

    const mockPassingMetrics: ComprehensiveValidationMetrics = {
      brierScore: 0.18,
      logLoss: 0.45,
      rocAuc: 0.76,
      prAuc: 0.45,
      expectedCalibrationError: 0.08,
      calibrationSlope: 0.98,
      calibrationIntercept: 0.02,
      calibrationBins: [],
      confidenceIntervals: {
        brierScore: { lower: 0.15, upper: 0.21, pointEstimate: 0.18, confidenceLevel: 0.95 },
        rocAuc: { lower: 0.7, upper: 0.82, pointEstimate: 0.76, confidenceLevel: 0.95 },
        prAuc: { lower: 0.38, upper: 0.52, pointEstimate: 0.45, confidenceLevel: 0.95 },
      },
      validationType: 'temporal_out_of_time',
      evaluationDate: '2026-10-01T00:00:00.000Z',
      sampleSize: 250,
      positiveEvents: 35,
    };

    it('approves a model that satisfies all 10 production criteria', () => {
      const assessment = assessModelReadiness({
        modelVersion: 'v1.0.0',
        target: 'application_to_offer',
        metrics: mockPassingMetrics,
        sampleSize: 250,
        positiveEvents: 35,
        leakageViolationsCount: 0,
        maxMissingRate: 0.05,
        isTemporalOutOfTime: true,
        predictionIntervalCoverageRate: 0.94,
        driftMetric: 0.05,
        cohortCount: 1,
      });

      expect(assessment.overallReady).toBe(true);
      expect(assessment.blockingReasons).toHaveLength(0);
      expect(Object.keys(assessment.checks)).toHaveLength(10);
    });

    it('strictly rejects models failing critical checks (e.g. data leakage, small sample, high ECE)', () => {
      const leakyAssessment = assessModelReadiness({
        modelVersion: 'v1.0.0',
        target: 'application_to_offer',
        metrics: mockPassingMetrics,
        sampleSize: 250,
        positiveEvents: 35,
        leakageViolationsCount: 3, // Leakage detected!
        maxMissingRate: 0.05,
        isTemporalOutOfTime: true,
        predictionIntervalCoverageRate: 0.94,
        driftMetric: 0.05,
        cohortCount: 1,
      });

      expect(leakyAssessment.overallReady).toBe(false);
      expect(leakyAssessment.checks.leakageStatus.passed).toBe(false);
    });
  });

  describe('11 & 12. Model Registry & Model Cards', () => {
    const approvedModel: ModelRegistryEntry = {
      id: 'reg-swe-v1',
      modelVersion: 'v1.0.0',
      target: 'application_to_offer',
      population: {
        country: 'India',
        roleFamily: 'Software Engineering',
        roleType: 'Intern',
        graduationCohort: 2027,
        formatted: 'India | Software Engineering Intern | Class of 2027',
      },
      datasetVersion: 'ds-v1.0.0',
      featureSchemaVersion: 'schema-v1',
      algorithm: 'Regularized Logistic Calibration Engine',
      hyperparameters: { c: 1.0, penalty: 'l2' },
      trainingPeriod: { start: '2025-01-01', end: '2026-06-30' },
      validationPeriod: { start: '2026-07-01', end: '2026-12-31' },
      testPeriod: { start: '2027-01-01', end: '2027-06-30' },
      metrics: { rocAuc: 0.75, brierScore: 0.18, prAuc: 0.42 },
      calibrationResults: {
        ece: 0.07,
        brierScore: 0.18,
        slope: 0.98,
        intercept: 0.02,
        bins: [],
      },
      limitations: ['Limited to campus-recorded applicant outcomes'],
      approvalStatus: 'approved',
      createdTimestamp: '2026-09-01T00:00:00Z',
      approvedTimestamp: '2026-09-05T00:00:00Z',
      approvedBy: 'lead-statistician@campusflow.internal',
    };

    it('prohibits referencing unapproved or draft models for probabilities', () => {
      expect(canModelBeUsedForProbabilities(approvedModel).allowed).toBe(true);

      const draftModel: ModelRegistryEntry = {
        ...approvedModel,
        approvalStatus: 'draft',
        approvedTimestamp: null,
      };
      expect(canModelBeUsedForProbabilities(draftModel).allowed).toBe(false);

      const rejectedModel: ModelRegistryEntry = {
        ...approvedModel,
        approvalStatus: 'rejected',
      };
      expect(canModelBeUsedForProbabilities(rejectedModel).allowed).toBe(false);
    });

    it('generates a machine-readable and user-viewable Model Card', () => {
      const card = generateModelCard({ entry: approvedModel });
      expect(card.modelVersion).toBe('v1.0.0');
      expect(card.purpose).toContain('empirical estimate');
      expect(card.targetPopulation).toContain('India');
      expect(card.metrics['rocAuc']).toBe(0.75);
      expect(card.knownMissingVariables.length).toBeGreaterThan(0);
      expect(card.appropriateInterpretation).toContain('educational planning diagnostic');
      expect(card.inappropriateInterpretation).toContain('guarantee');
    });

    it('validates state transitions and requires approval notes and passed assessment', () => {
      const invalidTransition = validateModelApprovalTransition({
        currentStatus: 'draft',
        newStatus: 'approved',
        assessment: undefined, // Missing assessment
      });
      expect(invalidTransition.valid).toBe(false);

      const readyAssessment = assessModelReadiness({
        modelVersion: 'v1.0.0',
        target: 'application_to_offer',
        metrics: {
          brierScore: 0.18,
          logLoss: 0.45,
          rocAuc: 0.76,
          prAuc: 0.45,
          expectedCalibrationError: 0.08,
          calibrationSlope: 0.98,
          calibrationIntercept: 0.02,
          calibrationBins: [],
          confidenceIntervals: {
            brierScore: { lower: 0.15, upper: 0.21, pointEstimate: 0.18, confidenceLevel: 0.95 },
            rocAuc: { lower: 0.7, upper: 0.82, pointEstimate: 0.76, confidenceLevel: 0.95 },
            prAuc: { lower: 0.38, upper: 0.52, pointEstimate: 0.45, confidenceLevel: 0.95 },
          },
          validationType: 'temporal_out_of_time',
          evaluationDate: '2026-10-01T00:00:00.000Z',
          sampleSize: 250,
          positiveEvents: 35,
        },
        sampleSize: 250,
        positiveEvents: 35,
        leakageViolationsCount: 0,
        maxMissingRate: 0.05,
        isTemporalOutOfTime: true,
      });

      const validTransition = validateModelApprovalTransition({
        currentStatus: 'draft',
        newStatus: 'approved',
        assessment: readyAssessment,
      });
      expect(validTransition.valid).toBe(true);
    });
  });
});
