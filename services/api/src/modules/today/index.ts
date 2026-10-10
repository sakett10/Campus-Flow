import { Hono } from 'hono';
import { getSession } from '../../middleware/auth.js';
import { defaultStore } from '../../data/store.js';
import { isValidIanaTimezone, AppError } from '@campusflow/shared';

export const todayRouter = new Hono();

/**
 * GET /api/v1/today
 * Query parameters:
 *   timezone?: string (Optional IANA timezone, e.g. "Asia/Kolkata", "America/New_York", "UTC". Defaults to "UTC")
 *
 * Returns a consolidated, authenticated overview of the student's academic state:
 * - Active courses owned by the user
 * - Chronological upcoming, due today, overdue, unscheduled, and completed assessments
 * - Active topics currently marked as 'learning' or 'needs_review'
 *
 * Consistency guarantee:
 * - Read-committed consistency across courses, assessments, and study states.
 * - Guarantees that all returned records belong strictly to the authenticated user.
 */
todayRouter.get('/', async (c) => {
  const session = getSession(c);
  const timezone = c.req.query('timezone');
  if (timezone && !isValidIanaTimezone(timezone)) {
    throw AppError.badRequest(`Invalid IANA timezone specified: '${timezone}'.`);
  }
  const overview = await defaultStore.getTodayOverview(session.userId, timezone || 'UTC');
  return c.json(overview);
});
