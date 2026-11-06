import {
  addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, endOfDay, endOfWeek,
  format, startOfDay, startOfWeek,
} from 'date-fns';
import type { Period, Settings } from '@/db/types';

/**
 * Period ranges that respect the user's first day of week and month start
 * day (e.g. salary on the 25th → "month" runs 25th → 24th).
 */

export interface Range {
  start: Date;
  end: Date; // inclusive (end of day)
}

export type PrefsLike = Pick<Settings, 'weekStartsOn' | 'monthStartDay'>;

export const isoDay = (d: Date) => format(d, 'yyyy-MM-dd');
export const isoDateTime = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

function safeMonthDay(y: number, m: number, day: number): Date {
  const maxDays = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, maxDays));
}

function monthStart(d: Date, startDay: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth();
  const candidate = safeMonthDay(y, m, startDay);
  return d >= candidate ? candidate : safeMonthDay(y, m - 1, startDay);
}

export function rangeFor(period: Period, ref: Date, p: PrefsLike): Range {
  switch (period) {
    case 'daily':
      return { start: startOfDay(ref), end: endOfDay(ref) };
    case 'weekly':
      return { start: startOfWeek(ref, { weekStartsOn: p.weekStartsOn }), end: endOfWeek(ref, { weekStartsOn: p.weekStartsOn }) };
    case 'monthly': {
      const start = monthStart(ref, p.monthStartDay);
      return { start, end: endOfDay(addDays(addMonths(start, 1), -1)) };
    }
    case 'yearly': {
      let s = new Date(ref.getFullYear(), 0, p.monthStartDay);
      if (ref < s) s = new Date(ref.getFullYear() - 1, 0, p.monthStartDay);
      return { start: s, end: endOfDay(addDays(addYears(s, 1), -1)) };
    }
  }
}

export function shiftRange(period: Period, ref: Date, steps: number): Date {
  switch (period) {
    case 'daily': return addDays(ref, steps);
    case 'weekly': return addWeeks(ref, steps);
    case 'monthly': return addMonths(ref, steps);
    case 'yearly': return addYears(ref, steps);
  }
}

export const inRange = (iso: string, r: Range) => {
  const d = new Date(iso);
  return d >= r.start && d <= r.end;
};

/** Days left in range including today. */
export const daysLeft = (r: Range, today = new Date()) => Math.max(1, differenceInCalendarDays(r.end, today) + 1);

/** ISO-string bounds for Dexie `between` queries on the `date` index. */
export const rangeKeys = (r: Range): [string, string] => [isoDateTime(r.start), isoDateTime(r.end).slice(0, 10) + 'T23:59~'];
