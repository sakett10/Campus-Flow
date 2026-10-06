import type { Skill, ConceptSkillMapping, ConceptSkillMappingSeed } from '@campusflow/types';

export type ConceptMappingItem = ConceptSkillMapping | ConceptSkillMappingSeed;

export function normalizeInputText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s/+#.-]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Resolves an academic concept or raw skill string into a normalized career skill name.
 * Checks:
 * 1. Exact match in canonical skills catalog
 * 2. Synonym match in skills catalog
 * 3. Academic concept mapping in ConceptSkillMappings
 * 4. Fuzzy / word containment match against known concept mappings
 */
export function resolveSkillName(
  input: string,
  skillsCatalog: Skill[],
  conceptMappings: readonly ConceptMappingItem[],
): {
  normalizedName: string;
  source: 'direct_skill' | 'skill_synonym' | 'concept_mapping' | 'unmapped';
  mapping?: ConceptMappingItem;
} {
  const cleanInput = normalizeInputText(input);

  // 1. Direct Skill Name Match
  for (const skill of skillsCatalog) {
    if (normalizeInputText(skill.name) === cleanInput) {
      return { normalizedName: skill.name, source: 'direct_skill' };
    }
  }

  // 2. Skill Synonym Match
  for (const skill of skillsCatalog) {
    for (const syn of skill.synonyms || []) {
      if (normalizeInputText(syn) === cleanInput) {
        return { normalizedName: skill.name, source: 'skill_synonym' };
      }
    }
  }

  // 3. Exact Concept Mapping Match
  for (const mapping of conceptMappings) {
    if (normalizeInputText(mapping.conceptName) === cleanInput) {
      return {
        normalizedName: mapping.skillName,
        source: 'concept_mapping',
        mapping,
      };
    }
  }

  // 4. Word boundary / phrase match within concept mappings
  for (const mapping of conceptMappings) {
    const cleanConcept = normalizeInputText(mapping.conceptName);
    if (cleanInput.includes(cleanConcept) || cleanConcept.includes(cleanInput)) {
      return {
        normalizedName: mapping.skillName,
        source: 'concept_mapping',
        mapping,
      };
    }
  }

  return { normalizedName: input.trim(), source: 'unmapped' };
}

/**
 * Maps a syllabus topic or academic node title to a canonical career skill.
 */
export function mapAcademicConceptToSkill(
  conceptName: string,
  mappings: readonly ConceptMappingItem[],
): ConceptMappingItem | null {
  const cleanInput = normalizeInputText(conceptName);

  for (const m of mappings) {
    const cleanMapped = normalizeInputText(m.conceptName);
    if (cleanInput === cleanMapped || cleanInput.includes(cleanMapped)) {
      return m;
    }
  }

  return null;
}
