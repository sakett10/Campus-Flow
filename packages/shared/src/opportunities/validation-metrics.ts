import type { CalibrationBin, ComprehensiveValidationMetrics } from '@campusflow/types';

/**
 * Calculates Brier Score: mean squared error between predicted probabilities and binary outcomes.
 * Brier = (1/N) * sum((p_i - y_i)^2)
 */
export function calculateBrierScore(predictions: number[], outcomes: (0 | 1)[]): number {
  if (predictions.length === 0 || predictions.length !== outcomes.length) {
    throw new Error('Predictions and outcomes must be non-empty arrays of identical length.');
  }

  let sumSquaredError = 0;
  for (let i = 0; i < predictions.length; i++) {
    const diff = (predictions[i] ?? 0) - (outcomes[i] ?? 0);
    sumSquaredError += diff * diff;
  }
  return sumSquaredError / predictions.length;
}

/**
 * Calculates Logarithmic Loss (Cross-Entropy).
 * LogLoss = -(1/N) * sum(y_i * ln(p_i) + (1 - y_i) * ln(1 - p_i))
 */
export function calculateLogLoss(predictions: number[], outcomes: (0 | 1)[], eps = 1e-15): number {
  if (predictions.length === 0 || predictions.length !== outcomes.length) {
    throw new Error('Predictions and outcomes must be non-empty arrays of identical length.');
  }

  let totalLoss = 0;
  for (let i = 0; i < predictions.length; i++) {
    const y = outcomes[i] ?? 0;
    const p = Math.max(eps, Math.min(1 - eps, predictions[i] ?? 0.5));
    totalLoss += y * Math.log(p) + (1 - y) * Math.log(1 - p);
  }
  return -totalLoss / predictions.length;
}

/**
 * Calculates ROC-AUC (Area Under the Receiver Operating Characteristic Curve)
 * using the Mann-Whitney-Wilcoxon rank-sum theorem for exact calculation.
 */
export function calculateRocAuc(predictions: number[], outcomes: (0 | 1)[]): number {
  if (predictions.length === 0 || predictions.length !== outcomes.length) {
    throw new Error('Predictions and outcomes must be non-empty arrays of identical length.');
  }

  const positives: number[] = [];
  const negatives: number[] = [];

  for (let i = 0; i < predictions.length; i++) {
    if (outcomes[i] === 1) {
      positives.push(predictions[i] ?? 0);
    } else {
      negatives.push(predictions[i] ?? 0);
    }
  }

  if (positives.length === 0 || negatives.length === 0) {
    return 0.5; // Undefined discrimination on single-class set
  }

  let concordant = 0;
  let ties = 0;

  for (const pos of positives) {
    for (const neg of negatives) {
      if (pos > neg) {
        concordant += 1;
      } else if (pos === neg) {
        ties += 0.5;
      }
    }
  }

  return (concordant + ties) / (positives.length * negatives.length);
}

/**
 * Calculates PR-AUC (Area Under Precision-Recall Curve) using step trapezoidal integration.
 */
export function calculatePrAuc(predictions: number[], outcomes: (0 | 1)[]): number {
  if (predictions.length === 0 || predictions.length !== outcomes.length) {
    throw new Error('Predictions and outcomes must be non-empty arrays of identical length.');
  }

  const totalPositives = outcomes.filter((y) => y === 1).length;
  if (totalPositives === 0) return 0.0;

  // Pair up and sort by predicted probability descending
  const paired = predictions.map((p, idx) => ({ p, y: outcomes[idx] ?? 0 }));
  paired.sort((a, b) => b.p - a.p);

  let truePositives = 0;
  let falsePositives = 0;
  let prevRecall = 0;
  let auc = 0;

  for (let i = 0; i < paired.length; i++) {
    const item = paired[i];
    if (!item) continue;
    if (item.y === 1) {
      truePositives++;
    } else {
      falsePositives++;
    }

    const currentRecall = truePositives / totalPositives;
    const currentPrecision = truePositives / (truePositives + falsePositives);

    auc += (currentRecall - prevRecall) * currentPrecision;
    prevRecall = currentRecall;
  }

  return Math.min(1.0, Math.max(0.0, auc));
}

/**
 * Calculates Expected Calibration Error (ECE) and reliability bin statistics.
 * ECE = sum_m (|B_m| / N) * |acc(B_m) - conf(B_m)|
 */
export function calculateExpectedCalibrationError(
  predictions: number[],
  outcomes: (0 | 1)[],
  numBins = 10,
): { ece: number; bins: CalibrationBin[] } {
  if (predictions.length === 0 || predictions.length !== outcomes.length) {
    throw new Error('Predictions and outcomes must be non-empty arrays of identical length.');
  }

  const binStep = 1.0 / numBins;
  const bins: CalibrationBin[] = [];

  for (let b = 0; b < numBins; b++) {
    const lower = b * binStep;
    const upper = (b + 1) * binStep;
    bins.push({
      binIndex: b,
      binLower: Math.round(lower * 100) / 100,
      binUpper: Math.round(upper * 100) / 100,
      sampleCount: 0,
      meanPredicted: 0,
      observedFrequency: 0,
    });
  }

  // Accumulate into bins
  const binSums: Array<{ sumP: number; sumY: number; count: number }> = Array.from(
    { length: numBins },
    () => ({ sumP: 0, sumY: 0, count: 0 }),
  );

  for (let i = 0; i < predictions.length; i++) {
    const p = predictions[i] ?? 0;
    const y = outcomes[i] ?? 0;
    let binIdx = Math.min(numBins - 1, Math.floor(p / binStep));
    if (binIdx < 0) binIdx = 0;

    const entry = binSums[binIdx];
    if (entry) {
      entry.sumP += p;
      entry.sumY += y;
      entry.count += 1;
    }
  }

  let totalWeightedError = 0;
  const n = predictions.length;

  for (let b = 0; b < numBins; b++) {
    const entry = binSums[b]!;
    const bin = bins[b]!;
    bin.sampleCount = entry.count;
    if (entry.count > 0) {
      bin.meanPredicted = entry.sumP / entry.count;
      bin.observedFrequency = entry.sumY / entry.count;
      const error = Math.abs(bin.observedFrequency - bin.meanPredicted);
      totalWeightedError += (entry.count / n) * error;
    }
  }

  return {
    ece: Math.min(1.0, totalWeightedError),
    bins,
  };
}

/**
 * Calculates calibration slope and intercept via logit linear approximation.
 * Ideal calibrated model: slope = 1.0, intercept = 0.0.
 */
export function calculateCalibrationSlopeIntercept(
  predictions: number[],
  outcomes: (0 | 1)[],
): { slope: number; intercept: number } {
  if (predictions.length < 5) {
    return { slope: 1.0, intercept: 0.0 };
  }

  const eps = 1e-4;
  const x: number[] = [];
  const y: number[] = [];

  for (let i = 0; i < predictions.length; i++) {
    const p = Math.max(eps, Math.min(1 - eps, predictions[i] ?? 0.5));
    x.push(Math.log(p / (1 - p))); // log-odds
    y.push(outcomes[i] ?? 0);
  }

  // Ordinary least squares on (x, y)
  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const xi = x[i]!;
    const yi = y[i]!;
    sumX += xi;
    sumY += yi;
    sumXY += xi * yi;
    sumXX += xi * xi;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-8) {
    return { slope: 1.0, intercept: 0.0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return {
    slope: Math.round(slope * 1000) / 1000,
    intercept: Math.round(intercept * 1000) / 1000,
  };
}

/**
 * Estimates bootstrap confidence interval for any statistical validation metric.
 */
export function bootstrapMetricConfidenceInterval(
  predictions: number[],
  outcomes: (0 | 1)[],
  metricFn: (p: number[], y: (0 | 1)[]) => number,
  numResamples = 300,
  alpha = 0.05,
): { lower: number; upper: number; mean: number; pointEstimate?: number } {
  if (predictions.length === 0) {
    return { lower: 0, upper: 0, mean: 0, pointEstimate: 0 };
  }

  const n = predictions.length;
  const metricValues: number[] = [];

  // Deterministic pseudo-random sequence for reproducible test evaluation
  let seed = 42;
  const pseudoRandom = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let b = 0; b < numResamples; b++) {
    const sampleP: number[] = new Array(n);
    const sampleY: (0 | 1)[] = new Array(n);

    for (let i = 0; i < n; i++) {
      const idx = Math.floor(pseudoRandom() * n);
      sampleP[i] = predictions[idx] ?? 0;
      sampleY[i] = outcomes[idx] ?? 0;
    }

    try {
      const val = metricFn(sampleP, sampleY);
      if (!isNaN(val) && isFinite(val)) {
        metricValues.push(val);
      }
    } catch {
      // Skip degenerate sample
    }
  }

  if (metricValues.length === 0) {
    const pointEst = metricFn(predictions, outcomes);
    return { lower: pointEst, upper: pointEst, mean: pointEst, pointEstimate: pointEst };
  }

  metricValues.sort((a, b) => a - b);
  const lowerIndex = Math.floor((alpha / 2) * metricValues.length);
  const upperIndex = Math.min(
    metricValues.length - 1,
    Math.floor((1 - alpha / 2) * metricValues.length),
  );
  const sum = metricValues.reduce((acc, v) => acc + v, 0);
  const mean = Math.round((sum / metricValues.length) * 1000) / 1000;

  return {
    lower: Math.round((metricValues[lowerIndex] ?? 0) * 1000) / 1000,
    upper: Math.round((metricValues[upperIndex] ?? 1) * 1000) / 1000,
    mean,
    pointEstimate: mean,
  };
}

/**
 * Runs the comprehensive statistical validation battery on holdout predictions.
 * Computes both discrimination (ROC-AUC, PR-AUC) and calibration (Brier, LogLoss, ECE, Slope/Intercept).
 */
export function evaluateComprehensiveValidation(params: {
  predictions: number[];
  outcomes: (0 | 1)[];
  validationType: 'temporal_out_of_time' | 'rolling_walk_forward';
  evaluationDate?: string | undefined;
}): ComprehensiveValidationMetrics {
  const {
    predictions,
    outcomes,
    validationType,
    evaluationDate = new Date().toISOString(),
  } = params;

  const brierScore = calculateBrierScore(predictions, outcomes);
  const logLoss = calculateLogLoss(predictions, outcomes);
  const rocAuc = calculateRocAuc(predictions, outcomes);
  const prAuc = calculatePrAuc(predictions, outcomes);
  const { ece, bins } = calculateExpectedCalibrationError(predictions, outcomes, 10);
  const { slope, intercept } = calculateCalibrationSlopeIntercept(predictions, outcomes);

  const brierCI = bootstrapMetricConfidenceInterval(predictions, outcomes, calculateBrierScore);
  const rocAucCI = bootstrapMetricConfidenceInterval(predictions, outcomes, calculateRocAuc);
  const prAucCI = bootstrapMetricConfidenceInterval(predictions, outcomes, calculatePrAuc);

  const positiveEvents = outcomes.filter((y) => y === 1).length;

  return {
    brierScore: Math.round(brierScore * 1000) / 1000,
    logLoss: Math.round(logLoss * 1000) / 1000,
    rocAuc: Math.round(rocAuc * 1000) / 1000,
    prAuc: Math.round(prAuc * 1000) / 1000,
    expectedCalibrationError: Math.round(ece * 1000) / 1000,
    calibrationSlope: slope,
    calibrationIntercept: intercept,
    calibrationBins: bins,
    confidenceIntervals: {
      brierScore: { ...brierCI, confidenceLevel: 0.95 },
      rocAuc: { ...rocAucCI, confidenceLevel: 0.95 },
      prAuc: { ...prAucCI, confidenceLevel: 0.95 },
    },
    evaluationDate,
    validationType,
    datasetRows: predictions.length,
    positiveEvents,
  };
}
