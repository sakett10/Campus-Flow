import { describe, it, expect, beforeEach } from 'vitest';
import {
  OfficialEmployerSourceProvider,
  computeOpportunityContentHash,
} from '../../packages/shared/src/opportunities/sources/provider.js';
import { OpportunityIngestionService } from '../../packages/shared/src/opportunities/sources/ingestion.js';
import { VERIFIED_COMPANIES_SEED } from '../../packages/types/src/index.js';
import type {
  RawOpportunityPayload,
  IngestionDataStore,
} from '../../packages/shared/src/opportunities/sources/ingestion.js';
import type { Company, RoleFamily, Skill, Opportunity } from '../../packages/types/src/index.js';

describe('Canonical Opportunity Ingestion Architecture', () => {
  let provider: OfficialEmployerSourceProvider;

  beforeEach(() => {
    provider = new OfficialEmployerSourceProvider({
      name: 'test-official-provider',
      organization: 'Test Career Portal Provider',
    });
  });

  const createMockStore = (storage: Map<string, Opportunity>): IngestionDataStore => {
    const companies: Company[] = [
      {
        id: 'comp-amazon',
        name: 'Amazon',
        slug: 'amazon',
        industry: 'Technology',
        isVerified: true,
        websiteUrl: 'https://amazon.jobs',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const roleFamilies: RoleFamily[] = [
      {
        id: 'rf-swe',
        name: 'Software Engineering',
        slug: 'software-engineering',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    return {
      listCompanies: async () => companies,
      createCompany: async (c) => {
        const record: Company = {
          id: `comp-${c.slug}`,
          name: c.name,
          slug: c.slug,
          websiteUrl: c.websiteUrl ?? null,
          description: c.description ?? null,
          industry: c.industry ?? null,
          isVerified: c.isVerified ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        companies.push(record);
        return record;
      },
      listRoleFamilies: async () => roleFamilies,
      listSkills: async () => [],
      createSkill: async (s) =>
        ({
          id: `sk-${s.name.toLowerCase()}`,
          name: s.name,
          category: s.category ?? 'concept',
          synonyms: s.synonyms || [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }) as Skill,
      listOpportunities: async () => Array.from(storage.values()),
      getOpportunity: async (id) => {
        for (const item of storage.values()) {
          if (item.id === id) return item;
        }
        return null;
      },
      findOpportunityBySourceUrl: async (url) => storage.get(url) || null,
      createOpportunity: async (opp) => {
        const record: Opportunity = {
          ...opp,
          id: 'opp-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        storage.set(opp.sourceUrl, record);
        return record;
      },
      updateOpportunity: async (id, opp) => {
        let foundKey = '';
        let foundRecord: Opportunity | null = null;
        for (const [key, val] of storage.entries()) {
          if (val.id === id) {
            foundKey = key;
            foundRecord = val;
            break;
          }
        }
        const updated: Opportunity = { ...(foundRecord as Opportunity), ...opp, id };
        if (foundKey) {
          storage.set(foundKey, updated);
        }
        return updated;
      },
      createOpportunityRequirement: async () => ({}),
      createOpportunitySkillRequirement: async () => ({}),
      createOpportunityLocation: async () => ({}),
      createOpportunitySource: async () => ({}),
    };
  };

  describe('Content Hashing and Normalization', () => {
    it('computes deterministic SHA-256 content hash regardless of property order', () => {
      const payload1: RawOpportunityPayload = {
        externalId: 'job-101',
        title: 'Systems Software Engineer',
        companyName: 'Google',
        companySlug: 'google',
        roleFamilyName: 'Software Engineering',
        sourceUrl: 'https://careers.google.com/jobs/results/101',
        sourceOrganization: 'Google',
        opportunityType: 'full_time',
        description: 'Design distributed storage systems and high-throughput networking.',
        degreeLevels: ['bachelors', 'masters'],
        targetGraduationYears: [2026, 2027],
        skills: [
          { name: 'distributed systems', requirementType: 'required' },
          { name: 'go', requirementType: 'required' },
          { name: 'c++', requirementType: 'required' },
        ],
      };

      const payload2: RawOpportunityPayload = {
        title: 'Systems Software Engineer',
        externalId: 'job-101',
        opportunityType: 'full_time',
        companyName: 'Google',
        companySlug: 'google',
        roleFamilyName: 'Software Engineering',
        sourceUrl: 'https://careers.google.com/jobs/results/101',
        sourceOrganization: 'Google',
        description: 'Design distributed storage systems and high-throughput networking.',
        skills: [
          { name: 'distributed systems', requirementType: 'required' },
          { name: 'go', requirementType: 'required' },
          { name: 'c++', requirementType: 'required' },
        ],
        targetGraduationYears: [2026, 2027],
        degreeLevels: ['bachelors', 'masters'],
      };

      const hash1 = computeOpportunityContentHash(payload1);
      const hash2 = computeOpportunityContentHash(payload2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string
    });

    it('detects content changes with a distinct hash', () => {
      const basePayload: RawOpportunityPayload = {
        externalId: 'job-102',
        title: 'Quantitative Research Intern',
        companyName: 'Jane Street',
        companySlug: 'jane-street',
        roleFamilyName: 'Quantitative Trading',
        sourceUrl: 'https://janestreet.com/join-jane-street/position/102',
        sourceOrganization: 'Jane Street',
        opportunityType: 'internship',
        description: 'Work on statistical arbitrage and market modeling.',
        skills: [
          { name: 'probability', requirementType: 'required' },
          { name: 'linear algebra', requirementType: 'required' },
          { name: 'ocaml', requirementType: 'required' },
        ],
      };

      const changedPayload: RawOpportunityPayload = {
        ...basePayload,
        skills: [
          { name: 'probability', requirementType: 'required' },
          { name: 'linear algebra', requirementType: 'required' },
          { name: 'ocaml', requirementType: 'required' },
          { name: 'distributed systems', requirementType: 'required' },
        ],
      };

      const hashBase = computeOpportunityContentHash(basePayload);
      const hashChanged = computeOpportunityContentHash(changedPayload);

      expect(hashBase).not.toBe(hashChanged);
    });

    it('normalizes raw opportunities with correct provenance and canonical metadata', () => {
      const rawPayload: RawOpportunityPayload = {
        externalId: 'msft-2026-swe',
        title: 'Software Engineer - Campus Graduate',
        companyName: 'Microsoft',
        companySlug: 'microsoft',
        roleFamilyName: 'Software Engineering',
        sourceUrl: 'https://careers.microsoft.com/us/en/job/2026swe',
        sourceOrganization: 'Microsoft',
        opportunityType: 'full_time',
        description: 'Build cloud infrastructure on Azure using TypeScript and C#.',
        skills: [
          { name: 'Cloud Computing', requirementType: 'required' },
          { name: 'TypeScript', requirementType: 'required' },
          { name: 'C#', requirementType: 'required' },
        ],
        degreeLevels: ['bachelors'],
        targetGraduationYears: [2026],
        requiresWorkAuth: 'us_citizen_or_pr',
      };

      const normalized = provider.normalize(rawPayload);

      expect(normalized.title).toBe('Software Engineer - Campus Graduate');
      expect(normalized.companySlug).toBe('microsoft');
      expect(normalized.sourceUrl).toBe('https://careers.microsoft.com/us/en/job/2026swe');
      expect(normalized.sourceOrganization).toBe('Microsoft');
      expect(normalized.ingestionProvider).toBe('test-official-provider');
      expect(normalized.extractionVersion).toBe('v1.0-official');
      expect(normalized.contentHash).toBeDefined();
      expect(normalized.requiresWorkAuth).toBe('us_citizen_or_pr');
    });
  });

  describe('Ingestion Service Idempotency, Changes, and Expiration', () => {
    it('creates new opportunity on initial ingest and returns status created', async () => {
      const storage = new Map<string, Opportunity>();
      const service = new OpportunityIngestionService(createMockStore(storage));

      const raw: RawOpportunityPayload = {
        externalId: 'amzn-sde-intern',
        title: 'SDE Intern',
        companyName: 'Amazon',
        companySlug: 'amazon',
        sourceUrl: 'https://amazon.jobs/en/jobs/sde-intern-2026',
        sourceOrganization: 'Amazon',
        opportunityType: 'internship',
        skills: [
          { name: 'algorithms', requirementType: 'required' },
          { name: 'java', requirementType: 'required' },
        ],
      };

      const normalized = provider.normalize(raw);
      const result = await service.ingestOpportunity(normalized, provider);
      expect(result.action).toBe('created');
      expect(result.contentHash).toBeDefined();
      expect(storage.get(raw.sourceUrl)).toBeDefined();
      expect(storage.get(raw.sourceUrl)?.isCanonical).toBe(true);
    });

    it('idempotently returns unchanged when content hash matches existing opportunity', async () => {
      const storage = new Map<string, Opportunity>();
      const service = new OpportunityIngestionService(createMockStore(storage));

      const raw: RawOpportunityPayload = {
        externalId: 'amzn-sde-intern',
        title: 'SDE Intern',
        companyName: 'Amazon',
        companySlug: 'amazon',
        sourceUrl: 'https://amazon.jobs/en/jobs/sde-intern-2026',
        sourceOrganization: 'Amazon',
        opportunityType: 'internship',
        skills: [
          { name: 'algorithms', requirementType: 'required' },
          { name: 'java', requirementType: 'required' },
        ],
      };

      // 1. Initial ingestion
      const normalized1 = provider.normalize(raw);
      const res1 = await service.ingestOpportunity(normalized1, provider);
      expect(res1.action).toBe('created');

      // 2. Second ingestion with identical content
      const normalized2 = provider.normalize(raw);
      const res2 = await service.ingestOpportunity(normalized2, provider);
      expect(res2.action).toBe('unchanged');
      expect(res2.opportunityId).toBe('opp-1');
      expect(res2.contentHash).toBe(res1.contentHash);
    });

    it('detects updated content and updates opportunity record with new hash', async () => {
      const storage = new Map<string, Opportunity>();
      const service = new OpportunityIngestionService(createMockStore(storage));

      const rawInitial: RawOpportunityPayload = {
        externalId: 'amzn-sde-intern',
        title: 'SDE Intern',
        companyName: 'Amazon',
        companySlug: 'amazon',
        sourceUrl: 'https://amazon.jobs/en/jobs/sde-intern-2026',
        sourceOrganization: 'Amazon',
        opportunityType: 'internship',
        skills: [
          { name: 'algorithms', requirementType: 'required' },
          { name: 'java', requirementType: 'required' },
        ],
      };

      const norm1 = provider.normalize(rawInitial);
      const res1 = await service.ingestOpportunity(norm1, provider);
      expect(res1.action).toBe('created');

      // Updated requirements
      const rawModified: RawOpportunityPayload = {
        ...rawInitial,
        title: 'SDE Intern - Distributed Systems',
        skills: [
          { name: 'algorithms', requirementType: 'required' },
          { name: 'java', requirementType: 'required' },
          { name: 'distributed systems', requirementType: 'required' },
        ],
      };

      const norm2 = provider.normalize(rawModified);
      const res2 = await service.ingestOpportunity(norm2, provider);
      expect(res2.action).toBe('updated');
      expect(res2.contentHash).not.toBe(res1.contentHash);
      expect(storage.get(rawInitial.sourceUrl)?.title).toBe('SDE Intern - Distributed Systems');
    });

    it('marks posting as expired when expiredAt is in the past', async () => {
      const storage = new Map<string, Opportunity>();
      const service = new OpportunityIngestionService(createMockStore(storage));

      const expiredRaw: RawOpportunityPayload = {
        externalId: 'amzn-sde-intern-2025',
        title: 'SDE Intern 2025',
        companyName: 'Amazon',
        companySlug: 'amazon',
        sourceUrl: 'https://amazon.jobs/en/jobs/sde-intern-2025',
        sourceOrganization: 'Amazon',
        opportunityType: 'internship',
        skills: [{ name: 'algorithms', requirementType: 'required' }],
        expirationDate: '2025-09-01T00:00:00.000Z',
      };

      const norm = provider.normalize(expiredRaw);
      const result = await service.ingestOpportunity(norm, provider);
      expect(result.action).toBe('created');
      const saved = storage.get(expiredRaw.sourceUrl);
      expect(saved?.status).toBe('expired');
      expect(saved?.expirationDate).toEqual(new Date('2025-09-01T00:00:00.000Z'));
    });
  });

  describe('Initial Verified Employer Catalogue Seeds', () => {
    it('contains verified employers spanning tech, AI/ML, finance, quant, and consulting', () => {
      expect(VERIFIED_COMPANIES_SEED.length).toBeGreaterThanOrEqual(15);

      const industries = new Set(VERIFIED_COMPANIES_SEED.map((c) => c.industry));
      expect(industries.has('Technology')).toBe(true);
      expect(industries.has('AI/ML')).toBe(true);
      expect(industries.has('Finance')).toBe(true);
      expect(industries.has('Quantitative Finance')).toBe(true);
      expect(industries.has('Consulting')).toBe(true);

      const names = VERIFIED_COMPANIES_SEED.map((c) => c.name);
      expect(names).toContain('Google');
      expect(names).toContain('Microsoft');
      expect(names).toContain('NVIDIA');
      expect(names).toContain('Goldman Sachs');
      expect(names).toContain('Jane Street');
      expect(names).toContain('Citadel');
      expect(names).toContain('McKinsey & Company');
    });

    it('does not contain employer prestige scores or rankings', () => {
      for (const company of VERIFIED_COMPANIES_SEED) {
        const record = company as Record<string, unknown>;
        expect(record['prestigeScore']).toBeUndefined();
        expect(record['tier']).toBeUndefined();
        expect(record['ranking']).toBeUndefined();
        expect(record['score']).toBeUndefined();
      }
    });
  });
});
