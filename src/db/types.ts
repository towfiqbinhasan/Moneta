/**
 * Moneta data schema.
 * Every syncable record extends `Base`. Amounts are plain decimals in the
 * record's own currency; conversion to the base currency happens at read time.
 */

export interface Base {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** true = created by "Load demo data" (removable); false = was demo, now kept as the user's own */
  demo?: boolean;
}

export type TxType = 'expense' | 'income' | 'transfer';

export interface Transaction extends Base {
  type: TxType;
  amount: number;
  currency: string;
  accountId: string;
  /** Amount in the account's currency when the transaction currency differs (fixed at save time) */
  accountAmount?: number;
  /** Transfer destination account */
  toAccountId?: string;
  /** Amount received in the destination account's currency (cross-currency transfers) */
  toAmount?: number;
  categoryId?: string;
  /** Local date-time 'yyyy-MM-ddTHH:mm' */
  date: string;
  note: string;
  tags: string[];
  /** Compressed JPEG data URL */
  receipt?: string;
  tripId?: string;
  recurringId?: string;
}

export interface Category extends Base {
  name: string;
  kind: 'expense' | 'income';
  icon: string;
  color: string;
  parentId?: string;
  order: number;
}

export type AccountKind = 'cash' | 'bank' | 'card' | 'wallet' | 'other';

export interface Account extends Base {
  name: string;
  kind: AccountKind;
  currency: string;
  openingBalance: number;
  icon: string;
  color: string;
  order: number;
  archived: boolean;
  includeInTotal: boolean;
  /** Opening balance before demo data changed it (restored by "Remove demo data") */
  demoOpening?: number;
  /** The opening balance demo data set; if the user changed it since, theirs is kept */
  demoBalance?: number;
}

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Budget extends Base {
  name: string;
  period: Period;
  amount: number;
  currency: string;
  /** Empty = overall budget across all expense categories */
  categoryIds: string[];
  rollover: boolean;
  alertPercent: number;
}

export interface Goal extends Base {
  name: string;
  target: number;
  currency: string;
  deadline?: string; // yyyy-MM-dd
  icon: string;
  color: string;
  /** Optional cover picture (compressed JPEG data URL) */
  image?: string;
  /** Milestones (25/50/75/100) already celebrated */
  milestones: number[];
}

export interface GoalEntry extends Base {
  goalId: string;
  amount: number; // + deposit, − withdraw
  date: string;
  note: string;
}

export interface DebtPayment {
  id: string;
  amount: number;
  date: string;
}

export interface Debt extends Base {
  direction: 'owe' | 'owed'; // owe = I owe them; owed = they owe me
  person: string;
  amount: number;
  currency: string;
  dueDate?: string;
  note: string;
  payments: DebtPayment[];
  remind: boolean;
}

export type Repeat = 'none' | 'weekly' | 'monthly' | 'yearly';

export interface Bill extends Base {
  name: string;
  amount: number;
  currency: string;
  categoryId?: string;
  accountId?: string;
  dueDate: string; // yyyy-MM-dd
  /** Day of month the schedule is anchored to (keeps the 31st after a short month) */
  anchorDay?: number;
  repeat: Repeat;
  remindDaysBefore: number;
  lastPaid?: string;
}

/** Fields shared by recurring rules and templates */
export interface TxTemplateFields {
  type: TxType;
  amount: number;
  currency: string;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  note: string;
  tags: string[];
}

export interface Recurring extends Base, TxTemplateFields {
  frequency: Period;
  interval: number;
  nextDate: string; // yyyy-MM-dd
  /** Day of month the schedule is anchored to (keeps the 31st after a short month) */
  anchorDay?: number;
  endDate?: string;
  active: boolean;
}

export interface Template extends Base, TxTemplateFields {
  name: string;
  uses: number;
}

export interface SplitParticipant {
  name: string;
  share: number;
  paid: boolean;
}

export interface Split extends Base {
  title: string;
  total: number;
  currency: string;
  date: string;
  participants: SplitParticipant[];
}

export interface Trip extends Base {
  name: string;
  currency: string;
  budget: number;
  startDate: string;
  endDate: string;
  active: boolean;
}

export interface Rate {
  code: string;
  /** Units of this currency per 1 USD (from the API) */
  perUsd?: number;
  /** Manual override: 1 unit of this currency = X base currency */
  manualPerBase?: number;
  updatedAt: number;
}

export interface CustomLanguage {
  code: string;
  name: string;
  dir: 'ltr' | 'rtl';
  /** Flat key → string map ('nav.home': '…') */
  strings: Record<string, string>;
  updatedAt: number;
}

export type Grouping = 'western' | 'indian' | 'none';
export type DigitStyle = 'latn' | 'beng' | 'arab' | 'deva';

export interface CurrencyFormat {
  symbol?: string;
  position?: 'before' | 'after';
  decimals?: number;
  space?: boolean;
}

export type ThemeStyle = 'normal' | 'morphism' | 'brutal';

export type WidgetId =
  | 'quick' | 'balance' | 'summary' | 'alerts' | 'budgets' | 'pie' | 'trend'
  | 'incomeExpense' | 'top5' | 'comparison' | 'goals' | 'health' | 'trip' | 'recent';

export interface Settings {
  id: 'app';
  setupDone: boolean;
  language: string;
  country: string;
  baseCurrency: string;
  decimalSep: string;
  groupSep: string;
  grouping: Grouping;
  digitStyle: DigitStyle;
  currencyFormats: Record<string, CurrencyFormat>;
  dateFormat: string; // date-fns pattern
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  monthStartDay: number; // 1–28
  /** Colour mode */
  theme: 'light' | 'dark' | 'system';
  /** Surface style: receipt (normal), glass (morphism) or neo-brutalist */
  style: ThemeStyle;
  accent: string; // hex
  profile: { name: string; avatar?: string };
  widgets: { id: WidgetId; visible: boolean }[];
  lock: { enabled: boolean; pinHash?: string; salt?: string; pinLength?: number; biometricId?: string };
  dailyReminder: { enabled: boolean; time: string };
  activeTripId?: string;
  lastAccountId?: string;
  ratesFetchedAt?: number;
  lastSyncAt?: number;
  /** Server timestamp of the newest pulled cloud row */
  lastPullAt?: string;
  /** Supabase user this device's data belongs to (device-local) */
  syncUserId?: string;
  updatedAt: number;
}

export interface Tombstone {
  key: string; // `${table}:${id}`
  table: string;
  recordId: string;
  deletedAt: number;
}
