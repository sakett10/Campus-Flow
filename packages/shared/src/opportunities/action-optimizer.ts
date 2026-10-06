import type {
  Opportunity,
  OpportunitySkillRequirement,
  Skill,
  StudentSkillEvidence,
  AcademicNode,
  Course,
  ActionOptimizerItem,
  SkillEvidenceLevel,
} from '@campusflow/types';
import { EVIDENCE_LEVEL_WEIGHTS } from './role-match.js';
import type { ConceptMappingItem } from './skill-mapping.js';

export function computeActionOptimization(params: {
  opportunities: Array<{
    opportunity: Opportunity;
    skillRequirements: Array<OpportunitySkillRequirement & { skill?: Skill }>;
  }>;
  skills: Skill[];
  studentEvidence: StudentSkillEvidence[];
  courses: Course[];
  academicNodes: AcademicNode[];
  conceptSkillMappings?: readonly ConceptMappingItem[] | undefined;
}): ActionOptimizerItem[] {
  const { opportunities, skills, studentEvidence, courses, academicNodes, conceptSkillMappings } =
    params;

  const skillById = new Map<string, Skill>();
  for (const s of skills) {
    skillById.set(s.id, s);
  }

  // Best evidence level per skillId for student
  const studentEvidenceMap = new Map<string, StudentSkillEvidence>();
  for (const ev of studentEvidence) {
    const existing = studentEvidenceMap.get(ev.skillId);
    if (!existing) {
      studentEvidenceMap.set(ev.skillId, ev);
    } else {
      const curScore = EVIDENCE_LEVEL_WEIGHTS[existing.evidenceLevel] ?? 0;
      const newScore = EVIDENCE_LEVEL_WEIGHTS[ev.evidenceLevel] ?? 0;
      if (newScore > curScore) {
        studentEvidenceMap.set(ev.skillId, ev);
      }
    }
  }

  // Count demand for each skill across opportunities
  interface SkillDemand {
    skillId: string;
    requiredCount: number;
    preferredCount: number;
    totalOpportunities: number;
  }

  const demandMap = new Map<string, SkillDemand>();

  for (const opp of opportunities) {
    const seenInOpp = new Set<string>();
    for (const req of opp.skillRequirements) {
      if (seenInOpp.has(req.skillId)) continue;
      seenInOpp.add(req.skillId);

      const d = demandMap.get(req.skillId) || {
        skillId: req.skillId,
        requiredCount: 0,
        preferredCount: 0,
        totalOpportunities: 0,
      };

      if (req.requirementType === 'required') {
        d.requiredCount++;
      } else {
        d.preferredCount++;
      }
      d.totalOpportunities++;
      demandMap.set(req.skillId, d);
    }
  }

  const recommendations: ActionOptimizerItem[] = [];

  for (const [skillId, demand] of demandMap.entries()) {
    const skill = skillById.get(skillId);
    if (!skill) continue;

    const studentEv = studentEvidenceMap.get(skillId);
    const currentEvidenceLevel: SkillEvidenceLevel | 'none' = studentEv
      ? studentEv.evidenceLevel
      : 'none';

    // If student already has verified or strongly_demonstrated evidence, this is not a gap
    if (currentEvidenceLevel === 'verified' || currentEvidenceLevel === 'strongly_demonstrated') {
      continue;
    }

    // Determine impact
    let impact: 'high' | 'medium' | 'low';
    if (
      demand.requiredCount >= 2 ||
      (opportunities.length > 0 && demand.requiredCount / opportunities.length >= 0.4)
    ) {
      impact = 'high';
    } else if (demand.requiredCount >= 1 || demand.preferredCount >= 2) {
      impact = 'medium';
    } else {
      impact = 'low';
    }

    // Attempt to map to student's academic knowledge graph or enrolled courses
    const mappedConcepts = (conceptSkillMappings || [])
      .filter((m) => m.skillName.toLowerCase() === skill.name.toLowerCase())
      .map((m) => m.conceptName.toLowerCase());

    const searchTerms = [
      skill.name.toLowerCase(),
      ...(skill.synonyms || []).map((s) => s.toLowerCase()),
      ...mappedConcepts,
      ...skill.name
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 4),
    ];

    const matchedCourse = courses.find((c) => {
      const courseTitle = c.title.toLowerCase();
      const courseCode = c.code.toLowerCase();
      return searchTerms.some((term) => courseTitle.includes(term) || courseCode.includes(term));
    });

    const matchedNode = academicNodes.find((node) => {
      if (matchedCourse && node.courseId === matchedCourse.id) {
        return true;
      }
      const nodeTitle = node.title.toLowerCase();
      const nodeDesc = (node.description || '').toLowerCase();
      return searchTerms.some((term) => nodeTitle.includes(term) || nodeDesc.includes(term));
    });

    let recommendedAction = '';
    if (currentEvidenceLevel === 'none') {
      if (matchedNode) {
        recommendedAction = `Build verified evidence by linking coursework or project artifacts from topic "${matchedNode.title}".`;
      } else if (matchedCourse) {
        recommendedAction = `Demonstrate ${skill.name} through lab assignments or course projects in ${matchedCourse.code} (${matchedCourse.title}).`;
      } else {
        recommendedAction = `Demonstrate ${skill.name} through a public GitHub project or technical writeup.`;
      }
    } else if (currentEvidenceLevel === 'claimed') {
      recommendedAction = `Upgrade self-reported claim to demonstrated by attaching concrete project code or course assessment results.`;
    } else {
      recommendedAction = `Strengthen weak evidence by adding comprehensive testing, documentation, or verifiable deployment artifacts.`;
    }

    recommendations.push({
      skillId,
      skillName: skill.name,
      category: skill.category,
      impact,
      targetOpportunitiesCount: demand.totalOpportunities,
      currentEvidenceLevel,
      recommendedAction,
      academicConnection:
        matchedNode || matchedCourse
          ? {
              courseId: matchedCourse?.id,
              courseCode: matchedCourse?.code,
              nodeId: matchedNode?.id,
              nodeTitle: matchedNode?.title,
            }
          : undefined,
    });
  }

  // Sort by impact (high > medium > low), then by targetOpportunitiesCount descending
  const impactOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  recommendations.sort((a, b) => {
    const diff = (impactOrder[b.impact] ?? 0) - (impactOrder[a.impact] ?? 0);
    if (diff !== 0) return diff;
    return b.targetOpportunitiesCount - a.targetOpportunitiesCount;
  });

  return recommendations;
}
