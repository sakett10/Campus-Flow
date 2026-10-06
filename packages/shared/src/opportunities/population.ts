import type { PopulationDefinition } from '@campusflow/types';

/**
 * Normalizes text components for clean population string formatting.
 */
function cleanSegment(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Creates an immutable and explicit PopulationDefinition.
 *
 * CRITICAL RULE:
 * Never silently combine unrelated countries, role families, or graduation cohorts.
 * If modeling across multiple cohorts or regions, a parent population must be explicitly declared.
 */
export function createPopulationDefinition(params: {
  country: string;
  roleFamily: string;
  roleType: string;
  graduationCohort: number;
  source?: string | undefined;
  parentPopulation?: string | null | undefined;
}): PopulationDefinition {
  const {
    country,
    roleFamily,
    roleType,
    graduationCohort,
    source = 'student applications recorded in CampusFlow',
    parentPopulation = null,
  } = params;

  const countryClean = cleanSegment(country);
  const roleFamilyClean = cleanSegment(roleFamily);
  const roleTypeClean = cleanSegment(roleType);

  const formatted = `${countryClean} | ${roleFamilyClean} ${roleTypeClean} | Class of ${graduationCohort} | ${source}`;

  return {
    country: countryClean,
    roleFamily: roleFamilyClean,
    roleType: roleTypeClean,
    graduationCohort,
    source,
    parentPopulation: parentPopulation ? cleanSegment(parentPopulation) : null,
    formatted,
  };
}

/**
 * Validates whether two population definitions are strictly compatible for joint modeling.
 * Fails if distinct cohorts or distinct countries are mixed without hierarchical parent declaration.
 */
export function validatePopulationCompatibility(
  base: PopulationDefinition,
  target: PopulationDefinition,
): {
  isCompatible: boolean;
  compatible: boolean;
  reason?: string;
  mismatchReasons: string[];
} {
  const mismatchReasons: string[] = [];

  if (base.country.toLowerCase() !== target.country.toLowerCase()) {
    if (!base.parentPopulation && !target.parentPopulation) {
      mismatchReasons.push(
        `Country mismatch: Cannot combine country "${base.country}" with "${target.country}" without an explicit multi-national parent population.`,
      );
    }
  }

  if (base.roleFamily.toLowerCase() !== target.roleFamily.toLowerCase()) {
    if (!base.parentPopulation && !target.parentPopulation) {
      mismatchReasons.push(
        `Role family mismatch: Cannot combine "${base.roleFamily}" with "${target.roleFamily}" without a parent role hierarchy.`,
      );
    }
  }

  if (base.graduationCohort !== target.graduationCohort) {
    if (!base.parentPopulation && !target.parentPopulation) {
      mismatchReasons.push(
        `Graduation cohort mismatch: Cannot combine Class of ${base.graduationCohort} with Class of ${target.graduationCohort} without an explicit cross-cohort parent population.`,
      );
    }
  }

  const isCompatible = mismatchReasons.length === 0;
  return {
    isCompatible,
    compatible: isCompatible,
    ...(mismatchReasons[0] !== undefined ? { reason: mismatchReasons[0] } : {}),
    mismatchReasons,
  };
}
