import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import type { Account, Budget, Category, Debt, Goal, GoalEntry, Settings, Transaction } from '@/db/types';
import { defaultDecimals } from './currency';
import { convert, type RateMap } from './rates';
import { inRange, rangeFor, shiftRange, daysLeft, type Range, isoDay } from './period';
import { clamp, round, sum } from './utils';

/** All computations are pure: given data + settings + rates → numbers. */

export interface Ctx {
  settings: Settings;
  rates: RateMap;
  categories: Category[];
}

export const toBase = (amount: number, currency: string, c: Ctx) =>
  convert(amount, currency, c.settings.baseCurrency, c.settings.baseCurrency, c.rates);

export const toCur = (amount: number, from: string, to: string, c: Ctx) =>
  convert(amount, from, to, c.settings.baseCurrency, c.rates);

/* ------------------------------ Accounts ------------------------------ */

export function accountBalance(acc: Account, txs: Transaction[]): number {
  let bal = acc.openingBalance;
  for (const t of txs) {
    if (t.accountId === acc.id) {
      const amt = t.accountAmount ?? t.amount;
      if (t.type === 'income') bal += amt;
      else bal -= amt; // expense or transfer out
    }
    if (t.type === 'transfer' && t.toAccountId === acc.id) bal += t.toAmount ?? t.amount;
  }
  return bal;
}

export function netWorth(accounts: Account[], txs: Transaction[], c: Ctx): number {
  return sum(accounts.filter((a) => a.includeInTotal && !a.archived).map((a) => toBase(accountBalance(a, txs), a.currency, c)));
}

/* ------------------------------ Totals ------------------------------ */

export const txIn = (txs: Transaction[], r: Range) => txs.filter((t) => inRange(t.date, r));

export function totals(txs: Transaction[], c: Ctx) {
  let expense = 0;
  let income = 0;
  for (const t of txs) {
    if (t.type === 'expense') expense += toBase(t.amount, t.currency, c);
    else if (t.type === 'income') income += toBase(t.amount, t.currency, c);
  }
  return { expense, income, net: income - expense };
}

/** Category id → its top-level parent id (subcategories roll up). */
export function rootOf(categoryId: string | undefined, cats: Category[]): string {
  if (!categoryId) return 'none';
  const c = cats.find((x) => x.id === categoryId);
  return c?.parentId ?? categoryId;
}

/** Totals by top-level category, sorted desc. */
export function byCategory(txs: Transaction[], c: Ctx, kind: 'expense' | 'income' = 'expense') {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== kind) continue;
    const k = rootOf(t.categoryId, c.categories);
    map.set(k, (map.get(k) ?? 0) + toBase(t.amount, t.currency, c));
  }
  return [...map.entries()]
    .map(([id, value]) => ({ id, value, category: c.categories.find((x) => x.id === id) }))
    .sort((a, b) => b.value - a.value);
}

/** Daily expense totals for the last `days` days (oldest first). */
export function dailySeries(txs: Transaction[], c: Ctx, days = 14, end = new Date()) {
  const start = startOfDay(addDays(end, -(days - 1)));
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) buckets.set(isoDay(addDays(start, i)), 0);
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    const k = t.date.slice(0, 10);
    if (buckets.has(k)) buckets.set(k, buckets.get(k)! + toBase(t.amount, t.currency, c));
  }
  return [...buckets.entries()].map(([date, value]) => ({ date, value }));
}

/** Income vs expense per period (default: last 6 months). */
export function periodSeries(txs: Transaction[], c: Ctx, count = 6, period: 'monthly' | 'weekly' | 'yearly' = 'monthly') {
  const out: { start: Date; income: number; expense: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const r = rangeFor(period, shiftRange(period, new Date(), -i), c.settings);
    const tt = totals(txIn(txs, r), c);
    out.push({ start: r.start, income: tt.income, expense: tt.expense });
  }
  return out;
}

/* ------------------------------ Budgets ------------------------------ */

export type BudgetState = 'safe' | 'warn' | 'over';

export interface BudgetStatus {
  range: Range;
  spent: number;
  limit: number;
  carry: number;
  pct: number;
  state: BudgetState;
  perDay: number;
  daysLeft: number;
}

function budgetSpent(b: Budget, txs: Transaction[], r: Range, c: Ctx) {
  const ids = new Set(b.categoryIds);
  let total = 0;
  for (const t of txs) {
    if (t.type !== 'expense' || !inRange(t.date, r)) continue;
    if (ids.size && !ids.has(t.categoryId ?? '') && !ids.has(rootOf(t.categoryId, c.categories))) continue;
    total += toCur(t.amount, t.currency, b.currency, c);
  }
  return total;
}

export function budgetStatus(b: Budget, txs: Transaction[], c: Ctx, ref = new Date()): BudgetStatus {
  const r = rangeFor(b.period, ref, c.settings);
  let carry = 0;
  if (b.rollover) {
    // Walk back through previous periods (up to 36) since the budget was created.
    const created = new Date(b.createdAt);
    for (let i = 1; i <= 36; i++) {
      const pr = rangeFor(b.period, shiftRange(b.period, ref, -i), c.settings);
      if (pr.end < created) break;
      carry += Math.max(0, b.amount - budgetSpent(b, txs, pr, c));
    }
  }
  const spent = budgetSpent(b, txs, r, c);
  const limit = b.amount + carry;
  const pct = limit > 0 ? spent / limit : spent > 0 ? 1 : 0;
  const state: BudgetState = pct >= 1 ? 'over' : pct * 100 >= b.alertPercent ? 'warn' : 'safe';
  const dl = daysLeft(r, ref);
  return { range: r, spent, limit, carry, pct, state, perDay: Math.max(0, limit - spent) / dl, daysLeft: dl };
}

/* ------------------------------ Goals ------------------------------ */

export function goalStatus(g: Goal, entries: GoalEntry[], today = new Date()) {
  const mine = entries.filter((e) => e.goalId === g.id).sort((a, b) => a.date.localeCompare(b.date));
  const saved = sum(mine.map((e) => e.amount));
  const remaining = Math.max(0, g.target - saved);
  const pct = g.target > 0 ? clamp(saved / g.target, 0, 1) : 0;
  let perDayNeeded: number | undefined;
  let daysToDeadline: number | undefined;
  if (g.deadline) {
    daysToDeadline = differenceInCalendarDays(parseISO(g.deadline), today) // local date, not UTC;
    perDayNeeded = daysToDeadline > 0 ? remaining / daysToDeadline : remaining;
  }
  // Estimated completion from average pace since first deposit.
  let eta: Date | undefined;
  if (mine.length && remaining > 0 && saved > 0) {
    const days = Math.max(1, differenceInCalendarDays(today, parseISO(mine[0].date)) + 1);
    const pace = saved / days;
    if (pace > 0) eta = addDays(today, Math.ceil(remaining / pace));
  }
  return { saved, remaining, pct, perDayNeeded, daysToDeadline, eta, entries: mine };
}

/* ------------------------------ Debts ------------------------------ */

/** Paid and remaining on a debt, rounded to the currency so 6.6 + 10.2 + 3.2 settles 20 exactly. */
export function debtLeft(d: Debt) {
  const dec = defaultDecimals(d.currency);
  const paid = round(sum(d.payments.map((p) => p.amount)), dec);
  return { paid, left: Math.max(0, round(d.amount - paid, dec)) };
}

/* ------------------------------ Insights ------------------------------ */

export interface Insight {
  key: string; // i18n key
  vars: Record<string, string | number>;
  tone: 'good' | 'bad' | 'info';
}

/**
 * Compares this period to date with the same number of days of the previous period
 * so mid-month comparisons are fair.
 */
export function insights(txs: Transaction[], c: Ctx, ref = new Date()): Insight[] {
  const cur = rangeFor('monthly', ref, c.settings);
  const elapsed = differenceInCalendarDays(ref, cur.start);
  const prevStart = rangeFor('monthly', shiftRange('monthly', ref, -1), c.settings).start;
  const prevEnd = rangeFor('monthly', shiftRange('monthly', ref, -1), c.settings).end;
  // Same number of days, but never past the end of the previous month (e.g. on Mar 31 vs. February).
  const sameDay = addDays(prevStart, elapsed + 1);
  const prev: Range = { start: prevStart, end: sameDay < prevEnd ? sameDay : prevEnd };
  const curTx = txIn(txs, { start: cur.start, end: ref });
  const prevTx = txIn(txs, prev);
  const out: Insight[] = [];

  const a = totals(curTx, c);
  const b = totals(prevTx, c);
  if (b.expense > 0) {
    const ch = ((a.expense - b.expense) / b.expense) * 100;
    if (Math.abs(ch) >= 5) out.push({ key: ch > 0 ? 'insight.totalMore' : 'insight.totalLess', vars: { pct: Math.round(Math.abs(ch)) }, tone: ch > 0 ? 'bad' : 'good' });
  }
  const curCats = byCategory(curTx, c);
  const prevCats = new Map(byCategory(prevTx, c).map((x) => [x.id, x.value]));
  for (const cc of curCats.slice(0, 6)) {
    const pv = prevCats.get(cc.id);
    if (!pv || !cc.category) continue;
    const ch = ((cc.value - pv) / pv) * 100;
    if (Math.abs(ch) >= 15) out.push({ key: ch > 0 ? 'insight.catMore' : 'insight.catLess', vars: { pct: Math.round(Math.abs(ch)), cat: cc.category.name }, tone: ch > 0 ? 'bad' : 'good' });
  }
  if (curCats[0]?.category && a.expense > 0) {
    out.push({ key: 'insight.topCat', vars: { cat: curCats[0].category.name, pct: Math.round((curCats[0].value / a.expense) * 100) }, tone: 'info' });
  }
  if (a.income > 0) {
    const rate = ((a.income - a.expense) / a.income) * 100;
    out.push({ key: rate >= 0 ? 'insight.savingRate' : 'insight.overspend', vars: { pct: Math.round(Math.abs(rate)) }, tone: rate >= 20 ? 'good' : rate >= 0 ? 'info' : 'bad' });
  }
  return out.slice(0, 5);
}

/* --------------------------- Health score --------------------------- */

/**
 * Monthly financial health score (0–100):
 *  - Savings rate (40): 20%+ of income saved = full marks
 *  - Budget adherence (30): share of budgets not exceeded
 *  - Spending stability (15): fewer days above 2× the daily average
 *  - Debt load (15): outstanding "I owe" vs monthly income
 */
export function healthScore(txs: Transaction[], budgets: Budget[], debtOwed: number, c: Ctx, ref = new Date()) {
  const r = rangeFor('monthly', ref, c.settings);
  const monthTx = txIn(txs, r);
  const t = totals(monthTx, c);
  const savingsRate = t.income > 0 ? (t.income - t.expense) / t.income : t.expense > 0 ? -1 : 0;
  const s1 = clamp(savingsRate / 0.2, 0, 1) * 40;

  const statuses = budgets.map((b) => budgetStatus(b, txs, c, ref));
  const s2 = statuses.length ? (statuses.filter((s) => s.state !== 'over').length / statuses.length) * 30 : 20;

  const days = Math.max(1, differenceInCalendarDays(ref, r.start) + 1);
  const series = dailySeries(monthTx, c, days, ref);
  const avg = t.expense / days;
  const spikes = series.filter((d) => avg > 0 && d.value > avg * 2).length;
  const s3 = clamp(1 - spikes / Math.max(4, days / 3), 0, 1) * 15;

  const s4 = t.income > 0 ? clamp(1 - debtOwed / (t.income * 3), 0, 1) * 15 : debtOwed > 0 ? 5 : 15;

  const score = Math.round(s1 + s2 + s3 + s4);
  return { score, parts: { savings: Math.round(s1), budgets: Math.round(s2), stability: Math.round(s3), debt: Math.round(s4) } };
}
