import { Hono } from 'hono';
import { z } from 'zod';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import {
  AppError,
  computeActionOptimization,
  extractEvidenceFromAcademicBrain,
} from '@campusflow/shared';
import type { AcademicNode } from '@campusflow/types';

export const careerRouter = new Hono();

// Schemas
const upsertProfileSchema = z.object({
  targetCareerPath: z.string().max(255).optional().nullable(),
  targetGeography: z.array(z.string()).optional(),
  targetRecruitingPeriod: z.string().max(100).optional().nullable(),
  degreeLevel: z.string().max(100).optional().nullable(),
  major: z.string().max(255).optional().nullable(),
  university: z.string().max(255).optional().nullable(),
  graduationYear: z.number().int().min(2000).max(2040).optional().nullable(),
  graduationMonth: z.number().int().min(1).max(12).optional().nullable(),
  currentYearOfStudy: z.number().int().min(1).max(8).optional().nullable(),
  isEnrolled: z.boolean().optional(),
  workAuthorization: z.string().max(100).optional().nullable(),
  gpa: z.string().max(10).optional().nullable(),
  yearsExperience: z.string().max(10).optional().nullable(),
});

const targetRoleSchema = z.object({
  roleFamilyId: z.string().uuid('roleFamilyId must be a valid UUID'),
  priority: z.number().int().min(1).default(1),
});

const targetCompanySchema = z.object({
  companyId: z.string().uuid('companyId must be a valid UUID'),
  priority: z.number().int().min(1).default(1),
  notes: z.string().optional().nullable(),
});

const skillEvidenceSchema = z.object({
  skillId: z.string().uuid('skillId must be a valid UUID'),
  evidenceLevel: z.enum([
    'verified',
    'strongly_demonstrated',
    'demonstrated',
    'weak',
    'claimed',
    'unknown',
  ]),
  evidenceSource: z.enum([
    'academic_course',
    'course_topic',
    'assessment',
    'project',
    'research',
    'competition_hackathon',
    'work_experience',
    'self_reported',
  ]),
  academicNodeId: z.string().uuid().optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  assessmentId: z.string().uuid().optional().nullable(),
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional().nullable(),
  artifactUrl: z.string().url().optional().nullable(),
  verifiedAt: z.string().datetime().optional().nullable(),
  confidenceScore: z.string().default('0.75'),
});

const createCompanySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  industry: z.string().max(100).optional().nullable(),
  isVerified: z.boolean().default(false),
  websiteUrl: z.string().url().optional().nullable(),
  description: z.string().optional().nullable(),
});

const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(['language', 'framework', 'concept', 'tool', 'domain', 'infrastructure']),
  synonyms: z.array(z.string()).default([]),
});

const createSavedOpportunitySchema = z.object({
  opportunityId: z.string().uuid().optional().nullable(),
  customTitle: z.string().max(255).optional().nullable(),
  customCompany: z.string().max(255).optional().nullable(),
  sourceUrl: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['saved', 'researching', 'archived']).default('saved'),
});

const updateSavedOpportunitySchema = z.object({
  customTitle: z.string().max(255).optional().nullable(),
  customCompany: z.string().max(255).optional().nullable(),
  sourceUrl: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['saved', 'researching', 'archived']).optional(),
});

const createConceptSkillMappingSchema = z.object({
  conceptName: z.string().min(1).max(255),
  skillName: z.string().min(1).max(100),
  skillCategory: z
    .enum(['language', 'framework', 'concept', 'tool', 'domain', 'infrastructure'])
    .default('concept'),
  relevanceScore: z.string().default('1.00'),
  provenance: z
    .enum(['canonical_curated', 'model_inferred', 'verified_academic'])
    .default('canonical_curated'),
});

// 1. Student Career Profile
careerRouter.get('/profile', async (c) => {
  const session = getSession(c);
  const profile = await defaultStore.getStudentCareerProfile(session.userId);
  return c.json(profile ?? null);
});

careerRouter.put('/profile', async (c) => {
  const session = getSession(c);
  const body = await c.req.json();
  const parsed = upsertProfileSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid career profile data', 400, parsed.error.errors);
  }

  const updated = await defaultStore.upsertStudentCareerProfile(session.userId, parsed.data);
  return c.json(updated);
});

// 2. Reference Catalogs
careerRouter.get('/role-families', async (c) => {
  const roleFamilies = await defaultStore.listRoleFamilies();
  return c.json(roleFamilies);
});

careerRouter.get('/companies', async (c) => {
  const companies = await defaultStore.listCompanies();
  return c.json(companies);
});

// Canonical company creation: Admin or approved provider only
careerRouter.post('/companies', async (c) => {
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
      'Only administrators and approved providers can register canonical companies',
      403,
    );
  }

  const body = await c.req.json();
  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid company data', 400, parsed.error.errors);
  }
  const company = await defaultStore.createCompany({
    name: parsed.data.name,
    slug: parsed.data.slug,
    industry: parsed.data.industry ?? null,
    isVerified: parsed.data.isVerified ?? false,
    websiteUrl: parsed.data.websiteUrl ?? null,
    description: parsed.data.description ?? null,
  });
  return c.json(company, 201);
});

careerRouter.get('/skills', async (c) => {
  const skills = await defaultStore.listSkills();
  return c.json(skills);
});

careerRouter.post('/skills', async (c) => {
  const body = await c.req.json();
  const parsed = createSkillSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid skill data', 400, parsed.error.errors);
  }
  const skill = await defaultStore.createSkill(parsed.data);
  return c.json(skill, 201);
});

// 3. Concept-Skill Mappings
careerRouter.get('/concept-mappings', async (c) => {
  const concept = c.req.query('concept');
  const mappings = await defaultStore.listConceptSkillMappings(concept);
  return c.json(mappings);
});

careerRouter.post('/concept-mappings', async (c) => {
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
      'Only administrators and approved providers can register concept-skill mappings',
      403,
    );
  }

  const body = await c.req.json();
  const parsed = createConceptSkillMappingSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid mapping data', 400, parsed.error.errors);
  }

  const mapping = await defaultStore.createConceptSkillMapping(parsed.data);
  return c.json(mapping, 201);
});

// 4. Target Roles
careerRouter.get('/target-roles', async (c) => {
  const session = getSession(c);
  const targetRoles = await defaultStore.listStudentTargetRoles(session.userId);
  return c.json(targetRoles);
});

careerRouter.post('/target-roles', async (c) => {
  const session = getSession(c);
  const body = await c.req.json();
  const parsed = targetRoleSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid target role data', 400, parsed.error.errors);
  }
  const targetRole = await defaultStore.addStudentTargetRole(
    session.userId,
    parsed.data.roleFamilyId,
    parsed.data.priority,
  );
  return c.json(targetRole, 201);
});

careerRouter.delete('/target-roles/:roleFamilyId', async (c) => {
  const session = getSession(c);
  const roleFamilyId = c.req.param('roleFamilyId');
  await defaultStore.removeStudentTargetRole(session.userId, roleFamilyId);
  return c.json({ success: true, message: 'Target role removed' });
});

// 5. Target Companies
careerRouter.get('/target-companies', async (c) => {
  const session = getSession(c);
  const targetCompanies = await defaultStore.listStudentTargetCompanies(session.userId);
  return c.json(targetCompanies);
});

careerRouter.post('/target-companies', async (c) => {
  const session = getSession(c);
  const body = await c.req.json();
  const parsed = targetCompanySchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid target company data', 400, parsed.error.errors);
  }
  const targetCompany = await defaultStore.addStudentTargetCompany(
    session.userId,
    parsed.data.companyId,
    parsed.data.priority,
    parsed.data.notes,
  );
  return c.json(targetCompany, 201);
});

careerRouter.delete('/target-companies/:companyId', async (c) => {
  const session = getSession(c);
  const companyId = c.req.param('companyId');
  await defaultStore.removeStudentTargetCompany(session.userId, companyId);
  return c.json({ success: true, message: 'Target company removed' });
});

// 6. Student Skill Evidence
careerRouter.get('/evidence', async (c) => {
  const session = getSession(c);
  const evidence = await defaultStore.listStudentSkillEvidence(session.userId);
  return c.json(evidence);
});

careerRouter.post('/evidence', async (c) => {
  const session = getSession(c);
  const body = await c.req.json();
  const parsed = skillEvidenceSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid skill evidence data', 400, parsed.error.errors);
  }
  const data = parsed.data;
  const created = await defaultStore.createStudentSkillEvidence({
    userId: session.userId,
    skillId: data.skillId,
    evidenceLevel: data.evidenceLevel,
    evidenceSource: data.evidenceSource,
    academicNodeId: data.academicNodeId ?? null,
    courseId: data.courseId ?? null,
    assessmentId: data.assessmentId ?? null,
    title: data.title,
    description: data.description ?? null,
    artifactUrl: data.artifactUrl ?? null,
    verifiedAt: data.verifiedAt ? new Date(data.verifiedAt) : null,
    confidenceScore: data.confidenceScore,
  });
  return c.json(created, 201);
});

careerRouter.delete('/evidence/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.deleteStudentSkillEvidence(id, session.userId);
  return c.json({ success: true, message: 'Skill evidence deleted' });
});

// Sync automatic evidence from Academic Brain
careerRouter.post('/evidence/sync-academic', async (c) => {
  const session = getSession(c);

  const [courses, assessments, resources, skills, conceptSkillMappings] = await Promise.all([
    defaultStore.listCourses(session.userId),
    defaultStore.listAssessments(session.userId),
    defaultStore.listResources(session.userId),
    defaultStore.listSkills(),
    defaultStore.listConceptSkillMappings(),
  ]);

  const allNodes: AcademicNode[] = [];
  for (const course of courses) {
    const nodes = await defaultStore.listAcademicNodes(course.id, session.userId);
    allNodes.push(...nodes);
  }

  const derivedEvidence = extractEvidenceFromAcademicBrain({
    userId: session.userId,
    courses,
    academicNodes: allNodes,
    assessments,
    resources,
    skills,
    conceptMappings: conceptSkillMappings,
  });

  const currentSkills = await defaultStore.listSkills();
  for (const ev of derivedEvidence) {
    let skill = currentSkills.find(
      (s) => s.id === ev.skillId || s.name.toLowerCase() === ev.skillName.toLowerCase(),
    );
    if (!skill) {
      skill = await defaultStore.createSkill({
        name: ev.skillName,
        category: 'concept',
        synonyms: [],
      });
      currentSkills.push(skill);
    }

    await defaultStore.upsertStudentSkillEvidence({
      userId: session.userId,
      skillId: skill.id,
      evidenceLevel: ev.evidenceLevel,
      evidenceSource: ev.evidenceSource,
      academicNodeId: ev.academicNodeId ?? null,
      courseId: ev.courseId ?? null,
      assessmentId: ev.assessmentId ?? null,
      title: ev.title,
      description: ev.description ?? null,
      artifactUrl: null,
      verifiedAt: null,
      confidenceScore: ev.confidenceScore,
    });
  }

  return c.json({
    syncedCount: derivedEvidence.length,
    evidence: derivedEvidence,
  });
});

// 7. Student Saved Opportunities (personal bookmarks and external tracking)
careerRouter.get('/saved-opportunities', async (c) => {
  const session = getSession(c);
  const saved = await defaultStore.listStudentSavedOpportunities(session.userId);
  return c.json(saved);
});

careerRouter.post('/saved-opportunities', async (c) => {
  const session = getSession(c);
  const body = await c.req.json();
  const parsed = createSavedOpportunitySchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      'BAD_REQUEST',
      'Invalid saved opportunity payload',
      400,
      parsed.error.errors,
    );
  }

  const data = parsed.data;
  const saved = await defaultStore.createStudentSavedOpportunity(session.userId, {
    opportunityId: data.opportunityId ?? null,
    customTitle: data.customTitle ?? null,
    customCompany: data.customCompany ?? null,
    sourceUrl: data.sourceUrl ?? null,
    notes: data.notes ?? null,
    status: data.status,
  });

  return c.json(saved, 201);
});

careerRouter.patch('/saved-opportunities/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateSavedOpportunitySchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid update payload', 400, parsed.error.errors);
  }

  const data = parsed.data;
  const updated = await defaultStore.updateStudentSavedOpportunity(id, session.userId, {
    customTitle: data.customTitle,
    customCompany: data.customCompany,
    sourceUrl: data.sourceUrl,
    notes: data.notes,
    status: data.status,
  });

  return c.json(updated);
});

careerRouter.delete('/saved-opportunities/:id', async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  await defaultStore.deleteStudentSavedOpportunity(id, session.userId);
  return c.json({ success: true, message: 'Saved opportunity removed' });
});

// 8. Action Optimizer Foundation
// "What would most improve my opportunity set?"
careerRouter.get('/action-plan', async (c) => {
  const session = getSession(c);

  // 1. Fetch user target roles
  const targetRoles = await defaultStore.listStudentTargetRoles(session.userId);
  const targetRoleFamilyIds = new Set(targetRoles.map((r) => r.roleFamilyId));

  // 2. Fetch active opportunities matching target roles (or all active if none specified)
  const allOpportunities = await defaultStore.listOpportunities({ status: 'active' });
  const relevantOpportunities =
    targetRoleFamilyIds.size > 0
      ? allOpportunities.filter((o) => targetRoleFamilyIds.has(o.roleFamilyId))
      : allOpportunities;

  // 3. For each relevant opportunity, fetch skill requirements
  const oppsWithSkills = await Promise.all(
    relevantOpportunities.map(async (opp) => {
      const skillRequirements = await defaultStore.getOpportunitySkillRequirements(opp.id);
      return {
        opportunity: opp,
        skillRequirements,
      };
    }),
  );

  // 4. Fetch student evidence, skills catalog, courses, academic nodes, and concept mappings
  const [skills, studentEvidence, courses, conceptSkillMappings] = await Promise.all([
    defaultStore.listSkills(),
    defaultStore.listStudentSkillEvidence(session.userId),
    defaultStore.listCourses(session.userId),
    defaultStore.listConceptSkillMappings(),
  ]);

  // Fetch academic nodes from all user courses
  const allNodes: AcademicNode[] = [];
  for (const course of courses) {
    const nodes = await defaultStore.listAcademicNodes(course.id, session.userId);
    allNodes.push(...nodes);
  }

  // 5. Compute action optimization
  const optimizationItems = computeActionOptimization({
    opportunities: oppsWithSkills,
    skills,
    studentEvidence,
    courses,
    academicNodes: allNodes,
    conceptSkillMappings,
  });

  return c.json({
    items: optimizationItems,
    targetRolesCount: targetRoles.length,
    opportunitiesAnalyzed: relevantOpportunities.length,
    disclaimer:
      'Action recommendations identify highest-impact skill gaps across target roles. Completing an action does NOT guarantee an interview or offer.',
  });
});
