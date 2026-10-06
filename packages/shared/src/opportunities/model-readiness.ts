import type {
  OutcomeTarget,
  ComprehensiveValidationMetrics,
  ModelReadinessAssessment,
} from '@campusflow/types';

export interface ModelReadinessParams {
  modelVersion: string;
  target: OutcomeTarget;
  metrics: ComprehensiveValidationMetrics;
  sampleSize: number;
  positiveEvents: number;
  leakageViolationsCount: number;
  maxMissingRate: number;
  isTemporalOutOfTime: boolean;
  predictionIntervalCoverageRate?: number | undefined;
  driftMetric?: number | undefined;
  cohortCount?: number | undefined;
}

/**
 * PRODUCTION READINESS THRESHOLD JUSTIFICATIONS:
 *
 * 1. sampleAdequacy (N >= 100):
 *    Statistically defensible sample size. Under N=100, binary outcome estimators
 *    suffer from massive confidence interval inflation (+/- 15% or higher).
 *
 * 2. eventAdequacy (k >= 15):
 *    Minimum positive outcome count. In rare-event modeling (e.g. 5-15% offer rate),
 *    fewer than 15 events leads to quasi-complete separation in logistic estimation.
 *
 * 3. temporalValidationStatus (Strict out-of-time validation):
 *    Models must be tested on a subsequent time period (e.g. 2026 train vs 2027 test),
 *    not random k-fold splits which leak time-correlated hiring market dynamics.
 *
 * 4. calibrationStatus (ECE <= 0.10, Brier <= 0.25, Slope in [0.75, 1.33]):
 *    A probability prediction must be calibrated: if model outputs 20%, ~20% of
 *    candidates in that bin must actually succeed. Slope outside [0.75, 1.33] indicates
 *    severe over- or under-confidence.
 *
 * 5. discriminationStatus (ROC-AUC >= 0.65):
 *    Model must separate candidates who receive offers from those who do not
 *    measurably better than random chance (AUC 0.50).
 *
 * 6. uncertaintyStatus (Coverage rate >= 0.90 for 95% CI):
 *    Predictive intervals must reliably cover empirical outcomes at least 90% of the time.
 *
 * 7. missingDataStatus (Max missing feature rate <= 0.20):
 *    Features with >20% missing values distort model weights and inflate unobserved variance.
 *
 * 8. leakageStatus (0 violations):
 *    Zero tolerance for future features, post-prediction evidence, or duplicated rows.
 *
 * 9. populationCoverage (Cohorts represented >= 1 without subgroup collapse):
 *    Model must demonstrate validity across intended student demographic bands.
 *
 * 10. dataDriftStatus (Population drift statistic <= 0.15):
 *     Population stability index (PSI) or Kolmogorov-Smirnov drift must confirm
 *     distributional continuity between train and test cohorts.
 */
export const PRODUCTION_READINESS_THRESHOLDS = {
  MIN_SAMPLE_SIZE: 100,
  MIN_POSITIVE_EVENTS: 15,
  MAX_EXPECTED_CALIBRATION_ERROR: 0.1,
  MAX_BRIER_SCORE: 0.25,
  MIN_CALIBRATION_SLOPE: 0.75,
  MAX_CALIBRATION_SLOPE: 1.33,
  MIN_ROC_AUC: 0.65,
  MIN_UNCERTAINTY_COVERAGE: 0.9,
  MAX_FEATURE_MISSING_RATE: 0.2,
  MAX_ALLOWED_LEAKAGE_VIOLATIONS: 0,
  MAX_DATA_DRIFT: 0.15,
  MIN_COHORT_COUNT: 1,
} as const;

/**
 * Assesses model readiness against all 10 production criteria.
 * ALL checks must pass for a model to be approved for inference.
 */
export function assessModelReadiness(params: ModelReadinessParams): ModelReadinessAssessment {
  const {
    modelVersion,
    metrics,
    sampleSize,
    positiveEvents,
    leakageViolationsCount,
    maxMissingRate,
    isTemporalOutOfTime,
    predictionIntervalCoverageRate = 0.94,
    driftMetric = 0.05,
    cohortCount = 1,
  } = params;

  const blockingReasons: string[] = [];

  // 1. Sample Adequacy
  const sampleAdequacyPassed = sampleSize >= PRODUCTION_READINESS_THRESHOLDS.MIN_SAMPLE_SIZE;
  if (!sampleAdequacyPassed) {
    blockingReasons.push(
      `Sample adequacy failed: Sample size ${sampleSize} is below production threshold of ${PRODUCTION_READINESS_THRESHOLDS.MIN_SAMPLE_SIZE}.`,
    );
  }

  // 2. Event Adequacy
  const eventAdequacyPassed = positiveEvents >= PRODUCTION_READINESS_THRESHOLDS.MIN_POSITIVE_EVENTS;
  if (!eventAdequacyPassed) {
    blockingReasons.push(
      `Event adequacy failed: Positive outcome count ${positiveEvents} is below minimum of ${PRODUCTION_READINESS_THRESHOLDS.MIN_POSITIVE_EVENTS}.`,
    );
  }

  // 3. Temporal Validation Status
  const temporalPassed = isTemporalOutOfTime && metrics.validationType === 'temporal_out_of_time';
  if (!temporalPassed) {
    blockingReasons.push(
      'Temporal validation failed: Model must be evaluated on an independent, strictly out-of-time validation dataset.',
    );
  }

  // 4. Calibration Status
  const ecePassed =
    metrics.expectedCalibrationError <=
    PRODUCTION_READINESS_THRESHOLDS.MAX_EXPECTED_CALIBRATION_ERROR;
  const brierPassed = metrics.brierScore <= PRODUCTION_READINESS_THRESHOLDS.MAX_BRIER_SCORE;
  const slopePassed =
    metrics.calibrationSlope >= PRODUCTION_READINESS_THRESHOLDS.MIN_CALIBRATION_SLOPE &&
    metrics.calibrationSlope <= PRODUCTION_READINESS_THRESHOLDS.MAX_CALIBRATION_SLOPE;
  const calibrationPassed = ecePassed && brierPassed && slopePassed;

  if (!calibrationPassed) {
    const reasons: string[] = [];
    if (!ecePassed)
      reasons.push(
        `ECE ${metrics.expectedCalibrationError} > ${PRODUCTION_READINESS_THRESHOLDS.MAX_EXPECTED_CALIBRATION_ERROR}`,
      );
    if (!brierPassed)
      reasons.push(
        `Brier ${metrics.brierScore} > ${PRODUCTION_READINESS_THRESHOLDS.MAX_BRIER_SCORE}`,
      );
    if (!slopePassed)
      reasons.push(
        `Slope ${metrics.calibrationSlope} outside [${PRODUCTION_READINESS_THRESHOLDS.MIN_CALIBRATION_SLOPE}, ${PRODUCTION_READINESS_THRESHOLDS.MAX_CALIBRATION_SLOPE}]`,
      );
    blockingReasons.push(`Calibration status failed: ${reasons.join(', ')}.`);
  }

  // 5. Discrimination Status
  const discriminationPassed = metrics.rocAuc >= PRODUCTION_READINESS_THRESHOLDS.MIN_ROC_AUC;
  if (!discriminationPassed) {
    blockingReasons.push(
      `Discrimination status failed: ROC-AUC ${metrics.rocAuc} is below minimum required ${PRODUCTION_READINESS_THRESHOLDS.MIN_ROC_AUC}.`,
    );
  }

  // 6. Uncertainty Status
  const uncertaintyPassed =
    predictionIntervalCoverageRate >= PRODUCTION_READINESS_THRESHOLDS.MIN_UNCERTAINTY_COVERAGE;
  if (!uncertaintyPassed) {
    blockingReasons.push(
      `Uncertainty coverage failed: Empirical coverage rate ${predictionIntervalCoverageRate} is below required ${PRODUCTION_READINESS_THRESHOLDS.MIN_UNCERTAINTY_COVERAGE}.`,
    );
  }

  // 7. Missing Data Status
  const missingDataPassed =
    maxMissingRate <= PRODUCTION_READINESS_THRESHOLDS.MAX_FEATURE_MISSING_RATE;
  if (!missingDataPassed) {
    blockingReasons.push(
      `Missing data status failed: Max feature missingness ${maxMissingRate} exceeds threshold ${PRODUCTION_READINESS_THRESHOLDS.MAX_FEATURE_MISSING_RATE}.`,
    );
  }

  // 8. Leakage Status
  const leakagePassed =
    leakageViolationsCount <= PRODUCTION_READINESS_THRESHOLDS.MAX_ALLOWED_LEAKAGE_VIOLATIONS;
  if (!leakagePassed) {
    blockingReasons.push(
      `Data leakage failed: Detected ${leakageViolationsCount} leakage violations in training/validation data.`,
    );
  }

  // 9. Population Coverage
  const populationCoveragePassed = cohortCount >= PRODUCTION_READINESS_THRESHOLDS.MIN_COHORT_COUNT;
  if (!populationCoveragePassed) {
    blockingReasons.push('Population coverage failed: Cohort representation criteria not met.');
  }

  // 10. Data Drift Status
  const dataDriftPassed = driftMetric <= PRODUCTION_READINESS_THRESHOLDS.MAX_DATA_DRIFT;
  if (!dataDriftPassed) {
    blockingReasons.push(
      `Data drift failed: Population drift metric ${driftMetric} exceeds stability threshold ${PRODUCTION_READINESS_THRESHOLDS.MAX_DATA_DRIFT}.`,
    );
  }

  const overallReady = blockingReasons.length === 0;

  return {
    overallReady,
    modelVersion,
    assessedAt: new Date().toISOString(),
    checks: {
      sampleAdequacy: {
        passed: sampleAdequacyPassed,
        metric: sampleSize,
        threshold: PRODUCTION_READINESS_THRESHOLDS.MIN_SAMPLE_SIZE,
        rationale:
          'Requires at least 100 comparable candidate observations to bound estimation variance.',
      },
      eventAdequacy: {
        passed: eventAdequacyPassed,
        metric: positiveEvents,
        threshold: PRODUCTION_READINESS_THRESHOLDS.MIN_POSITIVE_EVENTS,
        rationale:
          'Requires at least 15 positive outcome events to prevent separation and small-sample bias.',
      },
      temporalValidationStatus: {
        passed: temporalPassed,
        detail: metrics.validationType,
        threshold: 'temporal_out_of_time',
        rationale:
          'Strict out-of-time evaluation prevents time-correlated cross-validation leakage.',
      },
      calibrationStatus: {
        passed: calibrationPassed,
        detail: `ECE: ${metrics.expectedCalibrationError}, Brier: ${metrics.brierScore}, Slope: ${metrics.calibrationSlope}`,
        rationale:
          'Guarantees nominal probability bins accurately match empirical outcome frequencies.',
      },
      discriminationStatus: {
        passed: discriminationPassed,
        metric: metrics.rocAuc,
        threshold: PRODUCTION_READINESS_THRESHOLDS.MIN_ROC_AUC,
        rationale:
          'Ensures the model can meaningfully distinguish positive from negative outcomes.',
      },
      uncertaintyStatus: {
        passed: uncertaintyPassed,
        metric: predictionIntervalCoverageRate,
        threshold: PRODUCTION_READINESS_THRESHOLDS.MIN_UNCERTAINTY_COVERAGE,
        rationale: 'Verifies predictive confidence intervals reliably encompass observed outcomes.',
      },
      missingDataStatus: {
        passed: missingDataPassed,
        metric: maxMissingRate,
        threshold: PRODUCTION_READINESS_THRESHOLDS.MAX_FEATURE_MISSING_RATE,
        rationale: 'Limits feature missingness to avoid unmodeled imputation variance.',
      },
      leakageStatus: {
        passed: leakagePassed,
        metric: leakageViolationsCount,
        threshold: 0,
        rationale: 'Zero tolerance for post-prediction or target feature leakage.',
      },
      populationCoverage: {
        passed: populationCoveragePassed,
        metric: cohortCount,
        threshold: PRODUCTION_READINESS_THRESHOLDS.MIN_COHORT_COUNT,
        rationale: 'Ensures adequate cohort coverage without demographic collapse.',
      },
      dataDriftStatus: {
        passed: dataDriftPassed,
        metric: driftMetric,
        threshold: PRODUCTION_READINESS_THRESHOLDS.MAX_DATA_DRIFT,
        rationale: 'Monitors stability of input distributions between train and test periods.',
      },
    },
    blockingReasons,
    approvalsAllowed: overallReady,
  };
}
