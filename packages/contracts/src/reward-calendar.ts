export interface CalendarRewardMonths {
  timeZone: string;
  currentRewardMonth: string;
  qualificationMonth: string;
  currentActivityMonth: string;
  nextRewardMonth: string;
}

export interface CalendarRewardQuarter {
  key: string;
  firstMonth: string;
  lastMonth: string;
  expiresInMonth: string;
}

export function rewardCalendarInstant(value: string): Date {
  const match = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value)
    : null;
  if (!match) throw new Error('reward_calendar_timestamp_invalid');
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const instant = new Date(value);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(instant.getTime())) {
    throw new Error('reward_calendar_timestamp_invalid');
  }
  return instant;
}

function monthFormatter(timeZone: string): Intl.DateTimeFormat {
  if (typeof timeZone !== 'string' || !timeZone.trim()) throw new Error('reward_calendar_timezone_required');
  try {
    return new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit' });
  } catch {
    throw new Error('reward_calendar_timezone_invalid');
  }
}

function monthParts(month: string): { year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match || Number(match[1]) < 1) throw new Error('reward_calendar_month_invalid');
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function shiftRewardCalendarMonth(month: string, increment: number): string {
  const parts = monthParts(month);
  if (!Number.isSafeInteger(increment)) throw new Error('reward_calendar_month_increment_invalid');
  const index = parts.year * 12 + parts.month - 1 + increment;
  const year = Math.floor(index / 12);
  if (year < 1 || year > 9999) throw new Error('reward_calendar_month_invalid');
  return `${String(year).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
}

export function rewardCalendarMonthAt(instant: string, timeZone: string): string {
  const formatter = monthFormatter(timeZone);
  const parts = formatter.formatToParts(rewardCalendarInstant(instant));
  const year = parts.find((part) => part.type === 'year')!.value.padStart(4, '0');
  const month = parts.find((part) => part.type === 'month')!.value;
  const key = `${year}-${month}`;
  monthParts(key);
  return key;
}

export function calendarRewardMonths(asOf: string, timeZone: string): CalendarRewardMonths {
  const month = rewardCalendarMonthAt(asOf, timeZone);
  return {
    timeZone: monthFormatter(timeZone).resolvedOptions().timeZone,
    currentRewardMonth: month,
    qualificationMonth: shiftRewardCalendarMonth(month, -1),
    currentActivityMonth: month,
    nextRewardMonth: shiftRewardCalendarMonth(month, 1),
  };
}

export function calendarRewardQuarter(month: string): CalendarRewardQuarter {
  const parts = monthParts(month);
  const quarter = Math.floor((parts.month - 1) / 3) + 1;
  const firstMonth = `${String(parts.year).padStart(4, '0')}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}`;
  return {
    key: `${String(parts.year).padStart(4, '0')}-Q${quarter}`,
    firstMonth,
    lastMonth: shiftRewardCalendarMonth(firstMonth, 2),
    expiresInMonth: shiftRewardCalendarMonth(firstMonth, 3),
  };
}

export function quarterlyRewardTaskValidity(completedAt: string, asOf: string, timeZone: string) {
  const completion = rewardCalendarInstant(completedAt);
  const now = rewardCalendarInstant(asOf);
  const completedMonth = rewardCalendarMonthAt(completedAt, timeZone);
  const quarter = calendarRewardQuarter(completedMonth);
  return {
    timeZone: monthFormatter(timeZone).resolvedOptions().timeZone,
    completedAt: completion.toISOString(),
    validFrom: completion.toISOString(),
    quarter,
    valid: completion.getTime() <= now.getTime()
      && calendarRewardQuarter(rewardCalendarMonthAt(asOf, timeZone)).key === quarter.key,
    firstFollowingRewardMonth: shiftRewardCalendarMonth(completedMonth, 1),
  };
}
