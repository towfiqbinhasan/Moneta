import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type {
  Account, Bill, Budget, Category, CustomLanguage, Debt, Goal, GoalEntry, Recurring, Settings,
  Split, Template, Transaction, Trip,
} from '@/db/types';
import type { RateMap } from '@/lib/rates';
import type { Ctx } from '@/lib/stats';
import { formatMoney, formatDate, formatNumber, type MoneyOpts } from '@/lib/format';
import { toBase } from '@/lib/stats';

/**
 * One reactive store over IndexedDB. A personal finance dataset comfortably
 * fits in memory, so every page reads from here and re-renders on any DB change.
 */
export interface Data {
  settings: Settings;
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  budgets: Budget[];
  goals: Goal[];
  goalEntries: GoalEntry[];
  debts: Debt[];
  bills: Bill[];
  recurring: Recurring[];
  templates: Template[];
  splits: Split[];
  trips: Trip[];
  languages: CustomLanguage[];
  rates: RateMap;
  ctx: Ctx;
  /** Format in any currency (defaults to base) */
  money: (v: number, currency?: string, opts?: MoneyOpts) => string;
  /** Convert to base and format */
  base: (v: number, currency: string, opts?: MoneyOpts) => string;
  date: (iso: string | Date, pattern?: string) => string;
  num: (v: number, decimals?: number) => string;
}

const DataCtx = createContext<Data | null>(null);

export function DataProvider({ children, settings }: { children: ReactNode; settings: Settings }) {
  const all = useLiveQuery(async () => {
    const [transactions, categories, accounts, budgets, goals, goalEntries, debts, bills, recurring, templates, splits, trips, rates, languages] =
      await Promise.all([
        db.transactions.orderBy('date').reverse().toArray(),
        db.categories.orderBy('order').toArray(),
        db.accounts.orderBy('order').toArray(),
        db.budgets.toArray(),
        db.goals.toArray(),
        db.goalEntries.toArray(),
        db.debts.toArray(),
        db.bills.orderBy('dueDate').toArray(),
        db.recurring.toArray(),
        db.templates.orderBy('uses').reverse().toArray(),
        db.splits.orderBy('date').reverse().toArray(),
        db.trips.toArray(),
        db.rates.toArray(),
        db.languages.toArray(),
      ]);
    return { transactions, categories, accounts, budgets, goals, goalEntries, debts, bills, recurring, templates, splits, trips, languages, rates: new Map(rates.map((r) => [r.code, r])) as RateMap };
  }, []);

  const value = useMemo<Data | null>(() => {
    if (!all) return null;
    const ctx: Ctx = { settings, rates: all.rates, categories: all.categories };
    return {
      ...all,
      settings,
      ctx,
      money: (v, currency = settings.baseCurrency, opts) => formatMoney(v, currency, settings, opts),
      base: (v, currency, opts) => formatMoney(toBase(v, currency, ctx), settings.baseCurrency, settings, opts),
      date: (iso, pattern) => formatDate(iso, settings, pattern),
      num: (v, d = 0) => formatNumber(v, d, settings),
    };
  }, [all, settings]);

  if (!value) return null;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Data {
  const v = useContext(DataCtx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}
