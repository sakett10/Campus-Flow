import { createHash } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { verifyToken } from '@clerk/backend';
import { AppError, createLogger, isValidUuid } from '@campusflow/shared';
import type { AuthSession } from '@campusflow/types';
import { defaultStore } from '../data/store.js';

const logger = createLogger({ module: 'auth' });

async function ensureDbUser(userId: string, clerkId: string, email: string): Promise<void> {
  try {
    const existing = await defaultStore.getUser(userId);
    if (!existing) {
      await defaultStore.createUser({
        id: userId,
        clerkId,
        email,
        fullName: 'CampusFlow Student',
        role: 'student',
      });
    }
  } catch {
    // Ignore concurrent creation or store errors
  }
}

/**
 * Deterministically maps a Clerk User ID (e.g. "user_2...") to an internal UUID.
 * If the ID is already a valid UUID, returns it unchanged.
 */
export function clerkIdToInternalUuid(clerkId: string): string {
  if (isValidUuid(clerkId)) {
    return clerkId;
  }
  const hex = createHash('sha256').update(`campusflow:clerk:${clerkId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type TokenVerifier = (
  token: string,
  options: { secretKey: string },
) => Promise<{ sub?: string; email?: string } | null | unknown>;

let activeTokenVerifier: TokenVerifier = verifyToken;

export function setTokenVerifierForTesting(verifier: TokenVerifier | null): void {
  activeTokenVerifier = verifier || verifyToken;
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // Preflight requests must never require an authentication token
  if (c.req.method === 'OPTIONS') {
    logger.debug('Bypassing auth for CORS preflight OPTIONS request', { path: c.req.path });
    return next();
  }

  const isTestBypass = process.env['AUTH_TEST_BYPASS'] === 'true';
  const isTestEnv = process.env['NODE_ENV'] === 'test';
  const isAuthorizedTestConfig = isTestBypass && isTestEnv;

  // Check test header if allowed ONLY under explicit authorized automated-test configuration
  if (isAuthorizedTestConfig) {
    const testUserId = c.req.header('x-test-user-id');
    const testUserRole = (c.req.header('x-test-user-role') as 'student' | 'admin') || 'student';
    if (testUserId) {
      const internalId = clerkIdToInternalUuid(testUserId);
      const session: AuthSession = {
        userId: internalId,
        clerkUserId: `clerk_${testUserId}`,
        email: `${testUserId}@campusflow.test`,
        role: testUserRole,
      };
      c.set('authUser', session);
      logger.info('Authenticated session established via x-test-user-id bypass', {
        userId: internalId,
        path: c.req.path,
      });
      return next();
    }
  }

  // Production authentication via Authorization header Bearer token
  const authHeader = c.req.header('authorization')?.trim();
  if (!authHeader) {
    logger.warn('Authentication rejected: missing Authorization header', {
      path: c.req.path,
      hasAuthHeader: false,
    });
    throw AppError.unauthorized('Authentication token required.');
  }

  if (authHeader.toLowerCase() === 'bearer') {
    logger.warn('Authentication rejected: empty Bearer token', { path: c.req.path });
    throw AppError.unauthorized('Empty authentication token.');
  }

  if (!authHeader.startsWith('Bearer ')) {
    logger.warn('Authentication rejected: missing or invalid Authorization header', {
      path: c.req.path,
      hasAuthHeader: true,
    });
    throw AppError.unauthorized('Authentication token required.');
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    logger.warn('Authentication rejected: empty Bearer token', { path: c.req.path });
    throw AppError.unauthorized('Empty authentication token.');
  }

  // Token verification abstraction:
  // In production, Clerk verifies the JWT signature and extracts clerkUserId.
  // Here, the verified identity maps to the internal user.
  // For test/mock environments or local tokens:
  if (token.startsWith('test_user_')) {
    if (!isAuthorizedTestConfig) {
      logger.warn(
        'Authentication rejected: test tokens are forbidden outside authorized test environment',
        {
          path: c.req.path,
          nodeEnv: process.env['NODE_ENV'],
          isTestBypass,
        },
      );
      throw AppError.unauthorized(
        'Test tokens are only permitted under authorized automated-test configuration.',
      );
    }
    const rawUserId = token.replace('test_user_', '');
    const internalUserId = clerkIdToInternalUuid(rawUserId);
    const session: AuthSession = {
      userId: internalUserId,
      clerkUserId: `clerk_${rawUserId}`,
      email: `${rawUserId}@campusflow.test`,
      role: 'student',
    };
    c.set('authUser', session);
    await ensureDbUser(session.userId, session.clerkUserId, session.email);
    logger.info('Authenticated session established via test Bearer token', {
      userId: internalUserId,
      path: c.req.path,
    });
    return next();
  }

  // Real Clerk JWT token verification
  const clerkSecretKey = process.env['CLERK_SECRET_KEY'];
  if (!clerkSecretKey || !clerkSecretKey.startsWith('sk_')) {
    logger.error(
      'Authentication configuration error: CLERK_SECRET_KEY is missing or invalid on API server',
      {
        path: c.req.path,
        hasSecretKey: Boolean(clerkSecretKey),
      },
    );
    throw AppError.unauthorized('Invalid or expired session token.');
  }

  try {
    const verified = (await activeTokenVerifier(token, {
      secretKey: clerkSecretKey,
    })) as { sub?: string; email?: string } | null;

    if (verified && verified.sub) {
      const internalUserId = clerkIdToInternalUuid(verified.sub);
      const session: AuthSession = {
        userId: internalUserId,
        clerkUserId: verified.sub,
        email:
          (verified as unknown as { email?: string }).email || `${verified.sub}@campusflow.student`,
        role: 'student',
      };
      c.set('authUser', session);
      await ensureDbUser(session.userId, session.clerkUserId, session.email);
      logger.info('Clerk session token verified successfully', {
        userId: internalUserId,
        clerkUserId: verified.sub,
        path: c.req.path,
      });
      return next();
    }

    logger.warn('Authentication rejected: Clerk token payload missing subject claim (sub)', {
      path: c.req.path,
    });
    throw AppError.unauthorized('Invalid or expired Clerk session token.');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }
    const failureReason =
      err && typeof err === 'object' && 'reason' in err
        ? String((err as { reason: unknown }).reason)
        : err instanceof Error
          ? err.message
          : 'Unknown token verification failure';
    logger.warn('Clerk session token verification failed', {
      path: c.req.path,
      tokenLength: token.length,
      failureReason,
    });
    throw AppError.unauthorized('Invalid or expired Clerk session token.');
  }
};

export function getSession(c: { get: (key: string) => unknown }): AuthSession {
  const session = c.get('authUser') as AuthSession | undefined;
  if (!session || !session.userId) {
    throw AppError.unauthorized('Authenticated session context is missing.');
  }
  return session;
}
