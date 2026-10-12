/**
 * Shared date formatting utilities for CampusFlow web app.
 * Enforces explicit 'en-US' locale and explicit timezone fallback ('UTC')
 * to guarantee deterministic rendering between SSR and client hydration.
 */

export const DEFAULT_LOCALE = 'en-US';
export const DEFAULT_TIMEZONE = 'UTC';

export function formatTodayHeader(
  date: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  };
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, options).format(date);
}

export function formatShortDate(
  date: string | Date | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  if (!date) return 'No date set';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  };
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, options).format(d);
}

export function formatMonthDay(
  date: string | Date | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  if (!date) return 'Never';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Never';
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    timeZone,
  };
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, options).format(d);
}

export function formatRelativeTime(
  date: string | Date | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  if (!date) return 'Never';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Never';
  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatMonthDay(d, timeZone);
}
