import { format as dfFormat, parseISO, type Locale } from 'date-fns';
import { bn, de, enUS, hi, nb } from 'date-fns/locale';
import type { DigitStyle, Grouping, Settings } from '@/db/types';
import { defaultDecimals, defaultPosition, defaultSymbol } from './currency';

/**
 * Money / number / date formatting fully driven by user settings:
 * separators, western vs Indian (lakh/crore) grouping, digit script,
 * and per-currency symbol, position and decimals.
 */

const DIGITS: Record<DigitStyle, string> = {
  latn: '0123456789',
  beng: '০১২৩৪৫৬৭৮৯',
  arab: '٠١٢٣٤٥٦٧٨٩',
  deva: '०१२३४५६७८९',
};

export function toDigits(s: string, style: DigitStyle): string {
  if (style === 'latn') return s;
  const map = DIGITS[style];
  return s.replace(/[0-9]/g, (d) => map[+d]);
}

function group(intPart: string, grouping: Grouping, sep: string): string {
  if (grouping === 'none' || intPart.length <= 3) return intPart;
  if (grouping === 'western') return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  // Indian: last 3 digits, then groups of 2 → 1,23,45,678
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, sep);
  return rest + sep + last3;
}

export type NumberPrefs = Pick<Settings, 'decimalSep' | 'groupSep' | 'grouping' | 'digitStyle'>;

export function formatNumber(value: number, decimals: number, p: NumberPrefs): string {
  const neg = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [i, f] = fixed.split('.');
  const out = group(i, p.grouping, p.groupSep) + (f ? p.decimalSep + f : '');
  return toDigits((neg ? '-' : '') + out, p.digitStyle);
}

export interface MoneyOpts {
  /** Show + for positive values */
  sign?: boolean;
  /** Compact style for charts: 1.2K, 3.4M */
  compact?: boolean;
  /** Omit decimals when the value is whole */
  trim?: boolean;
}

export function formatMoney(value: number, currency: string, s: Settings, opts: MoneyOpts = {}): string {
  const cf = s.currencyFormats[currency] ?? {};
  const symbol = cf.symbol ?? defaultSymbol(currency);
  const position = cf.position ?? defaultPosition(currency);
  let decimals = cf.decimals ?? defaultDecimals(currency);
  const space = cf.space ?? (position === 'after' || symbol.length > 1);

  let abs = Math.abs(value);
  let suffix = '';
  if (opts.compact && abs >= 1000) {
    const units: [number, string][] = s.grouping === 'indian'
      ? [[1e7, 'Cr'], [1e5, 'L'], [1e3, 'K']]
      : [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    let i = units.findIndex(([n]) => abs >= n);
    const scaled = (k: number) => abs / units[k][0];
    // Pick the unit after rounding, so 999,999 shows as "1M", not "1,000K".
    if (i > 0 && Number(scaled(i).toFixed(scaled(i) >= 99.95 ? 0 : 1)) >= 1000) i--;
    abs = scaled(i);
    suffix = units[i][1];
    decimals = abs >= 99.95 ? 0 : 1;
  }
  if (opts.trim && Number.isInteger(abs)) decimals = 0;

  const num = formatNumber(abs, decimals, s) + suffix;
  const gap = space ? ' ' : '';
  const body = position === 'before' ? symbol + gap + num : num + gap + symbol;
  // Sign of the value as displayed: -0.00000001 shows as "0.00", not "−0.00".
  const shown = Number(abs.toFixed(decimals)) === 0 ? 0 : value;
  const sign = shown < 0 ? '−' : opts.sign && shown > 0 ? '+' : '';
  return sign + body;
}

const DATE_LOCALES: Record<string, Locale> = { en: enUS, bn, de, nb, hi };
export const dateLocale = (lang: string) => DATE_LOCALES[lang] ?? enUS;

export function formatDate(iso: string | Date, s: Pick<Settings, 'dateFormat' | 'digitStyle' | 'language'>, pattern?: string): string {
  try {
    const d = typeof iso === 'string' ? parseISO(iso) : iso;
    return toDigits(dfFormat(d, pattern ?? s.dateFormat, { locale: dateLocale(s.language) }), s.digitStyle);
  } catch {
    return String(iso);
  }
}

let userDecimalSep = '.';
/** Called by the data provider so ambiguous input like "12,500" follows the user's number format. */
export function setAmountDecimalSep(sep: string) { userDecimalSep = sep === ',' ? ',' : '.'; }

/**
 * Parse a user-typed amount, accepting either '.' or ',' as decimal point and any digit script.
 * A single separator followed by exactly 3 digits is ambiguous ("12,500" / "1.234"); it is read
 * with the user's decimal separator.
 */
export function parseAmount(input: string, decimalSep = userDecimalSep): number {
  if (!input) return 0;
  let s = String(input).trim();
  const isNegative = /^\(.*\)$/.test(s) || s.startsWith('-') || s.endsWith('-');
  s = s.replace(/^\((.*)\)$/, '$1').replace(/-$/, '').replace(/^-/, '');

  for (const map of Object.values(DIGITS)) {
    s = s.replace(new RegExp(`[${map}]`, 'g'), (d) => String(map.indexOf(d)));
  }

  s = s.replace(/[^\d.,]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount > 1) {
      s = s.replace(/,/g, '');
    } else {
      const afterComma = s.slice(lastComma + 1);
      const beforeComma = s.slice(0, lastComma);
      if (decimalSep !== ',' && beforeComma !== '0' && beforeComma.length > 0 && afterComma.length === 3) {
        s = s.replace(/,/g, '');
      } else {
        s = s.replace(',', '.');
      }
    }
  } else if (lastDot !== -1) {
    const dotCount = (s.match(/\./g) || []).length;
    const beforeDot = s.slice(0, lastDot);
    if (dotCount > 1 || (decimalSep === ',' && beforeDot !== '0' && beforeDot.length > 0 && s.length - lastDot - 1 === 3)) {
      s = s.replace(/\./g, '');
    }
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return isNegative ? -n : n;
}

export const DATE_FORMATS = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd.MM.yyyy', 'd MMM yyyy', 'MMM d, yyyy'];
