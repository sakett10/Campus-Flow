import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  formatHeaderDate,
  formatShortDate,
  formatMonthDay,
} from '../../packages/shared/src/timezone.js';
import {
  formatTodayHeader as webFormatTodayHeader,
  formatShortDate as webFormatShortDate,
  formatMonthDay as webFormatMonthDay,
  formatRelativeTime as webFormatRelativeTime,
} from '../../apps/web/src/lib/date.js';

describe('Deterministic Date Formatting Suite (SSR Hydration Symmetry)', () => {
  const sampleInstant = new Date('2026-10-10T12:00:00.000Z');

  it('1. Shared and web utilities use consistent default locale and timezone constants', () => {
    expect(DEFAULT_LOCALE).toBe('en-US');
    expect(DEFAULT_TIMEZONE).toBe('UTC');
  });

  it('2. Formats header date deterministically in en-US without locale-dependent day/month inversion', () => {
    const formatted = formatHeaderDate(sampleInstant, 'UTC');
    // Must be "Saturday, October 10, 2026", NOT "Saturday, 10 October 2026"
    expect(formatted).toBe('Saturday, October 10, 2026');

    const webFormatted = webFormatTodayHeader(sampleInstant, 'UTC');
    expect(webFormatted).toBe('Saturday, October 10, 2026');
    expect(webFormatted).toBe(formatted);
  });

  it('3. Formats header date deterministically across configured timezones', () => {
    // In Asia/Kolkata (UTC+05:30), 12:00 UTC is 17:30 IST on the same day
    const kolkataFormatted = formatHeaderDate(sampleInstant, 'Asia/Kolkata');
    expect(kolkataFormatted).toBe('Saturday, October 10, 2026');

    // In America/New_York (UTC-4 EDT), 12:00 UTC is 08:00 EDT on the same day
    const nyFormatted = formatHeaderDate(sampleInstant, 'America/New_York');
    expect(nyFormatted).toBe('Saturday, October 10, 2026');

    // Near midnight boundary: 2026-10-10T23:30:00Z is 2026-10-11T05:00:00 in Asia/Kolkata
    const nearMidnight = new Date('2026-10-10T23:30:00.000Z');
    expect(formatHeaderDate(nearMidnight, 'UTC')).toBe('Saturday, October 10, 2026');
    expect(formatHeaderDate(nearMidnight, 'Asia/Kolkata')).toBe('Sunday, October 11, 2026');
  });

  it('4. Formats short dates deterministically with en-US Month Day, Year order', () => {
    expect(formatShortDate(sampleInstant, 'UTC')).toBe('Oct 10, 2026');
    expect(webFormatShortDate(sampleInstant, 'UTC')).toBe('Oct 10, 2026');

    // String input
    expect(webFormatShortDate('2026-10-10T12:00:00.000Z', 'UTC')).toBe('Oct 10, 2026');
  });

  it('5. Handles null, undefined, and invalid date inputs safely', () => {
    expect(formatShortDate(null)).toBe('No date set');
    expect(formatShortDate(undefined)).toBe('No date set');
    expect(formatShortDate('invalid-date-string')).toBe('Invalid date');

    expect(webFormatShortDate(null)).toBe('No date set');
    expect(webFormatShortDate(undefined)).toBe('No date set');
    expect(webFormatShortDate('invalid-date-string')).toBe('Invalid date');

    expect(formatMonthDay(null)).toBe('Never');
    expect(formatMonthDay(undefined)).toBe('Never');
    expect(formatMonthDay('invalid-date-string')).toBe('Never');

    expect(webFormatMonthDay(null)).toBe('Never');
    expect(webFormatRelativeTime(null)).toBe('Never');
    expect(webFormatRelativeTime('invalid-date-string')).toBe('Never');
  });

  it('6. Relative time formatter outputs deterministic values', () => {
    const now = Date.now();
    // 30 seconds ago -> "Just now"
    expect(webFormatRelativeTime(new Date(now - 30 * 1000))).toBe('Just now');
    // 5 minutes ago -> "5m ago"
    expect(webFormatRelativeTime(new Date(now - 5 * 60 * 1000))).toBe('5m ago');
    // 2 hours ago -> "2h ago"
    expect(webFormatRelativeTime(new Date(now - 2 * 3600 * 1000))).toBe('2h ago');
    // 3 days ago -> "3d ago"
    expect(webFormatRelativeTime(new Date(now - 3 * 86400 * 1000))).toBe('3d ago');
    // 30 days ago -> falls back to Month Day format (e.g. "Sep 10")
    const pastDate = new Date(sampleInstant.getTime() - 30 * 86400 * 1000);
    expect(webFormatRelativeTime(pastDate, 'UTC')).toBe('Sep 10');
  });
});
