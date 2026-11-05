import { addDays, format, subDays } from 'date-fns';
import { db } from './db';
import { CATEGORY_SETS, DEFAULT_ACCOUNTS } from './defaults';
import type { Account, Bill, Budget, Category, Debt, Goal, GoalEntry, Recurring, Split, Template, Transaction, Trip } from './types';
import { uid, round } from '@/lib/utils';
import { isoDay } from '@/lib/period';
import { defaultDecimals } from '@/lib/currency';

type T = (k: string) => string;
const now = () => Date.now();
const base = () => ({ id: uid(), createdAt: now(), updatedAt: now() });

/** Insert a category set, translating names into the current language. */
export async function seedCategories(preset: string, t: T) {
  const set = CATEGORY_SETS[preset] ?? CATEGORY_SETS.standard;
  const startOrder = ((await db.categories.orderBy('order').last())?.order ?? 0) + 1;
  const rows: Category[] = [];
  let order = startOrder;
  for (const kind of ['expense', 'income'] as const) {
    for (const s of set[kind]) {
      const parent: Category = { ...base(), name: t(`cat.${s.key}`), kind, icon: s.icon, color: s.color, order: order++ };
      rows.push(parent);
      for (const sub of s.subs ?? []) rows.push({ ...base(), name: t(`cat.${sub}`), kind, icon: s.icon, color: s.color, parentId: parent.id, order: order++ });
    }
  }
  await db.categories.bulkPut(rows);
  return rows;
}

export async function seedAccounts(currency: string, t: T) {
  const rows: Account[] = DEFAULT_ACCOUNTS.map((a, i) => ({
    ...base(), name: t(`acc.default.${a.key}`), kind: a.kind, currency, openingBalance: 0, icon: a.icon, color: a.color,
    order: i, archived: false, includeInTotal: true,
  }));
  await db.accounts.bulkPut(rows);
  return rows;
}

/**
 * Demo data: ~90 days of realistic entries in the base currency, plus budgets,
 * goals, a debt, bills, a recurring rule, templates, a split and a trip.
 * Amounts scale with the currency (e.g. BDT/INR amounts are larger than EUR).
 */
export async function seedDemo(currency: string, t: T) {
  const scale = ({ BDT: 100, INR: 80, PKR: 250, NPR: 130, JPY: 140, KRW: 1300, IDR: 15000, VND: 24000, NOK: 10, SEK: 10, DKK: 7, HUF: 360, LKR: 300, NGN: 1500, KES: 130 } as Record<string, number>)[currency] ?? 1;
  const dec = defaultDecimals(currency);
  const amt = (v: number) => round(v * scale, scale >= 50 ? 0 : dec);

  let cats = await db.categories.toArray();
  if (!cats.length) cats = await seedCategories('standard', t);
  let accs = await db.accounts.orderBy('order').toArray();
  if (!accs.length) accs = await seedAccounts(currency, t);
  const cash = accs[0];
  const bank = accs[1] ?? accs[0];

  // An extra wallet in the base currency + a USD account to demo multi-currency.
  const wallet: Account = { ...base(), name: 'Mobile Wallet', kind: 'wallet', currency, openingBalance: amt(40), icon: 'smartphone', color: '#e34948', order: accs.length, archived: false, includeInTotal: true };
  const usd: Account = { ...base(), name: 'USD Savings', kind: 'bank', currency: currency === 'USD' ? 'EUR' : 'USD', openingBalance: 500, icon: 'landmark', color: '#6250d6', order: accs.length + 1, archived: false, includeInTotal: true };
  await db.accounts.bulkPut([wallet, usd]);
  await db.accounts.update(cash.id, { openingBalance: amt(120) });
  await db.accounts.update(bank.id, { openingBalance: amt(1500) });

  const top = (kind: 'expense' | 'income') => cats.filter((c) => c.kind === kind && !c.parentId);
  const byIcon = (icon: string, kind: 'expense' | 'income' = 'expense') => cats.find((c) => c.kind === kind && c.icon === icon && !c.parentId) ?? top(kind)[0];
  const food = byIcon('utensils'), transport = byIcon('bus'), groceries = byIcon('shopping-basket'), rent = byIcon('home');
  const util = byIcon('zap'), phone = byIcon('wifi'), shopping = byIcon('shopping-bag'), fun = byIcon('film'), health = byIcon('heart-pulse');
  const salary = byIcon('briefcase', 'income'), freelance = byIcon('laptop', 'income');

  const txs: Transaction[] = [];
  const add = (daysAgo: number, type: Transaction['type'], c: Category | undefined, value: number, acc: Account, note = '', tags: string[] = [], hour = 13) => {
    const d = subDays(new Date(), daysAgo);
    d.setHours(hour, Math.floor(Math.random() * 60));
    txs.push({ ...base(), type, amount: value, currency: acc.currency, accountId: acc.id, categoryId: c?.id, date: format(d, "yyyy-MM-dd'T'HH:mm"), note, tags });
  };
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  for (let day = 0; day < 90; day++) {
    if (Math.random() < 0.85) add(day, 'expense', food, amt(rnd(4, 14)), Math.random() < 0.6 ? cash : wallet, Math.random() < 0.3 ? 'Lunch' : '', [], 13);
    if (Math.random() < 0.6) add(day, 'expense', transport, amt(rnd(1.5, 6)), cash, '', Math.random() < 0.3 ? ['work'] : [], 9);
    if (day % 4 === 0) add(day, 'expense', groceries, amt(rnd(15, 45)), bank, 'Supermarket', ['family'], 18);
    if (day % 9 === 0) add(day, 'expense', fun, amt(rnd(8, 25)), wallet, 'Movie', [], 20);
    if (day % 13 === 0) add(day, 'expense', shopping, amt(rnd(20, 70)), bank, '', [], 17);
    if (day === 21 || day === 63) add(day, 'expense', health, amt(rnd(15, 40)), cash, 'Pharmacy', ['family'], 11);
  }
  for (const m of [2, 32, 62]) {
    add(m, 'income', salary, amt(1800), bank, 'Salary', ['work'], 10);
    add(m + 1, 'expense', rent, amt(550), bank, 'Rent', [], 10);
    add(m + 4, 'expense', util, amt(rnd(35, 60)), bank, 'Electricity', [], 10);
    add(m + 5, 'expense', phone, amt(20), wallet, 'Internet', [], 10);
  }
  add(15, 'income', freelance, amt(320), wallet, 'Website project', ['work'], 16);
  add(48, 'income', freelance, 150, usd, 'Logo design', ['work'], 16);
  // Monthly ATM withdrawals (bank → cash) and wallet top-ups (bank → wallet) keep balances realistic.
  const transfer = (daysAgo: number, to: Account, value: number, note: string) =>
    txs.push({ ...base(), type: 'transfer', amount: value, currency: bank.currency, accountId: bank.id, toAccountId: to.id, toAmount: value, date: format(subDays(new Date(), daysAgo), "yyyy-MM-dd'T'10:30"), note, tags: [] });
  for (const d of [88, 74, 58, 44, 28, 14]) {
    transfer(d, cash, amt(130), 'ATM');
    transfer(d - 1, wallet, amt(80), 'Top-up');
  }
  await db.transactions.bulkPut(txs);

  const budgets: Budget[] = [
    { ...base(), createdAt: subDays(new Date(), 70).getTime(), name: t('budget.overall'), period: 'monthly', amount: amt(1400), currency, categoryIds: [], rollover: false, alertPercent: 80 },
    { ...base(), name: food.name, period: 'monthly', amount: amt(260), currency, categoryIds: [food.id], rollover: true, alertPercent: 80 },
    { ...base(), name: fun.name, period: 'weekly', amount: amt(25), currency, categoryIds: [fun.id], rollover: false, alertPercent: 80 },
  ];
  await db.budgets.bulkPut(budgets);

  const g1: Goal = { ...base(), name: 'Emergency fund', target: amt(3000), currency, deadline: isoDay(addDays(new Date(), 240)), icon: 'umbrella', color: '#1baf7a', milestones: [25] };
  const g2: Goal = { ...base(), name: 'New laptop', target: amt(1200), currency, deadline: isoDay(addDays(new Date(), 120)), icon: 'laptop', color: '#6250d6', milestones: [25, 50] };
  await db.goals.bulkPut([g1, g2]);
  const entries: GoalEntry[] = [
    { ...base(), goalId: g1.id, amount: amt(400), date: isoDay(subDays(new Date(), 60)), note: '' },
    { ...base(), goalId: g1.id, amount: amt(350), date: isoDay(subDays(new Date(), 30)), note: '' },
    { ...base(), goalId: g2.id, amount: amt(500), date: isoDay(subDays(new Date(), 45)), note: '' },
    { ...base(), goalId: g2.id, amount: amt(150), date: isoDay(subDays(new Date(), 10)), note: '' },
  ];
  await db.goalEntries.bulkPut(entries);

  const debts: Debt[] = [
    { ...base(), direction: 'owed', person: 'Rahim', amount: amt(80), currency, dueDate: isoDay(addDays(new Date(), 2)), note: 'Concert tickets', payments: [{ id: uid(), amount: amt(30), date: isoDay(subDays(new Date(), 3)) }], remind: true },
    { ...base(), direction: 'owe', person: 'Anna', amount: amt(150), currency, dueDate: isoDay(addDays(new Date(), 20)), note: '', payments: [], remind: true },
  ];
  await db.debts.bulkPut(debts);

  const bills: Bill[] = [
    { ...base(), name: 'Internet', amount: amt(20), currency, categoryId: phone.id, accountId: wallet.id, dueDate: isoDay(addDays(new Date(), 1)), repeat: 'monthly', remindDaysBefore: 3 },
    { ...base(), name: 'Electricity', amount: amt(45), currency, categoryId: util.id, accountId: bank.id, dueDate: isoDay(addDays(new Date(), 9)), repeat: 'monthly', remindDaysBefore: 3 },
  ];
  await db.bills.bulkPut(bills);

  const rec: Recurring = { ...base(), type: 'expense', amount: amt(9.99), currency, accountId: bank.id, categoryId: fun.id, note: 'Streaming subscription', tags: [], frequency: 'monthly', interval: 1, nextDate: isoDay(addDays(new Date(), 12)), active: true };
  await db.recurring.put(rec);

  const tpls: Template[] = [
    { ...base(), name: 'Coffee', type: 'expense', amount: amt(3), currency, accountId: cash.id, categoryId: food.id, note: 'Coffee', tags: [], uses: 12 },
    { ...base(), name: 'Bus', type: 'expense', amount: amt(1.5), currency, accountId: cash.id, categoryId: transport.id, note: '', tags: ['work'], uses: 8 },
  ];
  await db.templates.bulkPut(tpls);

  const split: Split = { ...base(), title: 'Dinner with friends', total: amt(90), currency, date: isoDay(subDays(new Date(), 4)), participants: [
    { name: t('split.me'), share: amt(30), paid: true }, { name: 'Rahim', share: amt(30), paid: true }, { name: 'Sara', share: amt(30), paid: false },
  ] };
  await db.splits.put(split);

  const trip: Trip = { ...base(), name: 'Trip to Bangkok', currency: currency === 'THB' ? 'USD' : 'THB', budget: 30000, startDate: isoDay(addDays(new Date(), 30)), endDate: isoDay(addDays(new Date(), 37)), active: false };
  await db.trips.put(trip);
}
