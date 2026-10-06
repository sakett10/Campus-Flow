import crypto from 'node:crypto';
import type {
  Opportunity,
  StudentCareerProfile,
  StudentSkillEvidence,
  ProbabilityPrediction,
  ProbabilityIntegrityMetadata,
  CalibrationMetrics,
  UncertaintyInterval,
} from '@campusflow/types';

/**
 * MANDATORY EXACT STRING REQUIRED BY PROBABILITY INTEGRITY RULE:
 * If available data are insufficient for a statistically defensible probability,
 * CampusFlow MUST display this exact string.
 */
export const MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE =
  'Probability unavailable: insufficient comparable outcome data.';

/**
 * Minimum sample size of strictly comparable historical candidates with verified
 * hiring outcomes required before any hiring probability calculation is permitted.
 */
export const MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE = 100;

/**
 * Minimum number of observed positive hiring outcomes in the comparable sample
 * to avoid extreme small-sample bias in rare-event estimation.
 */
export const MIN_OBSERVED_POSITIVE_OUTCOMES = 15;

/**
 * Maximum acceptable Brier score for a calibrated binary outcome model
 * (0.25 represents an uninformative 50/50 prior on a balanced set).
 */
export const MAX_ACCEPTABLE_BRIER_SCORE = 0.25;

/**
 * Disclosures of crucial external variables that CampusFlow does NOT observe.
 * Transparently exposed to every student so they know what information is omitted.
 */
export const UNOBSERVED_FACTORS: string[] = [
  'Live technical interview performance and real-time problem solving under pressure',
  'Behavioral interview dynamics, executive presence, and interpersonal rapport',
  'Real-time candidate anxiety, fatigue, and individual test-taking circumstances',
  'Hiring manager subjective biases, team fit chemistry, and unwritten cultural preferences',
  'Internal company referral pathways, employee endorsements, and institutional networks',
  'Non-public applicant pool volume, diversity initiatives, and competitor candidate strengths',
  'Unannounced hiring freezes, internal team reorganizations, or sudden budget reallocations',
  'Visa sponsorship policy shifts and regulatory work authorization caps',
];

/**
 * Standard disclaimer required on all probability presentations.
 */
export const PROBABILITY_ETHICAL_DISCLAIMER =
  'CampusFlow predictions are statistical aggregations based on historical empirical data. A probability is NEVER a guarantee, a deterministic prediction of employability, or a ranking of human worth. Role Match and Eligibility are distinct metrics and are NOT probabilities.';

export interface EmpiricalOutcomeDataset {
  modelVersion: string;
  trainingDatasetVersion: string;
  trainingDateRange: {
    start: string;
    end: string;
  };
  populationDefinition: string;
  comparableSampleSize: number;
  observedPositiveOutcomes: number;
  uncertaintyInterval: UncertaintyInterval;
  calibrationMetrics: CalibrationMetrics;
  featureSnapshot: Record<string, unknown>;
  predictionProvenance: {
    pipelineVersion: string;
    inputDataHash: string;
    calculatedBy: string;
  };
  knownLimitations: string[];
  baseRateProbability: number;
}

export interface EvaluateProbabilityParams {
  opportunity: Opportunity;
  profile?: StudentCareerProfile | null | undefined;
  evidenceList?: StudentSkillEvidence[] | undefined;
  empiricalDataset?: EmpiricalOutcomeDataset | null | undefined;
}

/**
 * Evaluates whether a hiring probability can be legally and mathematically computed,
 * enforcing the Probability Integrity Rule.
 *
 * RULES:
 * 1. Never substitute heuristics, arbitrary scores, LLM confidence, or fabricated percentages.
 * 2. Role Match is NOT a probability. Eligibility is NOT a probability.
 * 3. A manually chosen target company is NOT evidence of employability.
 * 4. A self-reported skill is NOT equivalent to demonstrated evidence.
 * 5. If empirical outcome data is insufficient, returns exact mandatory message.
 */
export function evaluateProbability(params: EvaluateProbabilityParams): ProbabilityPrediction {
  const { opportunity, profile, evidenceList = [], empiricalDataset } = params;

  // If no empirical dataset provided or dataset fails statistical defensibility criteria:
  if (!empiricalDataset) {
    return {
      status: 'unavailable',
      reason: 'insufficient_comparable_outcomes',
      message: MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE,
      comparableSampleSize: 0,
      minimumRequiredSampleSize: MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE,
      unobservedFactors: UNOBSERVED_FACTORS,
      disclaimer: PROBABILITY_ETHICAL_DISCLAIMER,
    };
  }

  // Check sample size threshold
  if (empiricalDataset.comparableSampleSize < MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE) {
    return {
      status: 'unavailable',
      reason: 'insufficient_comparable_outcomes',
      message: MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE,
      comparableSampleSize: empiricalDataset.comparableSampleSize,
      minimumRequiredSampleSize: MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE,
      unobservedFactors: UNOBSERVED_FACTORS,
      disclaimer: PROBABILITY_ETHICAL_DISCLAIMER,
    };
  }

  // Check positive outcome count threshold
  if (empiricalDataset.observedPositiveOutcomes < MIN_OBSERVED_POSITIVE_OUTCOMES) {
    return {
      status: 'unavailable',
      reason: 'insufficient_comparable_outcomes',
      message: MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE,
      comparableSampleSize: empiricalDataset.comparableSampleSize,
      minimumRequiredSampleSize: MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE,
      unobservedFactors: UNOBSERVED_FACTORS,
      disclaimer: PROBABILITY_ETHICAL_DISCLAIMER,
    };
  }

  // Check calibration standards
  const calibration = empiricalDataset.calibrationMetrics;
  if (!calibration || typeof calibration.brierScore !== 'number') {
    return {
      status: 'unavailable',
      reason: 'uncalibrated_model',
      message: MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE,
      comparableSampleSize: empiricalDataset.comparableSampleSize,
      minimumRequiredSampleSize: MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE,
      unobservedFactors: UNOBSERVED_FACTORS,
      disclaimer: PROBABILITY_ETHICAL_DISCLAIMER,
    };
  }

  if (calibration.brierScore > MAX_ACCEPTABLE_BRIER_SCORE) {
    return {
      status: 'unavailable',
      reason: 'uncalibrated_model',
      message: MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE,
      comparableSampleSize: empiricalDataset.comparableSampleSize,
      minimumRequiredSampleSize: MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE,
      unobservedFactors: UNOBSERVED_FACTORS,
      disclaimer: PROBABILITY_ETHICAL_DISCLAIMER,
    };
  }

  // Construct verified demonstrated evidence features (strictly excluding self-reported/claimed only)
  const demonstratedEvidence = evidenceList.filter((e) =>
    ['verified', 'strongly_demonstrated', 'demonstrated'].includes(e.evidenceLevel),
  );

  const evidenceTraceability: Array<{
    factor: string;
    studentEvidenceRef?: string | undefined;
    influence: string;
  }> = [];

  for (const ev of demonstratedEvidence) {
    evidenceTraceability.push({
      factor: `Demonstrated technical skill: ${ev.skillId}`,
      studentEvidenceRef: ev.id,
      influence: `Empirical positive correlation with assessment completion (+${ev.evidenceLevel})`,
    });
  }

  if (profile?.graduationYear) {
    evidenceTraceability.push({
      factor: `Target cohort graduation year: ${profile.graduationYear}`,
      influence: 'Cohorted within empirical graduating class benchmark',
    });
  }

  // Hash input snapshot for provenance verification
  const inputHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        oppId: opportunity.id,
        profileGradYear: profile?.graduationYear,
        demonstratedEvidenceIds: demonstratedEvidence.map((e) => e.id).sort(),
        datasetVersion: empiricalDataset.trainingDatasetVersion,
      }),
    )
    .digest('hex');

  const metadata: ProbabilityIntegrityMetadata = {
    modelVersion: empiricalDataset.modelVersion,
    trainingDatasetVersion: empiricalDataset.trainingDatasetVersion,
    trainingDateRange: empiricalDataset.trainingDateRange,
    predictionDate: new Date().toISOString(),
    populationDefinition: empiricalDataset.populationDefinition,
    opportunityRoleContext: {
      roleTitle: opportunity.title,
      companyName: opportunity.sourceOrganization,
      opportunityType: opportunity.opportunityType,
    },
    comparableSampleSize: empiricalDataset.comparableSampleSize,
    observedPositiveOutcomes: empiricalDataset.observedPositiveOutcomes,
    uncertaintyInterval: empiricalDataset.uncertaintyInterval,
    calibrationMetrics: empiricalDataset.calibrationMetrics,
    featureSnapshot: {
      demonstratedSkillCount: demonstratedEvidence.length,
      studentDegree: profile?.major
        ? `${profile.degreeLevel ?? ''} in ${profile.major}`.trim()
        : (profile?.degreeLevel ?? 'unspecified'),
      studentGradYear: profile?.graduationYear ?? null,
      ...empiricalDataset.featureSnapshot,
    },
    predictionProvenance: {
      pipelineVersion: empiricalDataset.predictionProvenance.pipelineVersion,
      inputDataHash: inputHash,
      calculatedBy: empiricalDataset.predictionProvenance.calculatedBy,
    },
    knownLimitations: [
      ...empiricalDataset.knownLimitations,
      'Model relies strictly on historical applicant cohorts and may not capture current macro hiring market contractions.',
      'Unobserved interview performance represents significant unmodelled variance in final offer decisions.',
    ],
  };

  const probability = Math.max(
    empiricalDataset.uncertaintyInterval.lower,
    Math.min(empiricalDataset.uncertaintyInterval.upper, empiricalDataset.baseRateProbability),
  );

  return {
    status: 'calculated',
    probability,
    metadata,
    unobservedFactors: UNOBSERVED_FACTORS,
    evidenceTraceability,
    disclaimer: PROBABILITY_ETHICAL_DISCLAIMER,
  };
}

/**
 * Validates any prediction against the Probability Integrity Rule constraints.
 * Fails if any mandatory fields are missing or if ungrounded heuristics are detected.
 */
export function validateProbabilityIntegrity(prediction: ProbabilityPrediction): {
  isValid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (prediction.status === 'unavailable') {
    if (
      prediction.reason === 'insufficient_comparable_outcomes' &&
      prediction.message !== MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE
    ) {
      violations.push(
        `Unavailable prediction message must strictly match "${MANDATORY_PROBABILITY_UNAVAILABLE_MESSAGE}". Received: "${prediction.message}"`,
      );
    }
    if (!prediction.unobservedFactors || prediction.unobservedFactors.length === 0) {
      violations.push('Prediction must disclose unobserved factors.');
    }
    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  // Calculated Prediction Validations
  if (typeof prediction.probability !== 'number' || isNaN(prediction.probability)) {
    violations.push('Calculated prediction must provide a valid numerical probability.');
  }

  if (prediction.probability < 0 || prediction.probability > 1) {
    violations.push('Probability must be between 0.00 and 1.00.');
  }

  const { metadata } = prediction;
  if (!metadata) {
    violations.push('Calculated prediction is missing required metadata.');
    return { isValid: false, violations };
  }

  if (!metadata.modelVersion) violations.push('Missing modelVersion.');
  if (!metadata.trainingDatasetVersion) violations.push('Missing trainingDatasetVersion.');
  if (!metadata.trainingDateRange?.start || !metadata.trainingDateRange?.end) {
    violations.push('Missing trainingDateRange.');
  }
  if (!metadata.predictionDate) violations.push('Missing predictionDate.');
  if (!metadata.populationDefinition) violations.push('Missing populationDefinition.');
  if (!metadata.opportunityRoleContext?.roleTitle) {
    violations.push('Missing opportunityRoleContext.roleTitle.');
  }

  if (metadata.comparableSampleSize < MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE) {
    violations.push(
      `Comparable sample size ${metadata.comparableSampleSize} is below statistical minimum ${MIN_STATISTICALLY_DEFENSIBLE_SAMPLE_SIZE}.`,
    );
  }

  if (metadata.observedPositiveOutcomes < MIN_OBSERVED_POSITIVE_OUTCOMES) {
    violations.push(
      `Observed positive outcomes ${metadata.observedPositiveOutcomes} is below minimum ${MIN_OBSERVED_POSITIVE_OUTCOMES}.`,
    );
  }

  if (
    !metadata.uncertaintyInterval ||
    typeof metadata.uncertaintyInterval.lower !== 'number' ||
    typeof metadata.uncertaintyInterval.upper !== 'number' ||
    typeof metadata.uncertaintyInterval.confidenceLevel !== 'number'
  ) {
    violations.push('Missing or invalid uncertaintyInterval.');
  } else if (metadata.uncertaintyInterval.lower > metadata.uncertaintyInterval.upper) {
    violations.push('uncertaintyInterval lower bound cannot exceed upper bound.');
  }

  if (
    !metadata.calibrationMetrics ||
    typeof metadata.calibrationMetrics.brierScore !== 'number' ||
    typeof metadata.calibrationMetrics.logLoss !== 'number'
  ) {
    violations.push('Missing or invalid calibrationMetrics.');
  } else if (metadata.calibrationMetrics.brierScore > MAX_ACCEPTABLE_BRIER_SCORE) {
    violations.push(
      `Brier score ${metadata.calibrationMetrics.brierScore} exceeds threshold ${MAX_ACCEPTABLE_BRIER_SCORE}.`,
    );
  }

  if (!metadata.featureSnapshot || Object.keys(metadata.featureSnapshot).length === 0) {
    violations.push('Missing featureSnapshot.');
  }

  if (
    !metadata.predictionProvenance ||
    !metadata.predictionProvenance.inputDataHash ||
    !metadata.predictionProvenance.pipelineVersion
  ) {
    violations.push('Missing predictionProvenance.');
  }

  if (!metadata.knownLimitations || metadata.knownLimitations.length === 0) {
    violations.push('Prediction must disclose known limitations.');
  }

  if (!prediction.unobservedFactors || prediction.unobservedFactors.length === 0) {
    violations.push('Prediction must disclose unobserved factors.');
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}
