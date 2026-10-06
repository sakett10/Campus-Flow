import type {
  NormalizedOpportunity,
  OpportunityProvider,
  OpportunityUpsertResult,
  Opportunity,
  Company,
  RoleFamily,
  Skill,
  RequirementCategory,
  SkillRequirementType,
  SkillProficiencyLevel,
  RawOpportunityPayload,
} from '@campusflow/types';

export interface IngestionDataStore {
  listOpportunities(filters?: {
    roleFamilyId?: string;
    opportunityType?: string;
    status?: string;
    companyId?: string;
  }): Promise<Opportunity[]>;
  getOpportunity(id: string): Promise<Opportunity | null>;
  findOpportunityBySourceUrl?(sourceUrl: string): Promise<Opportunity | null>;
  createOpportunity(
    data: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<Opportunity>;
  updateOpportunity?(id: string, data: Partial<Opportunity>): Promise<Opportunity>;
  createOpportunityRequirement(data: {
    opportunityId: string;
    category: RequirementCategory;
    description: string;
    isMandatory: boolean;
    parsedRule?: Record<string, unknown> | null;
  }): Promise<unknown>;
  createOpportunitySkillRequirement(data: {
    opportunityId: string;
    skillId: string;
    requirementType: SkillRequirementType;
    minProficiency: SkillProficiencyLevel;
    importanceWeight: string;
    notes?: string | null;
  }): Promise<unknown>;
  createOpportunityLocation(data: {
    opportunityId: string;
    city?: string | null;
    stateProvince?: string | null;
    country: string;
    isRemote: boolean;
  }): Promise<unknown>;
  createOpportunitySource(data: {
    opportunityId: string;
    sourceUrl: string;
    sourceType: string;
    retrievedAt?: Date;
    rawPayload?: Record<string, unknown> | null;
    hash?: string | null;
  }): Promise<unknown>;
  listCompanies(): Promise<Company[]>;
  createCompany(data: {
    name: string;
    slug: string;
    websiteUrl?: string | null;
    description?: string | null;
    industry?: string | null;
    isVerified?: boolean;
  }): Promise<Company>;
  listRoleFamilies(): Promise<RoleFamily[]>;
  listSkills(category?: string): Promise<Skill[]>;
  createSkill(data: {
    name: string;
    category?: Skill['category'];
    synonyms?: string[];
  }): Promise<Skill>;
}

export class OpportunityIngestionService {
  constructor(private readonly store: IngestionDataStore) {}

  async ingestOpportunity(
    normalized: NormalizedOpportunity,
    provider: OpportunityProvider,
  ): Promise<OpportunityUpsertResult> {
    // 1. Resolve or create company
    const companies = await this.store.listCompanies();
    let company = companies.find(
      (c) =>
        c.slug.toLowerCase() === normalized.companySlug.toLowerCase() ||
        c.name.toLowerCase() === normalized.companyName.toLowerCase(),
    );

    if (!company) {
      company = await this.store.createCompany({
        name: normalized.companyName,
        slug: normalized.companySlug,
        websiteUrl: normalized.sourceUrl,
        description: `${normalized.companyName} Careers`,
        industry: 'Technology',
        isVerified: true,
      });
    }

    // 2. Resolve role family
    const roleFamilies = await this.store.listRoleFamilies();
    let roleFamily = roleFamilies.find(
      (rf) => rf.name.toLowerCase() === normalized.roleFamilyName.toLowerCase(),
    );

    if (!roleFamily) {
      // Fallback to Software Engineering if unspecified
      roleFamily = roleFamilies.find((rf) => rf.name === 'Software Engineering') || roleFamilies[0];
      if (!roleFamily) {
        throw new Error('No role families configured in database.');
      }
    }

    // 3. Check for existing opportunity by source URL or (companyId + title + season)
    let existing: Opportunity | null = null;
    if (this.store.findOpportunityBySourceUrl) {
      existing = await this.store.findOpportunityBySourceUrl(normalized.sourceUrl);
    }

    if (!existing) {
      const allOpps = await this.store.listOpportunities({ companyId: company.id });
      existing =
        allOpps.find(
          (o) =>
            o.sourceUrl === normalized.sourceUrl ||
            (o.title.toLowerCase() === normalized.title.toLowerCase() &&
              (o.season || '') === (normalized.season || '')),
        ) || null;
    }

    const now = new Date();

    // 4. Handle Existing Opportunity (Idempotency, Content Changes, Expiration)
    if (existing) {
      const { changed, expired } = provider.detectChangedOrExpired(
        existing,
        normalized.contentHash,
        normalized,
      );

      if (expired && existing.status !== 'expired') {
        if (this.store.updateOpportunity) {
          await this.store.updateOpportunity(existing.id, {
            status: 'expired',
            lastValidTimestamp: now,
            expirationDate: normalized.expirationDate || existing.expirationDate || now,
          });
        }
        return {
          action: 'expired',
          opportunityId: existing.id,
          contentHash: normalized.contentHash,
          title: existing.title,
          companyName: company.name,
        };
      }

      if (changed) {
        if (this.store.updateOpportunity) {
          await this.store.updateOpportunity(existing.id, {
            title: normalized.title,
            opportunityType: normalized.opportunityType,
            targetGraduationYears: normalized.targetGraduationYears,
            degreeLevels: normalized.degreeLevels,
            allowedMajors: normalized.allowedMajors,
            description: normalized.description,
            season: normalized.season,
            employmentType: normalized.employmentType,
            workplaceType: normalized.workplaceType,
            status: normalized.status,
            minGpa: normalized.minGpa,
            minExperienceMonths: normalized.minExperienceMonths,
            requiresWorkAuth: normalized.requiresWorkAuth,
            publicationDate: normalized.publicationDate || existing.publicationDate,
            expirationDate: normalized.expirationDate || existing.expirationDate,
            lastValidTimestamp: now,
            retrievalTimestamp: now,
            contentHash: normalized.contentHash,
            extractionVersion: normalized.extractionVersion,
            ingestionProvider: normalized.ingestionProvider,
          });
        }

        // Record provenance update in opportunity_sources
        await this.store.createOpportunitySource({
          opportunityId: existing.id,
          sourceUrl: normalized.sourceUrl,
          sourceType: 'official_ats_update',
          retrievedAt: now,
          rawPayload: normalized.rawJson || null,
          hash: normalized.contentHash,
        });

        return {
          action: 'updated',
          status: 'updated',
          opportunityId: existing.id,
          contentHash: normalized.contentHash,
          title: normalized.title,
          companyName: company.name,
        };
      }

      // If unchanged, refresh lastValidTimestamp and retrievalTimestamp
      if (this.store.updateOpportunity) {
        await this.store.updateOpportunity(existing.id, {
          lastValidTimestamp: now,
          retrievalTimestamp: now,
        });
      }

      return {
        action: 'unchanged',
        status: 'unchanged',
        opportunityId: existing.id,
        contentHash: normalized.contentHash,
        title: existing.title,
        companyName: company.name,
      };
    }

    // 5. Create Brand New Opportunity
    const createdOpp = await this.store.createOpportunity({
      companyId: company.id,
      roleFamilyId: roleFamily.id,
      title: normalized.title,
      opportunityType: normalized.opportunityType,
      targetGraduationYears: normalized.targetGraduationYears,
      degreeLevels: normalized.degreeLevels,
      allowedMajors: normalized.allowedMajors,
      description: normalized.description,
      season: normalized.season,
      employmentType: normalized.employmentType,
      workplaceType: normalized.workplaceType,
      status: normalized.status,
      minGpa: normalized.minGpa,
      minExperienceMonths: normalized.minExperienceMonths,
      requiresWorkAuth: normalized.requiresWorkAuth,
      sourceUrl: normalized.sourceUrl,
      sourceOrganization: normalized.sourceOrganization,
      retrievalTimestamp: now,
      publicationDate: normalized.publicationDate,
      expirationDate: normalized.expirationDate,
      lastValidTimestamp: now,
      extractionVersion: normalized.extractionVersion,
      contentHash: normalized.contentHash,
      ingestionProvider: normalized.ingestionProvider,
      isCanonical: true,
    });

    // 6. Create Requirements
    for (const req of normalized.requirements) {
      await this.store.createOpportunityRequirement({
        opportunityId: createdOpp.id,
        category: req.category,
        description: req.description,
        isMandatory: req.isMandatory,
        parsedRule: req.parsedRule || null,
      });
    }

    // 7. Resolve and Create Skill Requirements
    const existingSkills = await this.store.listSkills();
    const skillByName = new Map<string, Skill>();
    for (const s of existingSkills) {
      skillByName.set(s.name.toLowerCase(), s);
      for (const syn of s.synonyms || []) {
        skillByName.set(syn.toLowerCase(), s);
      }
    }

    for (const skillReq of normalized.skills) {
      let skill = skillByName.get(skillReq.name.toLowerCase());
      if (!skill) {
        skill = await this.store.createSkill({
          name: skillReq.name,
          category: skillReq.category || 'concept',
          synonyms: [],
        });
        skillByName.set(skill.name.toLowerCase(), skill);
      }

      await this.store.createOpportunitySkillRequirement({
        opportunityId: createdOpp.id,
        skillId: skill.id,
        requirementType: skillReq.requirementType,
        minProficiency: skillReq.minProficiency,
        importanceWeight: skillReq.importanceWeight,
        notes: null,
      });
    }

    // 8. Create Locations
    for (const loc of normalized.locations) {
      await this.store.createOpportunityLocation({
        opportunityId: createdOpp.id,
        city: loc.city,
        stateProvince: loc.stateProvince,
        country: loc.country,
        isRemote: loc.isRemote,
      });
    }

    // 9. Record Initial Provenance Source
    await this.store.createOpportunitySource({
      opportunityId: createdOpp.id,
      sourceUrl: normalized.sourceUrl,
      sourceType: 'official_ats',
      retrievedAt: now,
      rawPayload: normalized.rawJson || null,
      hash: normalized.contentHash,
    });

    return {
      action: 'created',
      status: 'created',
      opportunityId: createdOpp.id,
      contentHash: normalized.contentHash,
      title: createdOpp.title,
      companyName: company.name,
    };
  }

  async ingestBatch(
    rawPayloads: RawOpportunityPayload[],
    provider: OpportunityProvider,
  ): Promise<OpportunityUpsertResult[]> {
    const results: OpportunityUpsertResult[] = [];
    for (const raw of rawPayloads) {
      const normalized = provider.normalizeOpportunity(raw);
      const res = await this.ingestOpportunity(normalized, provider);
      results.push(res);
    }
    return results;
  }

  async ingestAll(provider: OpportunityProvider): Promise<OpportunityUpsertResult[]> {
    const rawPayloads = await provider.fetchOpportunities();
    return this.ingestBatch(rawPayloads, provider);
  }
}
