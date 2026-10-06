import crypto from 'node:crypto';
import type {
  OutcomeTarget,
  PopulationDefinition,
  OutcomeTrainingExample,
  DatasetSpecification,
} from '@campusflow/types';
import { stableStringify } from './snapshots.js';

export function createDatasetSpecification(params: {
  target: OutcomeTarget;
  sourcePopulation: PopulationDefinition;
  examples: OutcomeTrainingExample[];
  featureSchema: Record<string, string>;
  filteringRules?: Record<string, unknown> | undefined;
  extractionVersion?: string | undefined;
  datasetVersion?: string | undefined;
  featureData?: Record<string, unknown>[] | undefined;
}): DatasetSpecification {
  const {
    target,
    sourcePopulation,
    examples,
    featureSchema,
    filteringRules = {},
    extractionVersion = 'v1.0.0',
    featureData = [],
  } = params;

  let numPositive = 0;
  let numNegative = 0;
  let numCensored = 0;

  for (const ex of examples) {
    if (ex.targetLabel === 1) numPositive++;
    else if (ex.targetLabel === 0) numNegative++;
    else numCensored++;
  }

  // Calculate missing-data summary across featureData
  const missingDataSummary: Record<string, number> = {};
  const schemaKeys = Object.keys(featureSchema);
  for (const key of schemaKeys) {
    missingDataSummary[key] = 0;
  }

  if (featureData.length > 0) {
    for (const row of featureData) {
      for (const key of schemaKeys) {
        const val = row[key];
        if (val === null || val === undefined || val === '') {
          missingDataSummary[key] = (missingDataSummary[key] || 0) + 1;
        }
      }
    }
    for (const key of schemaKeys) {
      missingDataSummary[key] = (missingDataSummary[key] || 0) / featureData.length;
    }
  }

  const generationTimestamp = new Date().toISOString();

  // Create deterministic specification hash
  const specPayload = {
    target,
    sourcePopulation: sourcePopulation.formatted,
    filteringRules,
    featureSchema,
    numRows: examples.length,
    numPositive,
    numNegative,
    numCensored,
    extractionVersion,
  };

  const specificationHash = crypto
    .createHash('sha256')
    .update(stableStringify(specPayload))
    .digest('hex');

  const datasetVersion = params.datasetVersion || `ds-${target}-${specificationHash.slice(0, 12)}`;

  return {
    datasetVersion,
    extractionVersion,
    generationTimestamp,
    target,
    sourcePopulation,
    filteringRules,
    featureSchema,
    numRows: examples.length,
    totalRows: examples.length,
    numPositive,
    positiveOutcomes: numPositive,
    numNegative,
    negativeOutcomes: numNegative,
    numCensored,
    censoredOutcomes: numCensored,
    missingDataSummary,
    specificationHash,
  };
}
