import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import {
  AppError,
  evaluateEligibility,
  evaluateRoleMatch,
  evaluateProbability,
  createPredictionSnapshot,
  createOpportunitySnapshot,
  OfficialEmployerSourceProvider,
  OpportunityIngestionService,
} from '@campusflow/shared';
import type {
  OpportunityType,
  OpportunityStatus,
  OpportunityLandscapeSummary,
  RawOpportunityPayload,
  OpportunityUpsertResult,
  PredictionTransparencyRecord,
} from '@campusflow/types';

export const opportunitiesRouter = new Hono();

const createOpportunitySchema = z.object({
  companyId: z.string().uuid('companyId must be a valid UUID'),
  roleFamilyId: z.string().uuid('roleFamilyId must be a valid UUID'),
  title: z.string().min(1, 'Title is required').max(255),
  opportunityType: z.enum(['internship', 'early_career', 'co_op', 'new_grad']),
  targetGraduationYears: z.array(z.number().int()).default([]),
  degreeLevels: z.array(z.string()).default([]),
  allowedMajors: z.array(z.string()).default([]),
  description: z.string().optional().nullable(),
  season: z.string().optional().nullable(),
  employmentType: z.enum(['full_time', 'internship', 'contract']).default('internship'),
  workplaceType: z.enum(['onsite', 'hybrid', 'remote']).default('onsite'),
  status: z.enum(['active', 'closed', 'expired', 'draft']).default('active'),
  minGpa: z.string().optional().nullable(),
  minExperienceMonths: z.number().int().default(0),
  requiresWorkAuth: z
    .enum(['us_citizen_or_pr', 'sponsorship_available', 'no_sponsorship', 'any'])
    .default('any'),
  // Canonical and ingestion fields
  contentHash: z.string().optional().nullable(),
  ingestionProvider: z.string().optional().nullable(),
  isCanonical: z.boolean().default(true),
  // Provenance fields
  sourceUrl: z.string().url('sourceUrl must be a valid URL'),
  sourceOrganization: z.string().min(1, 'sourceOrganization is required'),
  retrievalTimestamp: z.string().datetime().optional(),
  publicationDate: z.string().datetime().optional().nullable(),
  expirationDate: z.string().datetime().optional().nullable(),
  lastValidTimestamp: z.string().datetime().optional().nullable(),
  extractionVersion: z.string().default('v1.0'),
  // Associated sub-entities
  requirements: z
    .array(
      z.object({
        category: z.enum([
          'degree',
          'major',
          'graduation_year',
          'internship_eligibility',
          'location',
          'work_auth',
          'coursework',
          'experience',
          'skill',
          'general',
        ]),
        description: z.string().min(1),
        isMandatory: z.boolean().default(true),
        parsedRule: z.record(z.unknown()).optional().nullable(),
      }),
    )
    .optional(),
  skillRequirements: z
    .array(
      z.object({
        skillId: z.string().uuid(),
        requirementType: z.enum(['required', 'preferred', 'bonus']).default('required'),
        minProficiency: z.enum(['basic', 'proficient', 'advanced']).default('proficient'),
        importanceWeight: z.string().default('1.00'),
        notes: z.string().optional().nullable(),
      }),
    )
    .optional(),
  locations: z
    .array(
      z.object({
        city: z.string().optional().nullable(),
        stateProvince: z.string().optional().nullable(),
        country: z.string().default('US'),
        isRemote: z.boolean().default(false),
      }),
    )
    .optional(),
  programRules: z
    .array(
      z.object({
        ruleType: z.string().min(1),
        ruleValue: z.record(z.unknown()),
        explanation: z.string().optional().nullable(),
      }),
    )
    .optional(),
  sources: z
    .array(
      z.object({
        sourceUrl: z.string().url(),
        sourceType: z.string().default('official_career_page'),
        retrievedAt: z.string().datetime().optional(),
        rawPayload: z.record(z.unknown()).optional().nullable(),
        hash: z.string().optional().nullable(),
      }),
    )
    .optional(),
});

const ingestOpportunitiesSchema = z.object({
  providerName: z.string().optional(),
  opportunities: z.array(
    z.object({
      companyName: z.string().min(1),
      companySlug: z.string().optional(),
      industry: z.string().optional(),
      title: z.string().min(1),
      sourceUrl: z.string().url(),
      sourceOrganization: z.string().min(1),
      opportunityType: z
        .enum(['internship', 'early_career', 'co_op', 'new_grad'])
        .default('internship'),
      targetGraduationYears: z.array(z.number().int()).default([]),
      degreeLevels: z.array(z.string()).default([]),
      allowedMajors: z.array(z.string()).default([]),
      description: z.string().optional(),
      season: z.string().optional(),
      employmentType: z.enum(['full_time', 'internship', 'contract']).default('internship'),
      workplaceType: z.enum(['onsite', 'hybrid', 'remote']).default('onsite'),
      minGpa: z.string().optional(),
      minExperienceMonths: z.number().int().default(0),
      requiresWorkAuth: z
        .enum(['us_citizen_or_pr', 'sponsorship_available', 'no_sponsorship', 'any'])
        .default('any'),
      publicationDate: z.string().datetime().optional(),
      expirationDate: z.string().datetime().optional(),
      extractionVersion: z.string().default('v1.0'),
      locations: z
        .array(
          z.object({
            city: z.string().optional(),
            stateProvince: z.string().optional(),
            country: z.string().default('US'),
            isRemote: z.boolean().default(false),
          }),
        )
        .optional(),
      requirements: z
        .array(
          z.object({
            category: z.enum([
              'degree',
              'major',
              'graduation_year',
              'internship_eligibility',
              'location',
              'work_auth',
              'coursework',
              'experience',
              'skill',
              'general',
            ]),
            description: z.string().min(1),
            isMandatory: z.boolean().default(true),
          }),
        )
        .optional(),
      skills: z
        .array(
          z.object({
            skillName: z.string().min(1),
            category: z
              .enum(['language', 'framework', 'concept', 'tool', 'domain', 'infrastructure'])
              .default('concept'),
            requirementType: z.enum(['required', 'preferred', 'bonus']).default('required'),
            minProficiency: z.enum(['basic', 'proficient', 'advanced']).default('proficient'),
            importanceWeight: z.string().default('1.00'),
          }),
        )
        .optional(),
    }),
  ),
});

// GET /api/v1/opportunities - list opportunities with filters
opportunitiesRouter.get('/', async (c) => {
  const roleFamilyId = c.req.query('roleFamilyId');
  const companyId = c.req.query('companyId');
  const opportunityType = c.req.query('opportunityType') as OpportunityType | undefined;
  const status = c.req.query('status') as OpportunityStatus | undefined;

  const filters: {
    roleFamilyId?: string;
    companyId?: string;
    opportunityType?: OpportunityType;
    status?: OpportunityStatus;
  } = {};
  if (roleFamilyId) filters.roleFamilyId = roleFamilyId;
  if (companyId) filters.companyId = companyId;
  if (opportunityType) filters.opportunityType = opportunityType;
  if (status) filters.status = status;

  const opportunities = await defaultStore.listOpportunities(filters);

  return c.json({
    data: opportunities,
    count: opportunities.length,
  });
});

// GET /api/v1/opportunities/landscape - get high-level landscape statistics for current student
opportunitiesRouter.get('/landscape', async (c) => {
  const session = getSession(c);

  const [opportunities, profile, skills, evidenceList] = await Promise.all([
    defaultStore.listOpportunities({ status: 'active' }),
    defaultStore.getStudentCareerProfile(session.userId),
    defaultStore.listSkills(),
    defaultStore.listStudentSkillEvidence(session.userId),
  ]);

  let eligibleCount = 0;
  let strongMatchesCount = 0;
  let preparationRequiredCount = 0;
  let ineligibleCount = 0;

  for (const opp of opportunities) {
    const [requirements, skillReqs, programRules] = await Promise.all([
      defaultStore.getOpportunityRequirements(opp.id),
      defaultStore.getOpportunitySkillRequirements(opp.id),
      defaultStore.getOpportunityProgramRules(opp.id),
    ]);

    const eligibility = evaluateEligibility({
      opportunity: opp,
      requirements,
      programRules,
      profile,
    });

    if (eligibility.status === 'not_eligible') {
      ineligibleCount++;
    } else {
      eligibleCount++;
      const roleMatch = evaluateRoleMatch({
        opportunity: opp,
        skillRequirements: skillReqs,
        skills,
        evidenceList,
      });

      if (roleMatch.score >= 70) {
        strongMatchesCount++;
      } else {
        preparationRequiredCount++;
      }
    }
  }

  const summary: OpportunityLandscapeSummary = {
    totalDiscovered: opportunities.length,
    eligibleCount,
    strongMatchesCount,
    preparationRequiredCount,
    ineligibleCount,
  };

  return c.json(summary);
});

// GET /api/v1/opportunities/:id - get opportunity detail with provenance and requirements
opportunitiesRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const opportunity = await defaultStore.getOpportunity(id);

  if (!opportunity) {
    throw new AppError('NOT_FOUND', `Opportunity ${id} not found`, 404);
  }

  const [requirements, skillRequirements, locations, programRules, sources] = await Promise.all([
    defaultStore.getOpportunityRequirements(id),
    defaultStore.getOpportunitySkillRequirements(id),
    defaultStore.getOpportunityLocations(id),
    defaultStore.getOpportunityProgramRules(id),
    defaultStore.getOpportunitySources(id),
  ]);

  return c.json({
    ...opportunity,
    requirements,
    skillRequirements,
    locations,
    programRules,
    sources,
  });
});

// POST /api/v1/opportunities - create canonical opportunity (admin or approved provider only)
opportunitiesRouter.post('/', async (c) => {
  const session = getSession(c);
  const ingestionToken = c.req.header('x-ingestion-token');
  const isTrusted =
    session.role === 'admin' ||
    (Boolean(ingestionToken) &&
      Boolean(process.env['OPPORTUNITY_INGESTION_TOKEN']) &&
      ingestionToken === process.env['OPPORTUNITY_INGESTION_TOKEN']);

  if (!isTrusted) {
    throw new AppError(
      'FORBIDDEN',
      'Canonical opportunities can only be created by administrators or approved ingestion providers',
      403,
    );
  }

  const body = await c.req.json();
  const parsed = createOpportunitySchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid opportunity payload', 400, parsed.error.errors);
  }

  const data = parsed.data;

  const opportunity = await defaultStore.createOpportunity({
    companyId: data.companyId,
    roleFamilyId: data.roleFamilyId,
    title: data.title,
    opportunityType: data.opportunityType,
    targetGraduationYears: data.targetGraduationYears,
    degreeLevels: data.degreeLevels,
    allowedMajors: data.allowedMajors,
    description: data.description ?? null,
    season: data.season ?? null,
    employmentType: data.employmentType,
    workplaceType: data.workplaceType,
    status: data.status,
    minGpa: data.minGpa ?? null,
    minExperienceMonths: data.minExperienceMonths,
    requiresWorkAuth: data.requiresWorkAuth,
    contentHash: data.contentHash ?? null,
    ingestionProvider: data.ingestionProvider ?? 'manual_admin',
    isCanonical: data.isCanonical ?? true,
    sourceUrl: data.sourceUrl,
    sourceOrganization: data.sourceOrganization,
    retrievalTimestamp: data.retrievalTimestamp ? new Date(data.retrievalTimestamp) : new Date(),
    publicationDate: data.publicationDate ? new Date(data.publicationDate) : null,
    expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
    lastValidTimestamp: data.lastValidTimestamp ? new Date(data.lastValidTimestamp) : null,
    extractionVersion: data.extractionVersion,
  });

  // Attach requirements if provided
  if (data.requirements && data.requirements.length > 0) {
    for (const req of data.requirements) {
      await defaultStore.createOpportunityRequirement({
        opportunityId: opportunity.id,
        category: req.category,
        description: req.description,
        isMandatory: req.isMandatory,
        parsedRule: req.parsedRule ?? null,
      });
    }
  }

  // Attach skill requirements if provided
  if (data.skillRequirements && data.skillRequirements.length > 0) {
    for (const sr of data.skillRequirements) {
      await defaultStore.createOpportunitySkillRequirement({
        opportunityId: opportunity.id,
        skillId: sr.skillId,
        requirementType: sr.requirementType,
        minProficiency: sr.minProficiency,
        importanceWeight: sr.importanceWeight,
        notes: sr.notes ?? null,
      });
    }
  }

  // Attach locations if provided
  if (data.locations && data.locations.length > 0) {
    for (const loc of data.locations) {
      await defaultStore.createOpportunityLocation({
        opportunityId: opportunity.id,
        city: loc.city ?? null,
        stateProvince: loc.stateProvince ?? null,
        country: loc.country,
        isRemote: loc.isRemote,
      });
    }
  }

  // Attach program rules if provided
  if (data.programRules && data.programRules.length > 0) {
    for (const pr of data.programRules) {
      await defaultStore.createOpportunityProgramRule({
        opportunityId: opportunity.id,
        ruleType: pr.ruleType,
        ruleValue: pr.ruleValue,
        explanation: pr.explanation ?? null,
      });
    }
  }

  // Attach sources if provided
  if (data.sources && data.sources.length > 0) {
    for (const src of data.sources) {
      await defaultStore.createOpportunitySource({
        opportunityId: opportunity.id,
        sourceUrl: src.sourceUrl,
        sourceType: src.sourceType,
        retrievedAt: src.retrievedAt ? new Date(src.retrievedAt) : new Date(),
        rawPayload: src.rawPayload ?? null,
        hash: src.hash ?? null,
      });
    }
  }

  return c.json(opportunity, 201);
});

// POST /api/v1/opportunities/ingest - ingest opportunities from approved provider
opportunitiesRouter.post('/ingest', async (c) => {
  const session = getSession(c);
  const ingestionToken = c.req.header('x-ingestion-token');
  const isTrusted =
    session.role === 'admin' ||
    (Boolean(ingestionToken) &&
      Boolean(process.env['OPPORTUNITY_INGESTION_TOKEN']) &&
      ingestionToken === process.env['OPPORTUNITY_INGESTION_TOKEN']);

  if (!isTrusted) {
    throw new AppError(
      'FORBIDDEN',
      'Canonical opportunity ingestion requires administrator privileges or approved provider credentials',
      403,
    );
  }

  const body = await c.req.json();
  const parsed = ingestOpportunitiesSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid ingestion payload', 400, parsed.error.errors);
  }

  const provider = new OfficialEmployerSourceProvider({
    name: parsed.data.providerName ?? 'official_employer_feed',
    organization: 'Official Careers Feeds',
  });

  const ingestionService = new OpportunityIngestionService(defaultStore);
  const rawList: RawOpportunityPayload[] = parsed.data.opportunities.map((opp) => ({
    companyName: opp.companyName,
    companySlug: opp.companySlug,
    title: opp.title,
    sourceUrl: opp.sourceUrl,
    sourceOrganization: opp.sourceOrganization,
    opportunityType: opp.opportunityType,
    targetGraduationYears: opp.targetGraduationYears,
    degreeLevels: opp.degreeLevels,
    allowedMajors: opp.allowedMajors,
    description: opp.description,
    season: opp.season,
    employmentType: opp.employmentType,
    workplaceType: opp.workplaceType,
    minGpa: opp.minGpa,
    minExperienceMonths: opp.minExperienceMonths,
    requiresWorkAuth: opp.requiresWorkAuth,
    publicationDate: opp.publicationDate ? new Date(opp.publicationDate) : undefined,
    expirationDate: opp.expirationDate ? new Date(opp.expirationDate) : undefined,
    locations: opp.locations,
    requirements: opp.requirements,
    skills: opp.skills?.map((s) => ({
      name: s.skillName,
      category: s.category,
      requirementType: s.requirementType,
      minProficiency: s.minProficiency,
      importanceWeight: s.importanceWeight,
    })),
  }));

  const results = await ingestionService.ingestBatch(rawList, provider);

  return c.json({
    totalProcessed: results.length,
    created: results.filter((r: OpportunityUpsertResult) => r.action === 'created').length,
    updated: results.filter((r: OpportunityUpsertResult) => r.action === 'updated').length,
    unchanged: results.filter((r: OpportunityUpsertResult) => r.action === 'unchanged').length,
    expired: results.filter((r: OpportunityUpsertResult) => r.action === 'expired').length,
    results,
  });
});

// POST /api/v1/opportunities/:id/evaluate - evaluate eligibility, role match, confidence, and gaps
opportunitiesRouter.post('/:id/evaluate', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');

  const opportunity = await defaultStore.getOpportunity(id);
  if (!opportunity) {
    throw new AppError('NOT_FOUND', `Opportunity ${id} not found`, 404);
  }

  const [requirements, skillReqs, programRules, profile, skills, evidenceList] = await Promise.all([
    defaultStore.getOpportunityRequirements(id),
    defaultStore.getOpportunitySkillRequirements(id),
    defaultStore.getOpportunityProgramRules(id),
    defaultStore.getStudentCareerProfile(session.userId),
    defaultStore.listSkills(),
    defaultStore.listStudentSkillEvidence(session.userId),
  ]);

  const eligibility = evaluateEligibility({
    opportunity,
    requirements,
    programRules,
    profile,
  });

  const roleMatch = evaluateRoleMatch({
    opportunity,
    skillRequirements: skillReqs,
    skills,
    evidenceList,
  });

  const hiringProbability = evaluateProbability({
    opportunity,
    profile,
    evidenceList,
  });

  return c.json({
    opportunityId: opportunity.id,
    eligibility,
    roleMatch,
    hiringProbability,
    evaluatedAt: new Date().toISOString(),
  });
});

// GET /api/v1/opportunities/:id/transparency - retrieve complete transparency record
opportunitiesRouter.get('/:id/transparency', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');

  const opportunity = await defaultStore.getOpportunity(id);
  if (!opportunity) {
    throw new AppError('NOT_FOUND', `Opportunity ${id} not found`, 404);
  }

  const [
    company,
    roleFamily,
    requirements,
    skillReqs,
    programRules,
    profile,
    skills,
    evidenceList,
  ] = await Promise.all([
    defaultStore.getCompany(opportunity.companyId),
    defaultStore.getRoleFamily(opportunity.roleFamilyId),
    defaultStore.getOpportunityRequirements(id),
    defaultStore.getOpportunitySkillRequirements(id),
    defaultStore.getOpportunityProgramRules(id),
    defaultStore.getStudentCareerProfile(session.userId),
    defaultStore.listSkills(),
    defaultStore.listStudentSkillEvidence(session.userId),
  ]);

  if (!company || !roleFamily) {
    throw new AppError('INTERNAL_ERROR', 'Opportunity missing company or role family entity', 500);
  }

  // Create immutable snapshot of opportunity as of current state
  const oppSnapshot = createOpportunitySnapshot({
    opportunity,
    company,
    roleFamily,
    requirements,
    skillRequirements: skillReqs,
    programRules,
  });

  // Create immutable snapshot of student state
  const predSnapshot = createPredictionSnapshot({
    userId: session.userId,
    opportunityId: opportunity.id,
    profile,
    evidenceList,
  });

  // Compute hiring probability (which is guarded and currently unavailable per Probability Integrity Rule)
  const hiringProbability = evaluateProbability({
    opportunity,
    profile,
    evidenceList,
  });

  const evidenceProvenance = evidenceList.map((ev) => ({
    title: ev.title,
    skillName: skills.find((s) => s.id === ev.skillId)?.name,
    evidenceLevel: ev.evidenceLevel,
    evidenceSource: ev.evidenceSource,
    verifiedAt: ev.verifiedAt ? new Date(ev.verifiedAt).toISOString() : null,
  }));

  const modelCard =
    hiringProbability.status === 'calculated'
      ? await defaultStore.getModelCard(hiringProbability.metadata.modelVersion)
      : null;

  const record: PredictionTransparencyRecord = {
    opportunityId: opportunity.id,
    prediction: hiringProbability,
    uncertainty:
      hiringProbability.status === 'calculated'
        ? hiringProbability.metadata.uncertaintyInterval
        : null,
    modelVersion:
      hiringProbability.status === 'calculated' ? hiringProbability.metadata.modelVersion : null,
    datasetVersion:
      hiringProbability.status === 'calculated'
        ? hiringProbability.metadata.trainingDatasetVersion
        : null,
    populationDefinition:
      hiringProbability.status === 'calculated'
        ? hiringProbability.metadata.populationDefinition
        : null,
    featureSnapshot: predSnapshot.educationSnapshot as unknown as Record<string, unknown>,
    opportunitySnapshot: oppSnapshot,
    evidenceProvenance,
    comparableSampleSize:
      hiringProbability.status === 'calculated'
        ? hiringProbability.metadata.comparableSampleSize
        : hiringProbability.comparableSampleSize,
    observedPositiveOutcomes:
      hiringProbability.status === 'calculated'
        ? hiringProbability.metadata.observedPositiveOutcomes
        : 0,
    validationMetrics:
      hiringProbability.status === 'calculated'
        ? (hiringProbability.metadata.calibrationMetrics as unknown as Record<string, number>)
        : null,
    calibrationMetrics:
      hiringProbability.status === 'calculated'
        ? (hiringProbability.metadata.calibrationMetrics as unknown as Record<string, unknown>)
        : null,
    knownLimitations:
      hiringProbability.status === 'calculated'
        ? hiringProbability.metadata.knownLimitations
        : [
            'No approved empirical model exists for this specific role population cohort.',
            'Missing outcomes are never treated as rejections.',
            'CampusFlow blocks probability calculation until sufficient verified historical outcomes exist.',
          ],
    unobservedFactors: hiringProbability.unobservedFactors,
    modelCard,
  };

  return c.json(record);
});
