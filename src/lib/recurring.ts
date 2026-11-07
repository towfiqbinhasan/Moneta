import { addDays, addMonths, addWeeks, addYears, format, getDaysInMonth, parseISO, setDate } from 'date-fns';
import { db } from '@/db/db';
import { create } from '@/db/repo';
import type { Period, Recurring, Repeat, Transaction } from '@/db/types';
import { isoDay } from './period';
import { scheduleSync } from './sync';
import { convert, type RateMap } from './rates';
import { defaultDecimals } from './currency';
import { round } from './utils';

/**
 * Advance a yyyy-MM-dd date by one frequency step. `anchorDay` is the day of month the
 * schedule really wants (e.g. 31), so Jan 31 → Feb 28 → Mar 31 instead of sticking on the 28th.
 */
export function nextOccurrence(date: string, freq: Period | Repeat, interval = 1, anchorDay?: number): string {
  const d = parseISO(date);
  const anchored = (x: Date) => (anchorDay ? setDate(x, Math.min(anchorDay, getDaysInMonth(x))) : x);
  switch (freq) {
    case 'daily': return isoDay(addDays(d, interval));
    case 'weekly': return isoDay(addWeeks(d, interval));
    case 'monthly': return isoDay(anchored(addMonths(d, interval)));
    case 'yearly': return isoDay(anchored(addYears(d, interval)));
    default: return date;
  }
}

/** Day of month a schedule is anchored to: the stored one, else the date's own day. */
export const anchorOf = (date: string, anchorDay?: number) => anchorDay ?? Number(date.slice(8, 10));

/** Amount in the account's currency when an entry's currency differs (same rule as QuickAdd). */
export async function accountAmountFor(amount: number, currency: string, accountId: string): Promise<number | undefined> {
  const [acc, settings, rates] = await Promise.all([db.accounts.get(accountId), db.settings.get('app'), db.rates.toArray()]);
  if (!acc || acc.currency === currency || !settings) return undefined;
  const map = new Map(rates.map((r) => [r.code, r])) as RateMap;
  return round(convert(amount, currency, acc.currency, settings.baseCurrency, map), defaultDecimals(acc.currency));
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
    const anchorDay = anchorOf(rule.nextDate, rule.anchorDay);
    const accountAmount = rule.type === 'transfer' ? undefined : await accountAmountFor(rule.amount, rule.currency, rule.accountId);
    const toAmount = rule.type === 'transfer' && rule.toAccountId ? await accountAmountFor(rule.amount, rule.currency, rule.toAccountId) : undefined;
    let guard = 0;
    while (next <= todayIso && (!rule.endDate || next <= rule.endDate) && guard++ < 400) {
      // Deterministic id: if another device/tab already generated this occurrence, it is the same record, not a duplicate.
      const id = `${rule.id}:${next}`;
      if (!(await db.transactions.get(id))) {
        await create<Transaction>('transactions', {
          id, type: rule.type, amount: rule.amount, currency: rule.currency, accountId: rule.accountId, accountAmount,
          toAccountId: rule.toAccountId, toAmount,
          categoryId: rule.categoryId, note: rule.note, tags: rule.tags,
          date: `${next}T${format(new Date(rule.createdAt), 'HH:mm')}`, recurringId: rule.id,
        });
        created++;
      }
      next = nextOccurrence(next, rule.frequency, rule.interval, anchorDay);
    }
    const active = !rule.endDate || next <= rule.endDate;
    await db.recurring.put({ ...rule, nextDate: next, anchorDay, active, updatedAt: Date.now() } satisfies Recurring);
  }
  if (rules.length) scheduleSync();
  return created;
}
