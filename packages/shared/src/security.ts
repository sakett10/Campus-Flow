import { AppError } from './errors.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a string matches UUID format.
 * Client-supplied IDs must be treated as untrusted.
 */
export function isValidUuid(id: unknown): id is string {
  if (typeof id !== 'string') {
    return false;
  }
  return UUID_REGEX.test(id);
}

/**
 * Asserts that the requested resource is owned by the current authenticated user.
 * Throws AppError.forbidden() if ownership check fails.
 */
export function assertOwnership(
  resourceOwnerId: string,
  currentUserId: string,
  resourceName = 'Resource',
): void {
  if (!resourceOwnerId || !currentUserId || resourceOwnerId !== currentUserId) {
    throw AppError.forbidden(`Access denied: You do not own this ${resourceName.toLowerCase()}.`);
  }
}

/**
 * Validates untrusted ID parameter or throws badRequest error.
 */
export function validateUuidParam(id: unknown, paramName = 'id'): string {
  if (!isValidUuid(id)) {
    throw AppError.badRequest(`Invalid ${paramName}: must be a valid UUID.`);
  }
  return id;
}
