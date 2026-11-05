/**
 * ISO 4217 currency metadata, derived from the browser's Intl data so the list
 * covers every world currency without a hand-maintained table.
 */

const FALLBACK = ['USD', 'EUR', 'GBP', 'BDT', 'INR', 'PKR', 'SAR', 'AED', 'JPY', 'CNY', 'CAD', 'AUD', 'MYR', 'SGD', 'NOK', 'SEK', 'DKK', 'CHF', 'NPR', 'LKR', 'IDR', 'THB', 'PHP', 'VND', 'KRW', 'TRY', 'EGP', 'NGN', 'KES', 'ZAR', 'BRL', 'MXN', 'ARS', 'RUB', 'QAR', 'KWD', 'OMR', 'BHD'];

/** Common symbols where Intl's narrow symbol is just the code. */
const SYMBOL_OVERRIDES: Record<string, string> = {
  BDT: '৳', INR: '₹', PKR: 'Rs', NPR: 'रू', LKR: 'Rs', SAR: '﷼', AED: 'د.إ', QAR: '﷼', OMR: '﷼',
  KWD: 'د.ك', BHD: '.د.ب', NOK: 'kr', SEK: 'kr', DKK: 'kr', CHF: 'CHF', MYR: 'RM', IDR: 'Rp',
  EGP: 'E£', NGN: '₦', KES: 'KSh', ZAR: 'R', TRY: '₺', RUB: '₽', PLN: 'zł', CZK: 'Kč', HUF: 'Ft',
};

let cachedCodes: string[] | null = null;

export function allCurrencyCodes(): string[] {
  if (cachedCodes) return cachedCodes;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (Intl as any).supportedValuesOf?.('currency') as string[] | undefined;
    cachedCodes = list && list.length ? list : FALLBACK;
  } catch {
    cachedCodes = FALLBACK;
  }
  return cachedCodes;
}

const nameCache = new Map<string, string>();
export function currencyName(code: string, locale = 'en'): string {
  const key = locale + code;
  if (nameCache.has(key)) return nameCache.get(key)!;
  let name = code;
  try {
    name = new Intl.DisplayNames([locale, 'en'], { type: 'currency' }).of(code) ?? code;
  } catch { /* ignore */ }
  nameCache.set(key, name);
  return name;
}

export function defaultSymbol(code: string): string {
  if (SYMBOL_OVERRIDES[code]) return SYMBOL_OVERRIDES[code];
  try {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? code;
  } catch {
    return code;
  }
}

export function defaultDecimals(code: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Currencies whose symbol conventionally follows the amount (e.g. 12,50 €, 100 kr). */
const AFTER = new Set(['EUR', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF', 'CHF', 'RON', 'BGN', 'ISK', 'VND']);
export const defaultPosition = (code: string): 'before' | 'after' => (AFTER.has(code) ? 'after' : 'before');
