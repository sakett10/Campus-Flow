import type {
  ModelRegistryEntry,
  ModelCard,
  ModelApprovalStatus,
  ModelReadinessAssessment,
} from '@campusflow/types';

/**
 * Creates a Model Card from a registered model entry and readiness assessment.
 */
export function generateModelCard(params: {
  entry: ModelRegistryEntry;
  assessment?: ModelReadinessAssessment | undefined;
  purpose?: string | undefined;
  knownBiasRisks?: string[] | undefined;
}): ModelCard {
  const {
    entry,
    purpose = `Calibrated empirical estimate for early career ${entry.target} progression within ${entry.population.formatted}.`,
    knownBiasRisks = [
      'Self-selection bias: Candidates applying through CampusFlow may have higher active engagement than the overall student population.',
      'Institution bias: Training distributions may have higher representation from specific engineering colleges.',
    ],
  } = params;

  return {
    id: `card-${entry.modelVersion}`,
    modelVersion: entry.modelVersion,
    purpose,
    targetPopulation: entry.population.formatted,
    trainingData: `Dataset ${entry.datasetVersion} covering ${entry.trainingPeriod.start} to ${entry.trainingPeriod.end}`,
    validationStrategy: `Strict out-of-time temporal validation covering ${entry.validationPeriod.start} to ${entry.validationPeriod.end}, evaluated on holdout test cohort ${entry.testPeriod.start} to ${entry.testPeriod.end}.`,
    metrics: entry.metrics,
    calibration: `Expected Calibration Error: ${(entry.calibrationResults.ece * 100).toFixed(1)}%, Brier Score: ${entry.calibrationResults.brierScore.toFixed(3)}, Calibration Slope: ${entry.calibrationResults.slope.toFixed(3)}.`,
    limitations: entry.limitations,
    knownMissingVariables: [
      'Live technical and behavioral interview performance',
      'Real-time student anxiety or interview-day fatigue',
      'Hiring manager subjective preferences and team fit biases',
      'Internal employee referrals and personal networking',
      'Non-public applicant pool volume and competitor strengths',
      'Unannounced corporate headcount freezes or sudden departmental budget reallocations',
      'Visa sponsorship policy shifts and regulatory work authorization caps',
    ],
    knownBiasRisks,
    appropriateInterpretation:
      'This model provides statistical calibration over historical applicant outcomes. It reflects population base rates and verified skill alignments. It should be used solely as an educational planning diagnostic to prioritize skill development.',
    inappropriateInterpretation:
      'Never interpret model predictions as a deterministic guarantee, an interview certainty, a ranking of human worth, or an assessment of candidate innate capability.',
    publishedAt: new Date().toISOString(),
  };
}

/**
 * Checks whether a model version is officially approved and permitted for production probability evaluation.
 *
 * CRITICAL RULE:
 * A probability cannot reference an unapproved model version.
 */
export function canModelBeUsedForProbabilities(entry: ModelRegistryEntry | null | undefined): {
  allowed: boolean;
  reason?: string;
} {
  if (!entry) {
    return {
      allowed: false,
      reason: 'Model version not found in Model Registry.',
    };
  }

  if (entry.approvalStatus !== 'approved') {
    return {
      allowed: false,
      reason: `Model version ${entry.modelVersion} has approval status "${entry.approvalStatus}". Probability models must have status "approved".`,
    };
  }

  if (!entry.approvedTimestamp) {
    return {
      allowed: false,
      reason: `Model version ${entry.modelVersion} is missing approvedTimestamp.`,
    };
  }

  return { allowed: true };
}

/**
 * Validates a proposed state transition for a ModelRegistryEntry.
 * Only transitions to 'approved' if a passed ModelReadinessAssessment is provided.
 */
export function validateModelApprovalTransition(params: {
  currentStatus: ModelApprovalStatus;
  newStatus: ModelApprovalStatus;
  assessment?: ModelReadinessAssessment | undefined;
}): { valid: boolean; reason?: string } {
  const { currentStatus, newStatus, assessment } = params;

  if (newStatus === 'approved') {
    if (!assessment) {
      return {
        valid: false,
        reason: 'Cannot approve a model without a completed ModelReadinessAssessment.',
      };
    }
    if (!assessment.overallReady) {
      return {
        valid: false,
        reason: `Cannot approve model: Readiness gate failed with blocking reasons: ${assessment.blockingReasons.join('; ')}`,
      };
    }
  }

  if (currentStatus === 'deprecated' && newStatus === 'approved') {
    return {
      valid: false,
      reason:
        'Cannot reactivate a deprecated model version. Create a new semantic version instead.',
    };
  }

  return { valid: true };
}
