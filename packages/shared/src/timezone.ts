import { AppError } from './errors.js';

export function isValidIanaTimezone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export interface TimezoneDayBoundaries {
  startOfToday: Date;
  startOfNextDay: Date;
  endOfToday: Date;
}

export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getZonedParts(date: Date, timeZone: string): ZonedDateParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value || '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

export function getStartOfLocalDay(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const targetUtcTime = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let guess = targetUtcTime;
  const seen = new Set<number>();
  let candidate: number | null = null;

  for (let i = 0; i < 8; i++) {
    if (seen.has(guess)) {
      // Oscillation detected (e.g. DST spring-forward gap skipping midnight)
      break;
    }
    seen.add(guess);

    const parts = getZonedParts(new Date(guess), timeZone);
    const guessLocalTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0,
    );
    const diff = guessLocalTime - targetUtcTime;

    if (parts.year === year && parts.month === month && parts.day === day) {
      if (candidate === null || guess < candidate) {
        candidate = guess;
      }
    }

    if (diff === 0) {
      // Check if 1 hour earlier was also midnight (repeated local time during fall-back)
      const earlier = guess - 3600000;
      const earlierParts = getZonedParts(new Date(earlier), timeZone);
      if (
        earlierParts.year === year &&
        earlierParts.month === month &&
        earlierParts.day === day &&
        earlierParts.hour === 0 &&
        earlierParts.minute === 0
      ) {
        return new Date(earlier);
      }
      return new Date(guess);
    }

    guess -= diff;
  }

  if (candidate !== null) {
    return new Date(candidate);
  }
  return new Date(guess);
}

export function getDayBoundariesInTimezone(
  now: Date = new Date(),
  timeZone: string = 'UTC',
): TimezoneDayBoundaries {
  if (!isValidIanaTimezone(timeZone)) {
    throw AppError.badRequest(`Invalid IANA timezone specified: '${timeZone}'.`);
  }

  // 1. Calculate the current local calendar date in the requested IANA timezone
  const parts = getZonedParts(now, timeZone);
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;

  // 2. Convert that date's local midnight into corresponding absolute timestamp
  const startOfToday = getStartOfLocalDay(year, month, day, timeZone);

  // 3. Independently calculate next calendar date's local midnight in that timezone
  const nextDateUtc = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  const nextYear = nextDateUtc.getUTCFullYear();
  const nextMonth = nextDateUtc.getUTCMonth() + 1;
  const nextDay = nextDateUtc.getUTCDate();

  const startOfNextDay = getStartOfLocalDay(nextYear, nextMonth, nextDay, timeZone);
  const endOfToday = new Date(startOfNextDay.getTime() - 1);

  return { startOfToday, startOfNextDay, endOfToday };
}

export function sortAssessmentsChronologically<
  T extends { date?: Date | string | null; id: string },
>(items: T[]): T[] {
  return items.sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    const diff = timeA - timeB;
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}
