import { createHash } from 'node:crypto';
import type {
  RawOpportunityPayload,
  NormalizedOpportunity,
  Opportunity,
  OpportunityProvider,
  RequirementCategory,
  OpportunityStatus,
  SkillCategory,
  SkillRequirementType,
  SkillProficiencyLevel,
  EmploymentType,
  WorkplaceType,
  WorkAuthRequirement,
} from '@campusflow/types';

/**
 * Deterministic Content Hash Calculation
 * Calculates a SHA-256 hash over canonical opportunity attributes so changes in job postings
 * can be accurately detected without false updates.
 */
export function calculateOpportunityContentHash(data: {
  title: string;
  companySlug?: string | null | undefined;
  roleFamilyName?: string | null | undefined;
  description?: string | null | undefined;
  targetGraduationYears?: number[] | undefined;
  degreeLevels?: string[] | undefined;
  allowedMajors?: string[] | undefined;
  season?: string | null | undefined;
  employmentType?: string | undefined;
  workplaceType?: string | undefined;
  minExperienceMonths?: number | undefined;
  minGpa?: string | null | undefined;
  requiresWorkAuth?: string | undefined;
  requirements?: Array<{ category: string; description: string; isMandatory: boolean }> | undefined;
  skills?:
    | Array<{ name: string; requirementType: string; importanceWeight?: string | undefined }>
    | undefined;
  locations?:
    | Array<{
        country: string;
        city?: string | null | undefined;
        stateProvince?: string | null | undefined;
        isRemote: boolean;
      }>
    | undefined;
}): string {
  const normalized = {
    title: (data.title || '').trim().toLowerCase(),
    companySlug: (data.companySlug || '').trim().toLowerCase(),
    roleFamilyName: (data.roleFamilyName || '').trim().toLowerCase(),
    description: (data.description || '').trim(),
    targetGraduationYears: [...(data.targetGraduationYears || [])].sort((a, b) => a - b),
    degreeLevels: [...(data.degreeLevels || [])].map((d) => d.toLowerCase()).sort(),
    allowedMajors: [...(data.allowedMajors || [])].map((m) => m.toLowerCase()).sort(),
    season: (data.season || '').trim().toLowerCase(),
    employmentType: data.employmentType || 'internship',
    workplaceType: data.workplaceType || 'onsite',
    minExperienceMonths: data.minExperienceMonths || 0,
    minGpa: data.minGpa || null,
    requiresWorkAuth: data.requiresWorkAuth || 'any',
    requirements: [...(data.requirements || [])]
      .map((r) => ({
        category: r.category,
        description: r.description.trim().toLowerCase(),
        isMandatory: r.isMandatory,
      }))
      .sort((a, b) => a.description.localeCompare(b.description)),
    skills: [...(data.skills || [])]
      .map((s) => ({
        name: s.name.trim().toLowerCase(),
        requirementType: s.requirementType,
        importanceWeight: s.importanceWeight || '1.00',
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    locations: [...(data.locations || [])]
      .map((l) => ({
        city: (l.city || '').toLowerCase(),
        country: l.country.toUpperCase(),
        isRemote: l.isRemote,
      }))
      .sort((a, b) => (a.city + a.country).localeCompare(b.city + b.country)),
  };

  const jsonString = JSON.stringify(normalized);
  return createHash('sha256').update(jsonString, 'utf8').digest('hex');
}

export const computeOpportunityContentHash = calculateOpportunityContentHash;

/**
 * Official Employer Source Provider
 * Normalizes postings from official employer career portals and feeds.
 */
export class OfficialEmployerSourceProvider implements OpportunityProvider {
  public readonly name: string;
  public readonly organization: string;
  private readonly mockPayloads: RawOpportunityPayload[];

  constructor(options?: {
    name?: string;
    organization?: string;
    seedPayloads?: RawOpportunityPayload[];
  }) {
    this.name = options?.name || 'official_direct';
    this.organization = options?.organization || 'Official Employer Career Feeds';
    this.mockPayloads = options?.seedPayloads || [];
  }

  async fetchOpportunities(): Promise<RawOpportunityPayload[]> {
    return this.mockPayloads;
  }

  normalize(raw: RawOpportunityPayload): NormalizedOpportunity {
    return this.normalizeOpportunity(raw);
  }

  normalizeOpportunity(raw: RawOpportunityPayload): NormalizedOpportunity {
    const publicationDate = raw.publicationDate
      ? typeof raw.publicationDate === 'string'
        ? new Date(raw.publicationDate)
        : raw.publicationDate
      : null;

    const expirationDate = raw.expirationDate
      ? typeof raw.expirationDate === 'string'
        ? new Date(raw.expirationDate)
        : raw.expirationDate
      : null;

    // Detect expiration based on date
    const isExpired = expirationDate !== null && expirationDate.getTime() <= Date.now();
    const status: OpportunityStatus = isExpired ? 'expired' : 'active';

    const normalizedReqs: NormalizedOpportunity['requirements'] = (raw.requirements || []).map(
      (r) => ({
        category: r.category as RequirementCategory,
        description: r.description,
        isMandatory: r.isMandatory,
        parsedRule: r.parsedRule || null,
      }),
    );

    const normalizedSkills: NormalizedOpportunity['skills'] = (raw.skills || []).map((s) => ({
      name: s.name.trim(),
      category: (s.category || 'concept') as SkillCategory,
      requirementType: (s.requirementType || 'required') as SkillRequirementType,
      importanceWeight: s.importanceWeight || '1.00',
      minProficiency: (s.minProficiency || 'proficient') as SkillProficiencyLevel,
    }));

    const normalizedLocations = (raw.locations || []).map((loc) => ({
      city: loc.city || null,
      stateProvince: loc.stateProvince || null,
      country: loc.country || 'US',
      isRemote: Boolean(loc.isRemote),
    }));

    const companySlug = (
      raw.companySlug || raw.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    )
      .trim()
      .toLowerCase();
    const roleFamilyName = (raw.roleFamilyName || 'Software Engineering').trim();

    const contentHash = calculateOpportunityContentHash({
      title: raw.title,
      companySlug,
      roleFamilyName,
      description: raw.description,
      targetGraduationYears: raw.targetGraduationYears,
      degreeLevels: raw.degreeLevels,
      allowedMajors: raw.allowedMajors,
      season: raw.season,
      employmentType: raw.employmentType,
      workplaceType: raw.workplaceType,
      minExperienceMonths: raw.minExperienceMonths,
      minGpa: raw.minGpa,
      requiresWorkAuth: raw.requiresWorkAuth,
      requirements: normalizedReqs,
      skills: normalizedSkills,
      locations: normalizedLocations,
    });

    return {
      title: raw.title.trim(),
      companySlug,
      companyName: raw.companyName.trim(),
      roleFamilyName,
      opportunityType: raw.opportunityType || 'internship',
      targetGraduationYears: raw.targetGraduationYears || [],
      degreeLevels: (raw.degreeLevels || []).map((d) => d.toLowerCase()),
      allowedMajors: raw.allowedMajors || [],
      description: raw.description || null,
      season: raw.season || null,
      employmentType: (raw.employmentType || 'internship') as EmploymentType,
      workplaceType: (raw.workplaceType || 'hybrid') as WorkplaceType,
      status,
      minGpa: raw.minGpa || null,
      minExperienceMonths: raw.minExperienceMonths || 0,
      requiresWorkAuth: (raw.requiresWorkAuth || 'any') as WorkAuthRequirement,
      sourceUrl: raw.sourceUrl,
      sourceOrganization: raw.sourceOrganization || raw.companyName || this.organization,
      publicationDate,
      expirationDate,
      contentHash,
      extractionVersion: raw.extractionVersion || 'v1.0-official',
      ingestionProvider: this.name,
      isCanonical: true,
      locations: normalizedLocations,
      requirements: normalizedReqs,
      skills: normalizedSkills,
      rawJson: raw.rawJson,
    };
  }

  extractRequirements(normalized: NormalizedOpportunity) {
    return {
      requirements: normalized.requirements,
      skills: normalized.skills,
    };
  }

  calculateContentHash(payload: unknown): string {
    return calculateOpportunityContentHash(
      payload as Parameters<typeof calculateOpportunityContentHash>[0],
    );
  }

  detectChangedOrExpired(
    existing: Opportunity,
    incomingHash: string,
    incomingData: NormalizedOpportunity,
  ): { changed: boolean; expired: boolean } {
    const isExpired =
      incomingData.status === 'expired' ||
      (existing.expirationDate !== null && existing.expirationDate.getTime() <= Date.now()) ||
      (incomingData.expirationDate !== null && incomingData.expirationDate.getTime() <= Date.now());

    const isChanged = (existing.contentHash || '') !== incomingHash;

    return {
      changed: isChanged,
      expired: isExpired,
    };
  }
}
