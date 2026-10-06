import { describe, it, expect, beforeEach } from 'vitest';
import { createApiApp } from '../../services/api/src/app.js';
import { defaultStore } from '../../services/api/src/data/store.js';

describe('Opportunity Intelligence API & State Transitions', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const app = createApiApp();

  beforeEach(() => {
    defaultStore.clear();
    process.env['AUTH_TEST_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'test';
  });

  it('Unauthenticated requests are rejected with 401', async () => {
    process.env['AUTH_TEST_BYPASS'] = 'false';

    const res = await app.request('/api/v1/opportunities', {
      method: 'GET',
    });

    expect(res.status).toBe(401);
    process.env['AUTH_TEST_BYPASS'] = 'true';
  });

  it('Enforces canonical opportunity authorization: student 403, admin 201', async () => {
    // Student attempt is rejected with 403
    const studentCompRes = await app.request('/api/v1/career/companies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
        'x-test-user-role': 'student',
      },
      body: JSON.stringify({
        name: 'Forbidden Company',
        slug: 'forbidden-comp',
      }),
    });
    expect(studentCompRes.status).toBe(403);

    // Admin attempt succeeds with 201
    const compRes = await app.request('/api/v1/career/companies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
        'x-test-user-role': 'admin',
      },
      body: JSON.stringify({
        name: 'Datadog',
        slug: 'datadog',
        websiteUrl: 'https://careers.datadoghq.com',
      }),
    });
    expect(compRes.status).toBe(201);
    const company = await compRes.json();

    // 2. Fetch seeded role families
    const rfRes = await app.request('/api/v1/career/role-families', {
      headers: { 'x-test-user-id': userA },
    });
    expect(rfRes.status).toBe(200);
    const roleFamilies = await rfRes.json();
    const sweRole = roleFamilies.find(
      (rf: { name: string; id: string }) => rf.name === 'Software Engineering',
    );
    expect(sweRole).toBeDefined();

    // 3. Student attempt to create opportunity directly is rejected with 403
    const studentOppRes = await app.request('/api/v1/opportunities', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
        'x-test-user-role': 'student',
      },
      body: JSON.stringify({
        companyId: company.id,
        roleFamilyId: sweRole.id,
        title: 'Unauthorized Opportunity',
        opportunityType: 'internship',
        sourceUrl: 'https://example.com/unauth',
        sourceOrganization: 'Datadog',
      }),
    });
    expect(studentOppRes.status).toBe(403);

    // 4. Admin creates canonical opportunity with provenance
    const oppRes = await app.request('/api/v1/opportunities', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
        'x-test-user-role': 'admin',
      },
      body: JSON.stringify({
        companyId: company.id,
        roleFamilyId: sweRole.id,
        title: 'Software Engineering Intern',
        opportunityType: 'internship',
        targetGraduationYears: [2027],
        degreeLevels: ['bachelors'],
        allowedMajors: ['Computer Science'],
        season: 'Summer 2027',
        employmentType: 'internship',
        workplaceType: 'hybrid',
        status: 'active',
        minExperienceMonths: 0,
        requiresWorkAuth: 'any',
        sourceUrl: 'https://careers.datadoghq.com/intern-2027',
        sourceOrganization: 'Datadog Careers',
        extractionVersion: 'v1.0',
      }),
    });

    expect(oppRes.status).toBe(201);
    const createdOpp = await oppRes.json();
    expect(createdOpp.id).toBeDefined();
    expect(createdOpp.sourceUrl).toBe('https://careers.datadoghq.com/intern-2027');
    expect(createdOpp.sourceOrganization).toBe('Datadog Careers');

    // 4. List opportunities and verify presence
    const listRes = await app.request('/api/v1/opportunities', {
      headers: { 'x-test-user-id': userA },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.count).toBe(1);
    expect(listBody.data[0].title).toBe('Software Engineering Intern');
  });

  it('Manages student career profile with strict user ownership isolation', async () => {
    // 1. User A creates career profile
    const putResA = await app.request('/api/v1/career/profile', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        targetCareerPath: 'Infrastructure Engineering',
        targetGeography: ['San Francisco', 'New York'],
        degreeLevel: 'BTech',
        major: 'Computer Science',
        university: 'VIT',
        graduationYear: 2027,
        currentYearOfStudy: 3,
        isEnrolled: true,
        gpa: '3.8',
        yearsExperience: '1.0',
      }),
    });
    expect(putResA.status).toBe(200);
    const profileA = await putResA.json();
    expect(profileA.userId).toBe(userA);
    expect(profileA.graduationYear).toBe(2027);

    // 2. User B requests their career profile - should be null
    const getResB = await app.request('/api/v1/career/profile', {
      headers: { 'x-test-user-id': userB },
    });
    expect(getResB.status).toBe(200);
    const profileB = await getResB.json();
    expect(profileB).toBeNull();
  });

  it('Evaluates opportunity eligibility and role match for authenticated student', async () => {
    // 1. Setup Student Career Profile for User A
    await app.request('/api/v1/career/profile', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        degreeLevel: 'BS',
        major: 'Computer Science',
        graduationYear: 2027,
        currentYearOfStudy: 3,
        isEnrolled: true,
        gpa: '3.9',
        yearsExperience: '1.0',
      }),
    });

    // 2. Setup Company & Opportunity
    const comp = await defaultStore.createCompany({
      name: 'Cloudflare',
      slug: 'cloudflare',
      websiteUrl: 'https://cloudflare.com',
      description: null,
    });

    const rfList = await defaultStore.listRoleFamilies();
    const sweRf = rfList.find((r) => r.name === 'Software Engineering')!;

    const opp = await defaultStore.createOpportunity({
      companyId: comp.id,
      roleFamilyId: sweRf.id,
      title: 'Systems Engineer Intern',
      opportunityType: 'internship',
      targetGraduationYears: [2027],
      degreeLevels: ['bachelors'],
      allowedMajors: ['Computer Science'],
      description: 'Distributed systems internship',
      season: 'Summer 2027',
      employmentType: 'internship',
      workplaceType: 'hybrid',
      status: 'active',
      minGpa: '3.5',
      minExperienceMonths: 0,
      requiresWorkAuth: 'any',
      sourceUrl: 'https://cloudflare.com/careers/systems-intern',
      sourceOrganization: 'Cloudflare Official',
      retrievalTimestamp: new Date(),
      publicationDate: null,
      expirationDate: null,
      lastValidTimestamp: null,
      extractionVersion: 'v1.0',
    });

    // 3. Add Skill and Student Evidence
    const skill = await defaultStore.createSkill({
      name: 'Rust',
      category: 'language',
      synonyms: ['rs'],
    });

    await defaultStore.createOpportunitySkillRequirement({
      opportunityId: opp.id,
      skillId: skill.id,
      requirementType: 'required',
      minProficiency: 'proficient',
      importanceWeight: '1.00',
      notes: null,
    });

    await app.request('/api/v1/career/evidence', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        skillId: skill.id,
        evidenceLevel: 'demonstrated',
        evidenceSource: 'project',
        title: 'Built HTTP Proxy in Rust',
        confidenceScore: '0.85',
      }),
    });

    // 4. Call Evaluate Endpoint
    const evalRes = await app.request(`/api/v1/opportunities/${opp.id}/evaluate`, {
      method: 'POST',
      headers: { 'x-test-user-id': userA },
    });

    expect(evalRes.status).toBe(200);
    const evaluation = await evalRes.json();

    expect(evaluation.opportunityId).toBe(opp.id);
    expect(evaluation.eligibility.status).toBe('eligible');
    expect(evaluation.roleMatch.score).toBeGreaterThan(50);
    expect(
      evaluation.roleMatch.supportingEvidence.some((e: string) => e.includes('Rust demonstrated')),
    ).toBe(true);
    expect(evaluation.roleMatch.disclaimer).toContain('NOT a hiring probability');
  });

  it('Tracks application record and executes application outcome state transitions', async () => {
    // 1. Setup Company and Opportunity
    const comp = await defaultStore.createCompany({
      name: 'Stripe',
      slug: 'stripe',
      websiteUrl: 'https://stripe.com',
      description: null,
    });
    const rfList = await defaultStore.listRoleFamilies();
    const opp = await defaultStore.createOpportunity({
      companyId: comp.id,
      roleFamilyId: rfList[0]!.id,
      title: 'Infrastructure Intern',
      opportunityType: 'internship',
      targetGraduationYears: [2027],
      degreeLevels: ['bachelors'],
      allowedMajors: [],
      description: null,
      season: 'Summer 2027',
      employmentType: 'internship',
      workplaceType: 'remote',
      status: 'active',
      minGpa: null,
      minExperienceMonths: 0,
      requiresWorkAuth: 'any',
      sourceUrl: 'https://stripe.com/jobs/1',
      sourceOrganization: 'Stripe',
      retrievalTimestamp: new Date(),
      publicationDate: null,
      expirationDate: null,
      lastValidTimestamp: null,
      extractionVersion: 'v1.0',
    });

    // 2. User A creates application
    const createRes = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        opportunityId: opp.id,
        notes: 'Submitted resume via career page',
      }),
    });

    expect(createRes.status).toBe(201);
    const appRecord = await createRes.json();
    expect(appRecord.status).toBe('applied');
    expect(appRecord.userId).toBe(userA);

    // 3. User B cannot see User A's application
    const userBAccess = await app.request(`/api/v1/applications/${appRecord.id}`, {
      headers: { 'x-test-user-id': userB },
    });
    expect(userBAccess.status).toBe(404);

    // 4. User A transitions status: applied -> assessment
    const patch1 = await app.request(`/api/v1/applications/${appRecord.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        status: 'assessment',
        notes: 'Received HackerRank challenge',
      }),
    });
    expect(patch1.status).toBe(200);
    const updated1 = await patch1.json();
    expect(updated1.status).toBe('assessment');
    expect(updated1.assessmentAt).toBeDefined();
    expect(updated1.stateTransitions).toHaveLength(2);

    // 5. User A transitions status: assessment -> interview
    const patch2 = await app.request(`/api/v1/applications/${appRecord.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        status: 'interview',
        notes: 'Passed OA, scheduled technical screen',
      }),
    });
    expect(patch2.status).toBe(200);
    const updated2 = await patch2.json();
    expect(updated2.status).toBe('interview');
    expect(updated2.interviewAt).toBeDefined();

    // 6. User A transitions to offer
    const patch3 = await app.request(`/api/v1/applications/${appRecord.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        status: 'offer',
        notes: 'Received official offer letter!',
      }),
    });
    expect(patch3.status).toBe(200);
    const updated3 = await patch3.json();
    expect(updated3.status).toBe('offer');
    expect(updated3.outcomeAt).toBeDefined();
    expect(updated3.outcomeNotes).toBe('Received official offer letter!');
    expect(updated3.stateTransitions).toHaveLength(4);
  });

  it('Isolates student-saved opportunities strictly per user', async () => {
    // 1. Setup an opportunity
    const comp = await defaultStore.createCompany({
      name: 'GitHub',
      slug: 'github',
      websiteUrl: 'https://github.com',
      description: null,
    });
    const rfList = await defaultStore.listRoleFamilies();
    const sweRf = rfList[0]!;

    const opp = await defaultStore.createOpportunity({
      companyId: comp.id,
      roleFamilyId: sweRf.id,
      title: 'Infrastructure Intern',
      opportunityType: 'internship',
      targetGraduationYears: [2026],
      degreeLevels: ['bachelors'],
      allowedMajors: ['Computer Science'],
      description: 'Distributed infrastructure',
      season: 'Summer 2026',
      employmentType: 'internship',
      workplaceType: 'remote',
      status: 'active',
      minGpa: null,
      minExperienceMonths: 0,
      requiresWorkAuth: 'any',
      sourceUrl: 'https://github.careers/opp-10',
      sourceOrganization: 'GitHub',
      retrievalTimestamp: new Date(),
      publicationDate: null,
      expirationDate: null,
      lastValidTimestamp: null,
      extractionVersion: 'v1.0',
    });

    // 2. User A saves the opportunity
    const saveRes = await app.request('/api/v1/career/saved-opportunities', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        opportunityId: opp.id,
        status: 'saved',
        notes: 'Applying after updating resume with distributed systems project',
      }),
    });
    expect(saveRes.status).toBe(201);
    const saved = await saveRes.json();
    expect(saved.userId).toBe(userA);
    expect(saved.opportunityId).toBe(opp.id);

    // 3. User B lists saved opportunities - isolated, User A's record not visible
    const listResB = await app.request('/api/v1/career/saved-opportunities', {
      headers: { 'x-test-user-id': userB },
    });
    expect(listResB.status).toBe(200);
    const listB = await listResB.json();
    expect(listB).toHaveLength(0);

    // 4. User B attempts to delete User A's saved opportunity - returns 404
    const deleteResB = await app.request(`/api/v1/career/saved-opportunities/${saved.id}`, {
      method: 'DELETE',
      headers: { 'x-test-user-id': userB },
    });
    expect(deleteResB.status).toBe(404);

    // 5. User A can update status to 'applied'
    const patchResA = await app.request(`/api/v1/career/saved-opportunities/${saved.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA,
      },
      body: JSON.stringify({
        status: 'researching',
        notes: 'Submitted application via portal',
      }),
    });
    expect(patchResA.status).toBe(200);
    const patched = await patchResA.json();
    expect(patched.status).toBe('researching');

    // 6. User A deletes their saved record
    const deleteResA = await app.request(`/api/v1/career/saved-opportunities/${saved.id}`, {
      method: 'DELETE',
      headers: { 'x-test-user-id': userA },
    });
    expect(deleteResA.status).toBe(200);
  });

  it('Syncs evidence automatically from Academic Brain with topic provenance', async () => {
    // 1. Create a course and topic for User A
    const course = await defaultStore.createCourse({
      userId: userA,
      code: 'CS401',
      title: 'Distributed Systems & Cloud Computing',
      term: 'Fall 2025',
    });

    await defaultStore.createAcademicNodes([
      {
        courseId: course.id,
        title: 'TCP/IP Socket Architecture and Consensus',
        nodeType: 'topic',
        depth: 1,
        sequenceOrder: 1,
        status: 'active',
        parentTopicId: null,
        targetDurationMinutes: null,
        description: 'Covers low-level socket programming and network protocols.',
      },
    ]);

    await defaultStore.createAssessment({
      userId: userA,
      courseId: course.id,
      title: 'Distributed Consensus Midterm Exam',
      type: 'exam',
      weightage: '25',
      date: new Date(),
    });

    // 2. Trigger sync endpoint
    const syncRes = await app.request('/api/v1/career/evidence/sync-academic', {
      method: 'POST',
      headers: { 'x-test-user-id': userA },
    });
    expect(syncRes.status).toBe(200);
    const syncData = await syncRes.json();
    expect(syncData.syncedCount).toBeGreaterThanOrEqual(1);

    // 3. Verify evidence items created
    const evidenceList = await defaultStore.listStudentSkillEvidence(userA);
    expect(evidenceList.length).toBeGreaterThanOrEqual(1);

    // Evidence has provenance and is not self-reported
    for (const ev of evidenceList) {
      expect(ev.userId).toBe(userA);
      expect(ev.evidenceSource).not.toBe('self_reported');
      expect(['demonstrated', 'strongly_demonstrated']).toContain(ev.evidenceLevel);
    }
  });

  it('Returns accurate opportunity landscape overview metrics', async () => {
    const res = await app.request('/api/v1/opportunities/landscape', {
      headers: { 'x-test-user-id': userA },
    });
    expect(res.status).toBe(200);
    const summary = await res.json();
    expect(typeof summary.totalDiscovered).toBe('number');
    expect(typeof summary.eligibleCount).toBe('number');
    expect(typeof summary.strongMatchesCount).toBe('number');
    expect(typeof summary.preparationRequiredCount).toBe('number');
    expect(typeof summary.ineligibleCount).toBe('number');
  });

  it('Evaluates opportunity enforcing Probability Integrity Rule: unavailable when empirical data is insufficient', async () => {
    // 1. Ingest an opportunity
    const comp = await defaultStore.createCompany({
      name: 'Acme Systems',
      slug: 'acme-systems',
    });
    const rf = (await defaultStore.listRoleFamilies())[0]!;

    const opp = await defaultStore.createOpportunity({
      companyId: comp.id,
      roleFamilyId: rf.id,
      title: 'Full Stack Engineer Intern',
      opportunityType: 'internship',
      targetGraduationYears: [2026],
      degreeLevels: ['bachelors'],
      allowedMajors: ['Computer Science'],
      description: 'Full stack development role',
      season: 'Summer 2026',
      employmentType: 'full_time',
      workplaceType: 'hybrid',
      status: 'active',
      minGpa: null,
      minExperienceMonths: 0,
      requiresWorkAuth: 'any',
      sourceUrl: 'https://acme.example.com/jobs/1',
      sourceOrganization: 'Acme Official',
      retrievalTimestamp: new Date(),
      publicationDate: null,
      expirationDate: null,
      lastValidTimestamp: null,
      extractionVersion: 'v1.0',
    });

    // 2. Evaluate the opportunity
    const evalRes = await app.request(`/api/v1/opportunities/${opp.id}/evaluate`, {
      method: 'POST',
      headers: { 'x-test-user-id': userA },
    });

    expect(evalRes.status).toBe(200);
    const evalData = await evalRes.json();

    // Verify all 4 dimensions are distinct
    expect(evalData.opportunityId).toBe(opp.id);
    expect(evalData.eligibility).toBeDefined();
    expect(evalData.eligibility.status).toBeDefined();
    expect(evalData.roleMatch).toBeDefined();
    expect(typeof evalData.roleMatch.score).toBe('number');
    expect(evalData.hiringProbability).toBeDefined();

    // Verify Probability Integrity Rule enforcement
    const prob = evalData.hiringProbability;
    expect(prob.status).toBe('unavailable');
    expect(prob.reason).toBe('insufficient_comparable_outcomes');
    expect(prob.message).toBe('Probability unavailable: insufficient comparable outcome data.');
    expect(prob.comparableSampleSize).toBe(0);
    expect(prob.minimumRequiredSampleSize).toBe(100);
    expect(Array.isArray(prob.unobservedFactors)).toBe(true);
    expect(prob.unobservedFactors.length).toBeGreaterThan(0);
    expect(prob.disclaimer).toContain(
      'Role Match and Eligibility are distinct metrics and are NOT probabilities',
    );
  });

  it('GET /api/v1/opportunities/:id/transparency retrieves complete audit record and immutable snapshots', async () => {
    // 1. Setup company and opportunity
    const comp = await defaultStore.createCompany({
      name: 'Stripe',
      slug: 'stripe-transparency-test',
    });
    const rf = (await defaultStore.listRoleFamilies())[0]!;

    const opp = await defaultStore.createOpportunity({
      companyId: comp.id,
      roleFamilyId: rf.id,
      title: 'Infrastructure Security Engineer Intern',
      opportunityType: 'internship',
      targetGraduationYears: [2027],
      degreeLevels: ['bachelors'],
      allowedMajors: ['Computer Science'],
      description: 'Zero-trust infrastructure and secure enclaves.',
      season: 'Summer 2027',
      employmentType: 'full_time',
      workplaceType: 'remote',
      status: 'active',
      minGpa: null,
      minExperienceMonths: 0,
      requiresWorkAuth: 'any',
      sourceUrl: 'https://stripe.example.com/jobs/infra-sec',
      sourceOrganization: 'Stripe Official',
      retrievalTimestamp: new Date(),
      publicationDate: null,
      expirationDate: null,
      lastValidTimestamp: null,
      extractionVersion: 'v2.0',
    });

    // 2. Fetch transparency record
    const res = await app.request(`/api/v1/opportunities/${opp.id}/transparency`, {
      method: 'GET',
      headers: { 'x-test-user-id': userA },
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.opportunityId).toBe(opp.id);
    expect(data.prediction).toBeDefined();
    expect(data.prediction.status).toBe('unavailable');
    expect(data.prediction.message).toBe(
      'Probability unavailable: insufficient comparable outcome data.',
    );
    expect(data.opportunitySnapshot).toBeDefined();
    expect(data.opportunitySnapshot.company.name).toBe('Stripe');
    expect(data.opportunitySnapshot.role.title).toBe('Infrastructure Security Engineer Intern');
    expect(data.opportunitySnapshot.contentHash).toBeDefined();
    expect(data.opportunitySnapshot.contentHash.length).toBe(64);
    expect(data.featureSnapshot).toBeDefined();
    expect(data.comparableSampleSize).toBe(0);
    expect(data.observedPositiveOutcomes).toBe(0);
    expect(Array.isArray(data.unobservedFactors)).toBe(true);
    expect(data.unobservedFactors.length).toBeGreaterThan(0);
    expect(Array.isArray(data.knownLimitations)).toBe(true);
  });
});
