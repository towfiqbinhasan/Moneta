import type { Settings, WidgetId } from './types';

/**
 * Countries → sensible defaults (currency, language, number & date format).
 * Anything here is only a starting point; every value is editable in Settings.
 */
export interface CountryPreset {
  code: string;
  currency: string;
  language: string;
  decimalSep: string;
  groupSep: string;
  grouping: Settings['grouping'];
  dateFormat: string;
  weekStartsOn: Settings['weekStartsOn'];
}

const P = (
  code: string, currency: string, language: string, fmt: 'us' | 'eu' | 'in' | 'ch' | 'no' | 'fr' = 'us',
  dateFormat = 'dd/MM/yyyy', weekStartsOn: Settings['weekStartsOn'] = 1,
): CountryPreset => {
  const f = {
    us: { decimalSep: '.', groupSep: ',', grouping: 'western' as const },
    eu: { decimalSep: ',', groupSep: '.', grouping: 'western' as const },
    in: { decimalSep: '.', groupSep: ',', grouping: 'indian' as const },
    ch: { decimalSep: '.', groupSep: '’', grouping: 'western' as const },
    no: { decimalSep: ',', groupSep: ' ', grouping: 'western' as const },
    fr: { decimalSep: ',', groupSep: ' ', grouping: 'western' as const },
  }[fmt];
  return { code, currency, language, ...f, dateFormat, weekStartsOn };
};

export const COUNTRIES: CountryPreset[] = [
  P('BD', 'BDT', 'bn', 'in', 'dd/MM/yyyy', 6),
  P('IN', 'INR', 'hi', 'in', 'dd/MM/yyyy', 1),
  P('PK', 'PKR', 'en', 'us', 'dd/MM/yyyy', 1),
  P('NP', 'NPR', 'en', 'in', 'yyyy-MM-dd', 0),
  P('LK', 'LKR', 'en', 'us', 'dd/MM/yyyy', 1),
  P('US', 'USD', 'en', 'us', 'MM/dd/yyyy', 0),
  P('GB', 'GBP', 'en', 'us', 'dd/MM/yyyy', 1),
  P('CA', 'CAD', 'en', 'us', 'yyyy-MM-dd', 0),
  P('AU', 'AUD', 'en', 'us', 'dd/MM/yyyy', 1),
  P('NZ', 'NZD', 'en', 'us', 'dd/MM/yyyy', 1),
  P('IE', 'EUR', 'en', 'us', 'dd/MM/yyyy', 1),
  P('DE', 'EUR', 'de', 'eu', 'dd.MM.yyyy', 1),
  P('AT', 'EUR', 'de', 'eu', 'dd.MM.yyyy', 1),
  P('CH', 'CHF', 'de', 'ch', 'dd.MM.yyyy', 1),
  P('NO', 'NOK', 'nb', 'no', 'dd.MM.yyyy', 1),
  P('SE', 'SEK', 'en', 'no', 'yyyy-MM-dd', 1),
  P('DK', 'DKK', 'en', 'eu', 'dd.MM.yyyy', 1),
  P('FI', 'EUR', 'en', 'no', 'dd.MM.yyyy', 1),
  P('NL', 'EUR', 'en', 'eu', 'dd/MM/yyyy', 1),
  P('BE', 'EUR', 'en', 'eu', 'dd/MM/yyyy', 1),
  P('FR', 'EUR', 'en', 'fr', 'dd/MM/yyyy', 1),
  P('ES', 'EUR', 'en', 'eu', 'dd/MM/yyyy', 1),
  P('IT', 'EUR', 'en', 'eu', 'dd/MM/yyyy', 1),
  P('PT', 'EUR', 'en', 'eu', 'dd/MM/yyyy', 1),
  P('PL', 'PLN', 'en', 'no', 'dd.MM.yyyy', 1),
  P('TR', 'TRY', 'en', 'eu', 'dd.MM.yyyy', 1),
  P('RU', 'RUB', 'en', 'no', 'dd.MM.yyyy', 1),
  P('SA', 'SAR', 'en', 'us', 'dd/MM/yyyy', 0),
  P('AE', 'AED', 'en', 'us', 'dd/MM/yyyy', 1),
  P('QA', 'QAR', 'en', 'us', 'dd/MM/yyyy', 0),
  P('KW', 'KWD', 'en', 'us', 'dd/MM/yyyy', 0),
  P('OM', 'OMR', 'en', 'us', 'dd/MM/yyyy', 0),
  P('BH', 'BHD', 'en', 'us', 'dd/MM/yyyy', 0),
  P('EG', 'EGP', 'en', 'us', 'dd/MM/yyyy', 6),
  P('MY', 'MYR', 'en', 'us', 'dd/MM/yyyy', 1),
  P('SG', 'SGD', 'en', 'us', 'dd/MM/yyyy', 1),
  P('ID', 'IDR', 'en', 'eu', 'dd/MM/yyyy', 1),
  P('TH', 'THB', 'en', 'us', 'dd/MM/yyyy', 0),
  P('PH', 'PHP', 'en', 'us', 'MM/dd/yyyy', 0),
  P('VN', 'VND', 'en', 'eu', 'dd/MM/yyyy', 1),
  P('JP', 'JPY', 'en', 'us', 'yyyy-MM-dd', 0),
  P('KR', 'KRW', 'en', 'us', 'yyyy-MM-dd', 0),
  P('CN', 'CNY', 'en', 'us', 'yyyy-MM-dd', 1),
  P('HK', 'HKD', 'en', 'us', 'dd/MM/yyyy', 0),
  P('NG', 'NGN', 'en', 'us', 'dd/MM/yyyy', 1),
  P('KE', 'KES', 'en', 'us', 'dd/MM/yyyy', 1),
  P('ZA', 'ZAR', 'en', 'fr', 'yyyy-MM-dd', 0),
  P('BR', 'BRL', 'en', 'eu', 'dd/MM/yyyy', 0),
  P('MX', 'MXN', 'en', 'us', 'dd/MM/yyyy', 0),
  P('AR', 'ARS', 'en', 'eu', 'dd/MM/yyyy', 1),
];

export const countryName = (code: string, locale = 'en') => {
  try {
    return new Intl.DisplayNames([locale, 'en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

export const ALL_WIDGETS: WidgetId[] = [
  'balance', 'quick', 'summary', 'alerts', 'trip', 'budgets', 'pie', 'trend', 'incomeExpense',
  'top5', 'comparison', 'goals', 'health', 'recent',
];

export function defaultSettings(): Settings {
  const us = COUNTRIES.find((c) => c.code === 'US')!;
  return {
    id: 'app',
    setupDone: false,
    language: 'en',
    country: us.code,
    baseCurrency: us.currency,
    decimalSep: us.decimalSep,
    groupSep: us.groupSep,
    grouping: us.grouping,
    digitStyle: 'latn',
    currencyFormats: {},
    dateFormat: us.dateFormat,
    weekStartsOn: us.weekStartsOn,
    monthStartDay: 1,
    theme: 'system',
    style: 'normal',
    accent: '#2563ff',
    profile: { name: '' },
    widgets: ALL_WIDGETS.map((id) => ({ id, visible: true })),
    lock: { enabled: false },
    dailyReminder: { enabled: false, time: '21:00' },
    updatedAt: Date.now(),
  };
}

/**
 * Category sets. `key` is an i18n key under `cat.` — names are translated
 * into the user's language at setup time and then become plain editable text.
 */
export interface CatSeed { key: string; icon: string; color: string; subs?: string[] }

const STANDARD: CatSeed[] = [
  { key: 'food', icon: 'utensils', color: '#eb6834', subs: ['restaurant', 'snacks'] },
  { key: 'transport', icon: 'bus', color: '#2a78d6', subs: ['fuel', 'taxi'] },
  { key: 'groceries', icon: 'shopping-basket', color: '#1baf7a' },
  { key: 'rent', icon: 'home', color: '#6250d6' },
  { key: 'utilities', icon: 'zap', color: '#eda100' },
  { key: 'phone', icon: 'wifi', color: '#0e9bb5' },
  { key: 'education', icon: 'graduation-cap', color: '#8a6d3b' },
  { key: 'health', icon: 'heart-pulse', color: '#e34948' },
  { key: 'shopping', icon: 'shopping-bag', color: '#e87ba4' },
  { key: 'entertainment', icon: 'film', color: '#b8459b' },
  { key: 'family', icon: 'gift', color: '#008300' },
  { key: 'charity', icon: 'hand-heart', color: '#1baf7a' },
  { key: 'savings', icon: 'piggy-bank', color: '#2a78d6' },
  { key: 'others', icon: 'circle-ellipsis', color: '#7a7f87' },
];

const INCOME: CatSeed[] = [
  { key: 'salary', icon: 'briefcase', color: '#008300' },
  { key: 'business', icon: 'store', color: '#2a78d6' },
  { key: 'freelance', icon: 'laptop', color: '#6250d6' },
  { key: 'gift', icon: 'gift', color: '#e87ba4' },
  { key: 'interest', icon: 'percent', color: '#eda100' },
  { key: 'otherIncome', icon: 'circle-ellipsis', color: '#7a7f87' },
];

export const CATEGORY_SETS: Record<string, { expense: CatSeed[]; income: CatSeed[] }> = {
  standard: { expense: STANDARD, income: INCOME },
  student: {
    expense: [
      { key: 'food', icon: 'utensils', color: '#eb6834' },
      { key: 'transport', icon: 'bus', color: '#2a78d6' },
      { key: 'education', icon: 'graduation-cap', color: '#8a6d3b', subs: ['books', 'tuition'] },
      { key: 'phone', icon: 'wifi', color: '#0e9bb5' },
      { key: 'entertainment', icon: 'film', color: '#b8459b' },
      { key: 'shopping', icon: 'shopping-bag', color: '#e87ba4' },
      { key: 'others', icon: 'circle-ellipsis', color: '#7a7f87' },
    ],
    income: [
      { key: 'allowance', icon: 'wallet', color: '#008300' },
      { key: 'scholarship', icon: 'graduation-cap', color: '#2a78d6' },
      { key: 'freelance', icon: 'laptop', color: '#6250d6' },
      { key: 'otherIncome', icon: 'circle-ellipsis', color: '#7a7f87' },
    ],
  },
  family: {
    expense: [...STANDARD.slice(0, 13), { key: 'kids', icon: 'baby', color: '#e87ba4' }, { key: 'househelp', icon: 'users', color: '#8a6d3b' }, STANDARD[13]],
    income: INCOME,
  },
  southAsia: {
    expense: [
      ...STANDARD.slice(0, 11),
      { key: 'zakat', icon: 'hand-heart', color: '#1baf7a' },
      { key: 'festival', icon: 'party-popper', color: '#eda100' },
      { key: 'remittance', icon: 'send', color: '#6250d6' },
      STANDARD[12], STANDARD[13],
    ],
    income: [...INCOME.slice(0, 5), { key: 'remittanceIn', icon: 'download', color: '#0e9bb5' }, INCOME[5]],
  },
  freelancer: {
    expense: [
      ...STANDARD,
      { key: 'software', icon: 'laptop', color: '#0e9bb5' },
      { key: 'tax', icon: 'landmark', color: '#7a7f87' },
    ],
    income: [{ key: 'clientWork', icon: 'briefcase', color: '#008300' }, ...INCOME.slice(2)],
  },
};

export const DEFAULT_ACCOUNTS = [
  { key: 'cash', kind: 'cash' as const, icon: 'banknote', color: '#1baf7a' },
  { key: 'bank', kind: 'bank' as const, icon: 'landmark', color: '#2a78d6' },
];

/** Suggested wallet names (user can type any name). */
export const WALLET_SUGGESTIONS = ['bKash', 'Nagad', 'Rocket', 'PayPal', 'Apple Pay', 'Google Pay', 'Paytm', 'PhonePe', 'Vipps', 'Revolut', 'Wise', 'JazzCash', 'Easypaisa', 'GCash', 'M-Pesa', 'Alipay', 'WeChat Pay'];

/**
 * Settings saved by an older version may lack newer fields (style, profile,
 * new widgets). Merge them with defaults so every reader sees a complete object.
 */
export function normalizeSettings(raw: Settings): Settings {
  const d = defaultSettings();
  const s = {
    ...d,
    ...raw,
    accent: raw.accent === '#2a78d6' ? d.accent : raw.accent ?? d.accent,
    profile: { ...d.profile, ...raw.profile },
    lock: { ...d.lock, ...raw.lock },
    dailyReminder: { ...d.dailyReminder, ...raw.dailyReminder },
  };
  const known = new Set(s.widgets.map((w) => w.id));
  const missing = ALL_WIDGETS.filter((id) => !known.has(id)).map((id) => ({ id, visible: true }));
  s.widgets = [...s.widgets.filter((w) => ALL_WIDGETS.includes(w.id)), ...missing];
  return s;
}
