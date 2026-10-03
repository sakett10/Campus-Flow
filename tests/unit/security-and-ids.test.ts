import { describe, it, expect } from 'vitest';
import {
  isValidUuid,
  assertOwnership,
  validateUuidParam,
  AppError,
  formatErrorResponse,
} from '@campusflow/shared';

describe('Security Foundation & Untrusted ID Validation', () => {
  const validUuid1 = '11111111-1111-4111-a111-111111111111';
  const validUuid2 = '22222222-2222-4222-a222-222222222222';

  it('correctly identifies valid and invalid UUIDs', () => {
    expect(isValidUuid(validUuid1)).toBe(true);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('12345')).toBe(false);
    expect(isValidUuid("'; DROP TABLE users; --")).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(12345)).toBe(false);
  });

  it('assertOwnership passes when resource owner matches current user', () => {
    expect(() => assertOwnership(validUuid1, validUuid1, 'Course')).not.toThrow();
  });

  it('assertOwnership throws 403 Forbidden on ownership mismatch', () => {
    expect(() => assertOwnership(validUuid1, validUuid2, 'Course')).toThrowError(
      /Access denied: You do not own this course/,
    );
  });

  it('validateUuidParam throws 400 Bad Request when passed invalid UUID', () => {
    expect(() => validateUuidParam('invalid-id', 'courseId')).toThrow(AppError);
    try {
      validateUuidParam('invalid-id', 'courseId');
    } catch (err) {
      expect((err as AppError).status).toBe(400);
      expect((err as AppError).code).toBe('BAD_REQUEST');
    }
  });

  it('formatErrorResponse formats AppError into safe RFC-aligned JSON structure', () => {
    const error = AppError.forbidden('Cannot access this resource');
    const response = formatErrorResponse(error, '/api/v1/courses/123');

    expect(response.code).toBe('FORBIDDEN');
    expect(response.status).toBe(403);
    expect(response.detail).toBe('Cannot access this resource');
    expect(response.instance).toBe('/api/v1/courses/123');
  });

  it('formatErrorResponse sanitizes internal error details in production', () => {
    const originalNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';

    try {
      const internalError = new Error('Database connection timeout at 192.168.1.1:5432');
      const response = formatErrorResponse(internalError, '/api/v1/courses');

      expect(response.status).toBe(500);
      expect(response.code).toBe('INTERNAL_ERROR');
      expect(response.detail).toBe('An unexpected internal error occurred.');
    } finally {
      process.env['NODE_ENV'] = originalNodeEnv;
    }
  });
});
