import type {
  Course,
  AcademicNode,
  Assessment,
  Resource,
  Skill,
  StudentSkillEvidence,
  SkillEvidenceLevel,
  SkillEvidenceSource,
} from '@campusflow/types';
import { resolveSkillName, type ConceptMappingItem } from './skill-mapping.js';

export const EVIDENCE_RANK: Record<SkillEvidenceLevel, number> = {
  verified: 5,
  strongly_demonstrated: 4,
  demonstrated: 3,
  weak: 2,
  claimed: 1,
  unknown: 0,
};

export interface ExtractedEvidenceCandidate {
  skillId: string;
  skillName: string;
  evidenceLevel: SkillEvidenceLevel;
  evidenceSource: SkillEvidenceSource;
  academicNodeId: string | null;
  courseId: string | null;
  assessmentId: string | null;
  title: string;
  description: string;
  confidenceScore: string;
}

/**
 * Extracts student skill evidence from Academic Brain entities (courses, syllabus nodes, assessments, projects).
 *
 * CRITICAL RULE:
 * Mere document upload into resources does NOT prove academic mastery.
 * Evidence strength requires structured syllabus topics, course completion, or assessment evidence.
 */
export function extractEvidenceFromAcademicBrain(params: {
  userId: string;
  courses: Course[];
  academicNodes: AcademicNode[];
  assessments: Assessment[];
  resources: Resource[];
  skills: Skill[];
  conceptMappings: readonly ConceptMappingItem[];
  existingEvidence?: StudentSkillEvidence[] | undefined;
}): ExtractedEvidenceCandidate[] {
  const { courses, academicNodes, assessments, resources, skills, conceptMappings } = params;

  const skillByName = new Map<string, Skill>();
  for (const s of skills) {
    skillByName.set(s.name.toLowerCase(), s);
  }

  const candidatesMap = new Map<string, ExtractedEvidenceCandidate>();

  const addCandidate = (cand: ExtractedEvidenceCandidate) => {
    const existing = candidatesMap.get(cand.skillId);
    if (!existing) {
      candidatesMap.set(cand.skillId, cand);
      return;
    }

    const curRank = EVIDENCE_RANK[existing.evidenceLevel] ?? 0;
    const newRank = EVIDENCE_RANK[cand.evidenceLevel] ?? 0;

    // Prefer higher evidence level; if equal, prefer assessment over topic
    if (newRank > curRank) {
      candidatesMap.set(cand.skillId, cand);
    } else if (newRank === curRank && cand.assessmentId && !existing.assessmentId) {
      candidatesMap.set(cand.skillId, cand);
    }
  };

  // 1. Process Academic Nodes (Syllabus topics)
  for (const node of academicNodes) {
    const course = courses.find((c) => c.id === node.courseId);
    const resolved = resolveSkillName(node.title, skills, conceptMappings);

    let targetSkill = skillByName.get(resolved.normalizedName.toLowerCase());
    if (!targetSkill && resolved.mapping) {
      targetSkill = skillByName.get(resolved.mapping.skillName.toLowerCase());
    }

    if (!targetSkill && resolved.source === 'unmapped') continue;

    const skillId =
      targetSkill?.id ??
      `skill-${(resolved.mapping?.skillName || resolved.normalizedName).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const skillName = targetSkill?.name ?? (resolved.mapping?.skillName || resolved.normalizedName);

    // Check if there are assessments in this course
    const courseAssessments = assessments.filter((a) => a.courseId === node.courseId);
    const hasAssessments = courseAssessments.length > 0;

    // Identify if assessment is a major exam (CAT, FAT, Final)
    const majorAssessment = courseAssessments.find((a) => {
      const assessmentRecord = a as { type?: string; category?: string };
      const t = (assessmentRecord.type || assessmentRecord.category || '').toLowerCase();
      const title = a.title.toLowerCase();
      return (
        t.includes('fat') ||
        t.includes('cat') ||
        t.includes('final') ||
        title.includes('final') ||
        title.includes('exam')
      );
    });

    const isProjectCourse =
      (course?.title.toLowerCase().includes('project') ||
        course?.title.toLowerCase().includes('lab') ||
        course?.title.toLowerCase().includes('practicum')) ??
      false;

    let evidenceLevel: SkillEvidenceLevel = 'demonstrated';
    let evidenceSource: SkillEvidenceSource = 'course_topic';
    let confidenceScore = '0.750';
    let assessmentId: string | null = null;
    let title = `Demonstrated via topic "${node.title}" in ${course?.code || 'coursework'}`;

    if (majorAssessment) {
      evidenceLevel = 'strongly_demonstrated';
      evidenceSource = 'assessment';
      confidenceScore = '0.900';
      assessmentId = majorAssessment.id;
      title = `Assessed via ${majorAssessment.title} (${course?.code || 'Course'})`;
    } else if (hasAssessments) {
      evidenceLevel = 'demonstrated';
      evidenceSource = 'assessment';
      confidenceScore = '0.800';
      assessmentId = courseAssessments[0]!.id;
      title = `Demonstrated with assessment in ${course?.code || 'Course'}`;
    } else if (isProjectCourse) {
      evidenceLevel = 'strongly_demonstrated';
      evidenceSource = 'project';
      confidenceScore = '0.850';
      title = `Hands-on project coursework in ${course?.code || 'Course'}: ${node.title}`;
    }

    addCandidate({
      skillId,
      skillName,
      evidenceLevel,
      evidenceSource,
      academicNodeId: node.id,
      courseId: node.courseId,
      assessmentId,
      title,
      description: `Academic Second Brain evidence derived from verified syllabus topic and coursework in ${course?.title || 'academic study'}.`,
      confidenceScore,
    });
  }

  // 2. Process Standalone Assessments (e.g. Hackathons, Competitions, Capstones)
  for (const a of assessments) {
    const assessmentRecord = a as { type?: string; category?: string };
    const aType = (assessmentRecord.type || assessmentRecord.category || '').toLowerCase();
    const isCompetition = aType.includes('hackathon') || aType.includes('competition');
    const isProject = aType.includes('project') || aType.includes('capstone');

    if (isCompetition || isProject) {
      const resolved = resolveSkillName(a.title, skills, conceptMappings);
      const targetSkill = skillByName.get(resolved.normalizedName.toLowerCase());

      if (targetSkill) {
        addCandidate({
          skillId: targetSkill.id,
          skillName: targetSkill.name,
          evidenceLevel: isCompetition ? 'verified' : 'strongly_demonstrated',
          evidenceSource: isCompetition ? 'competition_hackathon' : 'project',
          academicNodeId: null,
          courseId: a.courseId,
          assessmentId: a.id,
          title: `${isCompetition ? 'Competition' : 'Project'}: ${a.title}`,
          description: `Demonstrated through competitive achievement or technical project milestone.`,
          confidenceScore: isCompetition ? '0.950' : '0.850',
        });
      }
    }
  }

  // 3. Document Upload Verification Guard:
  // If resources exist without academic nodes or course assessments,
  // do NOT promote mere file presence to demonstrated mastery!
  // Document uploads without parsed topics or evaluations remain 'weak' or uncredited.
  for (const r of resources) {
    // If the resource is unassociated or has no syllabus nodes, confirm it does not grant mastery
    const hasNodes = academicNodes.some((n) => n.courseId === r.courseId);
    if (!hasNodes) {
      // Intentionally do not add as demonstrated mastery!
      // This enforces the rule: "Do not convert mere document upload into proof of mastery."
    }
  }

  return Array.from(candidatesMap.values());
}
