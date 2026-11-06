import { addDays, addMonths, addWeeks, addYears, format, parseISO } from 'date-fns';
import { db } from '@/db/db';
import { create } from '@/db/repo';
import type { Period, Recurring, Repeat, Transaction } from '@/db/types';
import { isoDay } from './period';
import { scheduleSync } from './sync';

/** Advance a yyyy-MM-dd date by one frequency step. */
export function nextOccurrence(date: string, freq: Period | Repeat, interval = 1): string {
  const d = parseISO(date);
  switch (freq) {
    case 'daily': return isoDay(addDays(d, interval));
    case 'weekly': return isoDay(addWeeks(d, interval));
    case 'monthly': return isoDay(addMonths(d, interval));
    case 'yearly': return isoDay(addYears(d, interval));
    default: return date;
  }
}

/**
 * Creates every recurring transaction that has fallen due (also catches up after
 * the app has been closed for a while). Safe to call repeatedly.
 */
export async function runRecurring(today = new Date()): Promise<number> {
  const todayIso = isoDay(today);
  const rules = (await db.recurring.toArray()).filter((r) => r.active && r.nextDate <= todayIso);
  let created = 0;
  for (const rule of rules) {
    let next = rule.nextDate;
    let guard = 0;
    while (next <= todayIso && (!rule.endDate || next <= rule.endDate) && guard++ < 400) {
      await create<Transaction>('transactions', {
        type: rule.type, amount: rule.amount, currency: rule.currency, accountId: rule.accountId,
        toAccountId: rule.toAccountId, categoryId: rule.categoryId, note: rule.note, tags: rule.tags,
        date: `${next}T${format(new Date(rule.createdAt), 'HH:mm')}`, recurringId: rule.id,
      });
      created++;
      next = nextOccurrence(next, rule.frequency, rule.interval);
    }
    const active = !rule.endDate || next <= rule.endDate;
    await db.recurring.put({ ...rule, nextDate: next, active, updatedAt: Date.now() } satisfies Recurring);
  }
  if (rules.length) scheduleSync();
  return created;
}
