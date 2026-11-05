import Dexie, { type Table } from 'dexie';
import type {
  Account, Bill, Budget, Category, CustomLanguage, Debt, Goal, GoalEntry, Rate,
  Recurring, Settings, Split, Template, Tombstone, Transaction, Trip,
} from './types';

/** IndexedDB database (Dexie). Indexed fields are listed after the primary key. */
export class MonetaDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  accounts!: Table<Account, string>;
  budgets!: Table<Budget, string>;
  goals!: Table<Goal, string>;
  goalEntries!: Table<GoalEntry, string>;
  debts!: Table<Debt, string>;
  bills!: Table<Bill, string>;
  recurring!: Table<Recurring, string>;
  templates!: Table<Template, string>;
  splits!: Table<Split, string>;
  trips!: Table<Trip, string>;
  rates!: Table<Rate, string>;
  languages!: Table<CustomLanguage, string>;
  settings!: Table<Settings, string>;
  tombstones!: Table<Tombstone, string>;

  constructor() {
    super('moneta');
    this.version(1).stores({
      transactions: 'id, date, type, accountId, toAccountId, categoryId, tripId, updatedAt, *tags',
      categories: 'id, kind, parentId, order, updatedAt',
      accounts: 'id, order, updatedAt',
      budgets: 'id, updatedAt',
      goals: 'id, updatedAt',
      goalEntries: 'id, goalId, date, updatedAt',
      debts: 'id, updatedAt',
      bills: 'id, dueDate, updatedAt',
      recurring: 'id, nextDate, updatedAt',
      templates: 'id, uses, updatedAt',
      splits: 'id, date, updatedAt',
      trips: 'id, updatedAt',
      rates: 'code',
      languages: 'code',
      settings: 'id',
      tombstones: 'key, deletedAt',
    });
  }
}

export const db = new MonetaDB();

/** Tables that hold user records and take part in sync and backup. */
export const SYNC_TABLES = [
  'transactions', 'categories', 'accounts', 'budgets', 'goals', 'goalEntries',
  'debts', 'bills', 'recurring', 'templates', 'splits', 'trips',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
