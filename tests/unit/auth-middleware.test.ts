import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiApp } from '../../services/api/src/app.js';
import {
  clerkIdToInternalUuid,
  setTokenVerifierForTesting,
} from '../../services/api/src/middleware/auth.js';
import { defaultStore } from '../../services/api/src/data/store.js';

describe('Auth Middleware Security & Bypass Verification Suite', () => {
  let app: ReturnType<typeof createApiApp>;
  const originalEnv = { ...process.env };
  const mockVerifyToken = vi.fn();

  beforeEach(() => {
    defaultStore.clear();
    mockVerifyToken.mockReset();
    setTokenVerifierForTesting(mockVerifyToken);
    process.env = { ...originalEnv };
    app = createApiApp();
  });

  afterEach(() => {
    setTokenVerifierForTesting(null);
    process.env = originalEnv;
  });

  it('1. Normal authenticated requests succeed with valid Clerk credentials', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['AUTH_TEST_BYPASS'];
    process.env['CLERK_SECRET_KEY'] = 'sk_live_valid_clerk_key_test';

    mockVerifyToken.mockResolvedValueOnce({
      sub: 'user_clerk_student_123',
      email: 'student@example.edu',
    });

    const res = await app.request('/api/v1/identity/me', {
      headers: {
        Authorization: 'Bearer valid_clerk_jwt_token',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const expectedInternalId = clerkIdToInternalUuid('user_clerk_student_123');
    expect(body.userId).toBe(expectedInternalId);
    expect(body.clerkUserId).toBe('user_clerk_student_123');
  });

  it('2. Missing credentials are unconditionally rejected with 401', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['AUTH_TEST_BYPASS'];

    // Missing header entirely
    const res1 = await app.request('/api/v1/identity/me');
    expect(res1.status).toBe(401);

    // Empty Authorization header
    const res2 = await app.request('/api/v1/identity/me', {
      headers: { Authorization: '' },
    });
    expect(res2.status).toBe(401);

    // "Bearer" without token
    const res3 = await app.request('/api/v1/identity/me', {
      headers: { Authorization: 'Bearer ' },
    });
    expect(res3.status).toBe(401);
  });

  it('3. Invalid and expired credentials are rejected with 401', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['CLERK_SECRET_KEY'] = 'sk_live_valid_clerk_key_test';

    // Expired token throws error from verifyToken
    mockVerifyToken.mockRejectedValueOnce(new Error('Token has expired'));

    const resExpired = await app.request('/api/v1/identity/me', {
      headers: {
        Authorization: 'Bearer expired_token_xyz',
      },
    });
    expect(resExpired.status).toBe(401);

    // Malformed token without sub claim
    mockVerifyToken.mockResolvedValueOnce({});
    const resNoSub = await app.request('/api/v1/identity/me', {
      headers: {
        Authorization: 'Bearer malformed_token_xyz',
      },
    });
    expect(resNoSub.status).toBe(401);
  });

  it('4. Test bypass works only under the authorized test configuration (NODE_ENV=test AND AUTH_TEST_BYPASS=true)', async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_TEST_BYPASS'] = 'true';

    // x-test-user-id header bypass
    const resHeader = await app.request('/api/v1/identity/me', {
      headers: {
        'x-test-user-id': 'test-student-456',
      },
    });
    expect(resHeader.status).toBe(200);
    const headerBody = await resHeader.json();
    expect(headerBody.clerkUserId).toBe('clerk_test-student-456');

    // test_user_ bearer token bypass
    const resToken = await app.request('/api/v1/identity/me', {
      headers: {
        Authorization: 'Bearer test_user_test-student-789',
      },
    });
    expect(resToken.status).toBe(200);
    const tokenBody = await resToken.json();
    expect(tokenBody.clerkUserId).toBe('clerk_test-student-789');
  });

  it('4b. Neither bypass method works in test environment when AUTH_TEST_BYPASS is disabled or false', async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_TEST_BYPASS'] = 'false';

    // x-test-user-id header alone must NOT authenticate
    const resHeader = await app.request('/api/v1/identity/me', {
      headers: {
        'x-test-user-id': 'test-student-456',
      },
    });
    expect(resHeader.status).toBe(401);

    // test_user_ bearer token must NOT authenticate
    const resToken = await app.request('/api/v1/identity/me', {
      headers: {
        Authorization: 'Bearer test_user_test-student-789',
      },
    });
    expect(resToken.status).toBe(401);
  });

  it('5. Test bypass is strictly rejected in development (NODE_ENV=development)', async () => {
    process.env['NODE_ENV'] = 'development';
    process.env['AUTH_TEST_BYPASS'] = 'true'; // Even if bypass flag is mistakenly set
    process.env['CLERK_SECRET_KEY'] = 'sk_test_fake_dev_key';

    // x-test-user-id alone must NOT authenticate
    const resHeader = await app.request('/api/v1/identity/me', {
      headers: {
        'x-test-user-id': 'dev-attacker-id',
      },
    });
    expect(resHeader.status).toBe(401);

    // test_user_ token must NOT authenticate
    const resToken = await app.request('/api/v1/identity/me', {
      headers: {
        Authorization: 'Bearer test_user_dev-attacker-id',
      },
    });
    expect(resToken.status).toBe(401);
  });

  it('6. Test bypass is strictly rejected in production (NODE_ENV=production)', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['AUTH_TEST_BYPASS'] = 'true'; // Attempting bypass in prod
    process.env['CLERK_SECRET_KEY'] = 'sk_live_fake_prod_key';

    // x-test-user-id alone must NOT authenticate
    const resHeader = await app.request('/api/v1/identity/me', {
      headers: {
        'x-test-user-id': 'prod-attacker-id',
      },
    });
    expect(resHeader.status).toBe(401);

    // test_user_ token must NOT authenticate
    const resToken = await app.request('/api/v1/identity/me', {
      headers: {
        Authorization: 'Bearer test_user_prod-attacker-id',
      },
    });
    expect(resToken.status).toBe(401);
  });

  it('7. User identity cannot be substituted through a client-supplied header during normal application operation', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['AUTH_TEST_BYPASS'];
    process.env['CLERK_SECRET_KEY'] = 'sk_live_valid_clerk_key_test';

    // Authenticated student legitimately holds token for 'user_legitimate_student'
    mockVerifyToken.mockResolvedValueOnce({
      sub: 'user_legitimate_student',
      email: 'student@example.edu',
    });

    // Attacker tries sending legitimate token WITH spoofed 'x-test-user-id' aiming to impersonate victim
    const res = await app.request('/api/v1/identity/me', {
      headers: {
        Authorization: 'Bearer legitimate_clerk_jwt_token',
        'x-test-user-id': 'victim_high_privilege_user',
        'x-test-user-role': 'admin',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Must be strictly bound to the verified token's sub, NOT the spoofed header
    const expectedLegitInternalId = clerkIdToInternalUuid('user_legitimate_student');
    expect(body.userId).toBe(expectedLegitInternalId);
    expect(body.clerkUserId).toBe('user_legitimate_student');
    expect(body.role).toBe('student'); // Spoofed admin role ignored
  });
});
