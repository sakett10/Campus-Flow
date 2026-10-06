import type {
  Opportunity,
  OpportunitySkillRequirement,
  Skill,
  StudentSkillEvidence,
  RoleMatchResult,
  SkillEvidenceLevel,
} from '@campusflow/types';

/**
 * Multipliers for evidence levels.
 *
 * CRITICAL RULE:
 * Manual self-reported claims must NEVER be treated as equivalent to demonstrated evidence.
 * A self-reported 'claimed' skill receives 0.20 multiplier, whereas 'demonstrated' receives 0.75.
 */
export const EVIDENCE_LEVEL_WEIGHTS: Record<SkillEvidenceLevel, number> = {
  verified: 1.0,
  strongly_demonstrated: 0.9,
  demonstrated: 0.75,
  weak: 0.4,
  claimed: 0.2,
  unknown: 0.0,
};

export const ROLE_MATCH_WEIGHT_DISTRIBUTION = {
  REQUIRED_SKILLS_WEIGHT: 0.6, // 60%
  PREFERRED_SKILLS_WEIGHT: 0.25, // 25%
  ACADEMIC_BREADTH_WEIGHT: 0.15, // 15%
} as const;

export const ROLE_MATCH_DISCLAIMER =
  'Role Match (score out of 100) is an evidence alignment metric based on stated requirements. It is NOT a hiring probability, interview prediction, or offer guarantee.';

export function evaluateRoleMatch(params: {
  opportunity: Opportunity;
  skillRequirements: Array<OpportunitySkillRequirement & { skill?: Skill }>;
  skills: Skill[];
  evidenceList: StudentSkillEvidence[];
}): RoleMatchResult {
  const { skillRequirements, skills, evidenceList } = params;

  const supportingEvidence: string[] = [];
  const gaps: string[] = [];

  // Map skills by ID and Name for fast lookup
  const skillById = new Map<string, Skill>();
  const skillByName = new Map<string, Skill>();
  for (const s of skills) {
    skillById.set(s.id, s);
    skillByName.set(s.name.toLowerCase(), s);
    if (s.synonyms && Array.isArray(s.synonyms)) {
      for (const syn of s.synonyms) {
        skillByName.set(syn.toLowerCase(), s);
      }
    }
  }

  // Group student evidence by skill
  const bestEvidenceBySkillId = new Map<string, StudentSkillEvidence>();
  for (const ev of evidenceList) {
    const existing = bestEvidenceBySkillId.get(ev.skillId);
    if (!existing) {
      bestEvidenceBySkillId.set(ev.skillId, ev);
    } else {
      const currentScore = EVIDENCE_LEVEL_WEIGHTS[existing.evidenceLevel] ?? 0;
      const newScore = EVIDENCE_LEVEL_WEIGHTS[ev.evidenceLevel] ?? 0;
      if (newScore > currentScore) {
        bestEvidenceBySkillId.set(ev.skillId, ev);
      }
    }
  }

  // Partition requirements
  const requiredReqs = skillRequirements.filter((r) => r.requirementType === 'required');
  const preferredReqs = skillRequirements.filter(
    (r) => r.requirementType === 'preferred' || r.requirementType === 'bonus',
  );

  let requiredEarnedPoints = 0;
  let requiredTotalMaxPoints = 0;

  let demonstratedCount = 0;
  let claimedOrWeakCount = 0;
  let missingRequiredCount = 0;

  // 1. Evaluate Required Skills
  for (const req of requiredReqs) {
    const skill = req.skill || skillById.get(req.skillId);
    const skillName = skill ? skill.name : 'Required Skill';
    const weight = parseFloat(req.importanceWeight) || 1.0;
    requiredTotalMaxPoints += weight;

    const studentEv = bestEvidenceBySkillId.get(req.skillId);
    if (studentEv) {
      const multiplier = EVIDENCE_LEVEL_WEIGHTS[studentEv.evidenceLevel] ?? 0;
      requiredEarnedPoints += weight * multiplier;

      if (['verified', 'strongly_demonstrated', 'demonstrated'].includes(studentEv.evidenceLevel)) {
        demonstratedCount++;
        supportingEvidence.push(
          `+ ${skillName} ${studentEv.evidenceLevel.replace('_', ' ')} (${studentEv.title})`,
        );
      } else if (studentEv.evidenceLevel === 'claimed') {
        claimedOrWeakCount++;
        gaps.push(
          `- ${skillName} only self-reported (${studentEv.evidenceLevel}); coursework/project demonstration needed`,
        );
      } else {
        claimedOrWeakCount++;
        gaps.push(`- ${skillName} evidence is weak (${studentEv.title})`);
      }
    } else {
      missingRequiredCount++;
      gaps.push(`- ${skillName} evidence missing (required qualification)`);
    }
  }

  // 2. Evaluate Preferred Skills
  let preferredEarnedPoints = 0;
  let preferredTotalMaxPoints = 0;

  for (const req of preferredReqs) {
    const skill = req.skill || skillById.get(req.skillId);
    const skillName = skill ? skill.name : 'Preferred Skill';
    const weight = parseFloat(req.importanceWeight) || 1.0;
    preferredTotalMaxPoints += weight;

    const studentEv = bestEvidenceBySkillId.get(req.skillId);
    if (studentEv) {
      const multiplier = EVIDENCE_LEVEL_WEIGHTS[studentEv.evidenceLevel] ?? 0;
      preferredEarnedPoints += weight * multiplier;

      if (['verified', 'strongly_demonstrated', 'demonstrated'].includes(studentEv.evidenceLevel)) {
        demonstratedCount++;
        supportingEvidence.push(
          `+ ${skillName} preferred qualification demonstrated (${studentEv.title})`,
        );
      }
    } else {
      // Preferred missing is a soft gap
      gaps.push(`- ${skillName} preferred qualification not yet demonstrated`);
    }
  }

  // 3. Calculate Normalized Subscores
  const requiredFraction =
    requiredTotalMaxPoints > 0 ? requiredEarnedPoints / requiredTotalMaxPoints : 1.0;

  const preferredFraction =
    preferredTotalMaxPoints > 0 ? preferredEarnedPoints / preferredTotalMaxPoints : 0.5;

  // Academic breadth: Bonus points for academic evidence (e.g. linked to academic node or course)
  const academicEvidenceCount = evidenceList.filter(
    (e) => e.academicNodeId || e.courseId || e.evidenceSource === 'academic_course',
  ).length;
  const academicFraction = Math.min(academicEvidenceCount / 4, 1.0);

  const rawScore =
    requiredFraction * ROLE_MATCH_WEIGHT_DISTRIBUTION.REQUIRED_SKILLS_WEIGHT * 100 +
    preferredFraction * ROLE_MATCH_WEIGHT_DISTRIBUTION.PREFERRED_SKILLS_WEIGHT * 100 +
    academicFraction * ROLE_MATCH_WEIGHT_DISTRIBUTION.ACADEMIC_BREADTH_WEIGHT * 100;

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Determine Evidence Confidence
  let evidenceConfidence: 'high' | 'medium' | 'low';
  if (
    missingRequiredCount === 0 &&
    (demonstratedCount >= 2 ||
      (requiredReqs.length > 0 && demonstratedCount >= requiredReqs.length))
  ) {
    evidenceConfidence = 'high';
  } else if (demonstratedCount >= 1 && claimedOrWeakCount <= 2) {
    evidenceConfidence = 'medium';
  } else {
    evidenceConfidence = 'low';
  }

  return {
    score,
    supportingEvidence,
    gaps,
    evidenceConfidence,
    disclaimer: ROLE_MATCH_DISCLAIMER,
  };
}
