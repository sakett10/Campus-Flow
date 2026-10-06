import type {
  PredictionSnapshot,
  OpportunitySnapshot,
  OutcomeTrainingExample,
} from '@campusflow/types';

/**
 * List of forbidden tokens in feature names or values that indicate target/outcome data leakage.
 */
export const FORBIDDEN_FEATURE_LEAKAGE_KEYS = [
  'outcome',
  'final_outcome',
  'target_label',
  'offer_received',
  'interview_scheduled',
  'assessment_score_received',
  'rejection_reason',
  'outcome_timestamp',
  'stage_transition',
  'time_to_offer',
  'time_to_rejection',
  'horizon_days',
];

export interface LeakageCheckRow {
  predictionSnapshot: PredictionSnapshot;
  opportunitySnapshot: OpportunitySnapshot;
  applicationTimestamp: Date | string;
  features: Record<string, unknown>;
  featureTimestamps?: Record<string, Date | string> | undefined;
}

export interface LeakageValidationResult {
  hasLeakage: boolean;
  violations: string[];
}

/**
 * Validates an individual modeling candidate row for data leakage.
 * Rejects rows where:
 * 1. A feature was recorded after the prediction timestamp
 * 2. Student state contains future evidence relative to prediction timestamp
 * 3. Opportunity requirements were modified after prediction time
 * 4. Outcome data leaks into input features
 */
export function validateTrainingRowLeakage(row: LeakageCheckRow): LeakageValidationResult {
  const violations: string[] = [];
  const predictionTime = new Date(row.predictionSnapshot.snapshotTimestamp).getTime();
  const opportunityTime = new Date(row.opportunitySnapshot.snapshotTimestamp).getTime();

  // 1. Check feature timestamps against prediction timestamp
  if (row.featureTimestamps) {
    for (const [featureKey, rawTimestamp] of Object.entries(row.featureTimestamps)) {
      const featTime = new Date(rawTimestamp).getTime();
      if (featTime > predictionTime) {
        violations.push(
          `Feature leakage: Feature "${featureKey}" was recorded at ${new Date(featTime).toISOString()}, after prediction timestamp ${new Date(predictionTime).toISOString()}.`,
        );
      }
    }
  }

  // 2. Check student evidence timestamps inside prediction snapshot
  for (const ev of row.predictionSnapshot.skillEvidenceSnapshot) {
    if (ev.verifiedAt) {
      const evTime = new Date(ev.verifiedAt).getTime();
      if (evTime > predictionTime) {
        violations.push(
          `Evidence leakage: Skill evidence "${ev.title}" (ID: ${ev.id}) verified at ${ev.verifiedAt}, which is after prediction snapshot timestamp ${row.predictionSnapshot.snapshotTimestamp}.`,
        );
      }
    }
  }

  for (const ac of row.predictionSnapshot.academicEvidenceSnapshot) {
    if (ac.verifiedAt) {
      const acTime = new Date(ac.verifiedAt).getTime();
      if (acTime > predictionTime) {
        violations.push(
          `Academic leakage: Course evidence "${ac.title}" verified at ${ac.verifiedAt}, which is after prediction snapshot timestamp ${row.predictionSnapshot.snapshotTimestamp}.`,
        );
      }
    }
  }

  // 3. Check opportunity requirements modification time vs prediction time
  const retrievalTime = new Date(
    row.opportunitySnapshot.sourceProvenance?.retrievalTimestamp ??
      row.opportunitySnapshot.snapshotTimestamp,
  ).getTime();
  if (opportunityTime > predictionTime + 60000 || retrievalTime > predictionTime + 60000) {
    violations.push(
      `Opportunity requirements leakage: Opportunity was updated/retrieved after prediction snapshot timestamp.`,
    );
  }

  // 4. Check for outcome / target leakage directly in feature keys
  for (const [key, val] of Object.entries(row.features)) {
    const keyLower = key.toLowerCase();
    for (const forbidden of FORBIDDEN_FEATURE_LEAKAGE_KEYS) {
      if (keyLower.includes(forbidden)) {
        violations.push(
          `Target outcome leakage: Feature "${key}" contains forbidden outcome term "${forbidden}".`,
        );
        break;
      }
    }

    // Check if string feature value contains leaked outcome terms
    if (typeof val === 'string') {
      const valLower = val.toLowerCase();
      if (valLower === 'offer_received' || valLower === 'rejected_at_interview') {
        violations.push(
          `Target outcome leakage: Feature "${key}" contains outcome state "${val}".`,
        );
      }
    }
  }

  return {
    hasLeakage: violations.length > 0,
    violations,
  };
}

/**
 * Validates an entire candidate dataset for leakage and duplicates.
 */
export function validateDatasetLeakage(
  rows: Array<LeakageCheckRow & { studentId?: string; opportunityId?: string }>,
  existingExamples?: OutcomeTrainingExample[],
): {
  isValid: boolean;
  totalViolations: number;
  rowViolations: Array<{ index: number; violations: string[] }>;
  duplicateCount: number;
} {
  const rowViolations: Array<{ index: number; violations: string[] }> = [];
  const seenApplicationKeys = new Set<string>();
  let duplicateCount = 0;

  // Add existing examples to seen keys
  if (existingExamples) {
    for (const ex of existingExamples) {
      const key = `${ex.predictionSnapshotId}::${ex.opportunitySnapshotId}`;
      seenApplicationKeys.add(key);
    }
  }

  rows.forEach((row, idx) => {
    const res = validateTrainingRowLeakage(row);
    if (res.hasLeakage) {
      rowViolations.push({ index: idx, violations: res.violations });
    }

    const appKey = `${row.predictionSnapshot.id}::${row.opportunitySnapshot.id}`;
    if (seenApplicationKeys.has(appKey)) {
      duplicateCount++;
      rowViolations.push({
        index: idx,
        violations: [`Duplicate record: Application key ${appKey} already exists in dataset.`],
      });
    } else {
      seenApplicationKeys.add(appKey);
    }
  });

  return {
    isValid: rowViolations.length === 0,
    totalViolations: rowViolations.length,
    rowViolations,
    duplicateCount,
  };
}
