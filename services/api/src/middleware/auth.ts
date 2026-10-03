import type { MiddlewareHandler } from 'hono';
import { AppError } from '@campusflow/shared';
import type { AuthSession } from '@campusflow/types';

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const isTestBypass = process.env['AUTH_TEST_BYPASS'] === 'true';
  const isProduction = process.env['NODE_ENV'] === 'production';

  // Check test header if allowed in non-production
  if (isTestBypass && !isProduction) {
    const testUserId = c.req.header('x-test-user-id');
    if (testUserId) {
      const session: AuthSession = {
        userId: testUserId,
        clerkUserId: `clerk_${testUserId}`,
        email: `${testUserId}@campusflow.test`,
        role: 'student',
      };
      c.set('authUser', session);
      return next();
    }
  }

  // Production authentication via Authorization header Bearer token
  const authHeader = c.req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw AppError.unauthorized('Authentication token required.');
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw AppError.unauthorized('Empty authentication token.');
  }

  // Token verification abstraction:
  // In production, Clerk verifies the JWT signature and extracts clerkUserId.
  // Here, the verified identity maps to the internal user.
  // For test/mock environments or local tokens:
  if (token.startsWith('test_user_')) {
    if (isProduction) {
      throw AppError.unauthorized('Test tokens are forbidden in production.');
    }
    const userId = token.replace('test_user_', '');
    const session: AuthSession = {
      userId,
      clerkUserId: `clerk_${userId}`,
      email: `${userId}@campusflow.test`,
      role: 'student',
    };
    c.set('authUser', session);
    return next();
  }

  // Fallback if no valid token verified
  throw AppError.unauthorized('Invalid or expired session token.');
};

export function getSession(c: { get: (key: string) => unknown }): AuthSession {
  const session = c.get('authUser') as AuthSession | undefined;
  if (!session || !session.userId) {
    throw AppError.unauthorized('Authenticated session context is missing.');
  }
  return session;
}
