import crypto from 'node:crypto';
import type {
  Opportunity,
  Company,
  RoleFamily,
  OpportunityRequirement,
  OpportunitySkillRequirement,
  OpportunityProgramRule,
  StudentCareerProfile,
  StudentSkillEvidence,
  Skill,
  PredictionSnapshot,
  OpportunitySnapshot,
} from '@campusflow/types';

/**
 * Deterministic JSON stringify helper to guarantee stable hashing across platforms.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`,
  );
  return `{${pairs.join(',')}}`;
}

/**
 * Calculate SHA-256 hash of a payload using deterministic stringification.
 */
export function calculateSnapshotHash(payload: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

/**
 * Capture an immutable Prediction Snapshot.
 * Captures all student attributes, coursework, and skill evidence strictly as of `snapshotTimestamp`.
 * Future student edits will NEVER modify this snapshot.
 */
export function createPredictionSnapshot(params: {
  userId: string;
  opportunityId: string;
  profile: StudentCareerProfile | null;
  evidenceList: StudentSkillEvidence[];
  snapshotTimestamp?: Date | string | undefined;
  applicationContext?: Record<string, unknown> | null | undefined;
  id?: string | undefined;
  skillEvidence?: StudentSkillEvidence[] | undefined;
}): PredictionSnapshot {
  const {
    userId,
    opportunityId,
    profile,
    evidenceList = params.skillEvidence ?? [],
    snapshotTimestamp = new Date().toISOString(),
    applicationContext = null,
    id = crypto.randomUUID(),
  } = params;

  const timestampIso =
    typeof snapshotTimestamp === 'string' ? snapshotTimestamp : snapshotTimestamp.toISOString();

  // 1. Education Snapshot
  const educationSnapshot = {
    degreeLevel: profile?.degreeLevel ?? null,
    major: profile?.major ?? null,
    university: profile?.university ?? null,
    currentYearOfStudy: profile?.currentYearOfStudy ?? null,
    gpa: profile?.gpa ?? null,
    isEnrolled: profile?.isEnrolled ?? true,
    workAuthorization: profile?.workAuthorization ?? null,
  };

  // 2. Graduation Timing
  const graduationTiming = {
    graduationYear: profile?.graduationYear ?? null,
    graduationMonth: profile?.graduationMonth ?? null,
  };

  // 3. Academic Evidence Snapshot (courses, verified academic nodes)
  const academicEvidenceSnapshot = evidenceList
    .filter((e) => e.courseId || e.academicNodeId || e.evidenceSource === 'academic_course')
    .map((e) => ({
      id: e.id,
      courseId: e.courseId ?? null,
      academicNodeId: e.academicNodeId ?? null,
      title: e.title,
      grade:
        (e as unknown as { verificationDetails?: { grade?: string } })?.verificationDetails
          ?.grade ?? null,
      verifiedAt: e.verifiedAt ? new Date(e.verifiedAt).toISOString() : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 4. Skill Evidence Snapshot
  const skillEvidenceSnapshot = evidenceList
    .map((e) => ({
      id: e.id,
      skillId: e.skillId,
      evidenceLevel: e.evidenceLevel,
      evidenceSource: e.evidenceSource,
      confidenceScore:
        typeof e.confidenceScore === 'string'
          ? parseFloat(e.confidenceScore)
          : Number(e.confidenceScore) || 0.4,
      title: e.title,
      verifiedAt: e.verifiedAt ? new Date(e.verifiedAt).toISOString() : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 5. Project Evidence Snapshot
  const projectEvidenceSnapshot = evidenceList
    .filter(
      (e) =>
        e.artifactUrl ||
        e.evidenceSource === 'project' ||
        e.evidenceSource === 'competition_hackathon',
    )
    .map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description ?? null,
      artifactUrl: e.artifactUrl ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 6. Experience Snapshot
  const experienceSnapshot = {
    yearsExperience: profile?.yearsExperience ?? '0.0',
  };

  // 7. Target Context
  const targetContext = {
    targetCareerPath: profile?.targetCareerPath ?? null,
    targetGeography: profile?.targetGeography ?? [],
    targetRecruitingPeriod: profile?.targetRecruitingPeriod ?? null,
  };

  const hashPayload = {
    userId,
    opportunityId,
    snapshotTimestamp: timestampIso,
    educationSnapshot,
    graduationTiming,
    academicEvidenceSnapshot,
    skillEvidenceSnapshot,
    projectEvidenceSnapshot,
    experienceSnapshot,
    targetContext,
  };

  const contentHash = calculateSnapshotHash(hashPayload);

  return {
    id,
    userId,
    opportunityId,
    snapshotTimestamp: timestampIso,
    educationSnapshot,
    graduationTiming,
    academicEvidenceSnapshot,
    skillEvidenceSnapshot,
    projectEvidenceSnapshot,
    experienceSnapshot,
    targetContext,
    applicationContext,
    contentHash,
    createdAt: timestampIso,
  };
}

/**
 * Capture an immutable Opportunity Snapshot.
 * Captures all role criteria, skills, and rules as of application/prediction time.
 * Later updates to the opportunity listing will NEVER modify historical snapshots.
 */
export function createOpportunitySnapshot(params: {
  opportunity: Opportunity;
  company: Company;
  roleFamily: RoleFamily;
  requirements?: OpportunityRequirement[] | undefined;
  skillRequirements?: Array<OpportunitySkillRequirement & { skill?: Skill }> | undefined;
  programRules?: OpportunityProgramRule[] | undefined;
  snapshotTimestamp?: Date | string | undefined;
  id?: string | undefined;
}): OpportunitySnapshot {
  const {
    opportunity,
    company,
    roleFamily,
    requirements: _requirements = [],
    skillRequirements = [],
    programRules = [],
    snapshotTimestamp = new Date().toISOString(),
    id = crypto.randomUUID(),
  } = params;

  const timestampIso =
    typeof snapshotTimestamp === 'string' ? snapshotTimestamp : snapshotTimestamp.toISOString();

  const requiredSkills = skillRequirements
    .filter((sr) => sr.requirementType === 'required')
    .map((sr) => ({
      skillId: sr.skillId,
      skillName: sr.skill?.name ?? undefined,
      requirementType: sr.requirementType,
      importanceWeight: sr.importanceWeight,
      minProficiency: sr.minProficiency,
    }))
    .sort((a, b) => a.skillId.localeCompare(b.skillId));

  const preferredSkills = skillRequirements
    .filter((sr) => sr.requirementType === 'preferred' || sr.requirementType === 'bonus')
    .map((sr) => ({
      skillId: sr.skillId,
      skillName: sr.skill?.name ?? undefined,
      requirementType: sr.requirementType,
      importanceWeight: sr.importanceWeight,
      minProficiency: sr.minProficiency,
    }))
    .sort((a, b) => a.skillId.localeCompare(b.skillId));

  const formattedProgramRules = programRules
    .map((pr) => ({
      ruleType: pr.ruleType,
      ruleValue: pr.ruleValue,
    }))
    .sort((a, b) => a.ruleType.localeCompare(b.ruleType));

  const sourceProvenance = {
    sourceUrl: opportunity.sourceUrl,
    sourceOrganization: opportunity.sourceOrganization,
    retrievalTimestamp:
      typeof opportunity.retrievalTimestamp === 'string'
        ? opportunity.retrievalTimestamp
        : opportunity.retrievalTimestamp.toISOString(),
    extractionVersion: opportunity.extractionVersion,
  };

  const hashPayload = {
    opportunityId: opportunity.id,
    companyId: company.id,
    roleFamilyId: roleFamily.id,
    title: opportunity.title,
    opportunityType: opportunity.opportunityType,
    season: opportunity.season,
    targetGraduationYears: opportunity.targetGraduationYears,
    degreeLevels: opportunity.degreeLevels,
    allowedMajors: opportunity.allowedMajors,
    minGpa: opportunity.minGpa,
    requiresWorkAuth: opportunity.requiresWorkAuth,
    requiredSkills,
    preferredSkills,
    programRules: formattedProgramRules,
    sourceProvenance,
  };

  const contentHash = calculateSnapshotHash(hashPayload);

  return {
    id,
    opportunityId: opportunity.id,
    snapshotTimestamp: timestampIso,
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
    },
    role: {
      title: opportunity.title,
      opportunityType: opportunity.opportunityType,
      season: opportunity.season,
      employmentType: opportunity.employmentType,
      workplaceType: opportunity.workplaceType,
    },
    roleFamily: {
      id: roleFamily.id,
      name: roleFamily.name,
      slug:
        (roleFamily as unknown as { slug?: string }).slug ??
        roleFamily.name.toLowerCase().replace(/\s+/g, '-'),
    },
    eligibilityRules: {
      targetGraduationYears: opportunity.targetGraduationYears,
      degreeLevels: opportunity.degreeLevels,
      allowedMajors: opportunity.allowedMajors,
      minGpa: opportunity.minGpa,
      requiresWorkAuth: opportunity.requiresWorkAuth,
    },
    requiredSkills,
    preferredSkills,
    programRules: formattedProgramRules,
    sourceProvenance,
    contentHash,
    createdAt: timestampIso,
  };
}
