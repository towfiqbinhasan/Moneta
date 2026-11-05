import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { CustomLanguage } from '@/db/types';
import en from './locales/en';
import bn from './locales/bn';
import de from './locales/de';
import nb from './locales/nb';
import hi from './locales/hi';

/**
 * i18n with FLAT keys ('nav.home'), so the in-app language editor can map
 * keys 1:1. Built-in languages ship in /locales; user-created languages (or
 * overrides of built-in strings) live in the `languages` DB table and are
 * merged on top at runtime.
 */

export interface LangInfo {
  code: string;
  name: string;
  dir: 'ltr' | 'rtl';
  builtin: boolean;
}

export const BUILTIN: LangInfo[] = [
  { code: 'en', name: 'English', dir: 'ltr', builtin: true },
  { code: 'bn', name: 'বাংলা', dir: 'ltr', builtin: true },
  { code: 'de', name: 'Deutsch', dir: 'ltr', builtin: true },
  { code: 'nb', name: 'Norsk (bokmål)', dir: 'ltr', builtin: true },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr', builtin: true },
];

export const BUILTIN_STRINGS: Record<string, Record<string, string>> = { en, bn, de, nb, hi };
export const EN_KEYS = Object.keys(en);

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(Object.entries(BUILTIN_STRINGS).map(([k, v]) => [k, { translation: v }])),
  lng: 'en',
  fallbackLng: 'en',
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Register custom languages / overrides from the DB. */
export function loadCustomLanguages(list: CustomLanguage[]) {
  for (const l of list) {
    const base = BUILTIN_STRINGS[l.code] ?? {};
    i18n.addResourceBundle(l.code, 'translation', { ...base, ...l.strings }, true, true);
  }
}

export function allLanguages(custom: CustomLanguage[]): LangInfo[] {
  const out = [...BUILTIN];
  for (const c of custom) {
    const b = out.find((x) => x.code === c.code);
    if (b) b.dir = c.dir;
    else out.push({ code: c.code, name: c.name, dir: c.dir, builtin: false });
  }
  return out;
}

export async function applyLanguage(code: string, custom: CustomLanguage[]) {
  const info = allLanguages(custom).find((l) => l.code === code);
  await i18n.changeLanguage(code);
  document.documentElement.lang = code;
  document.documentElement.dir = info?.dir ?? 'ltr';
}

export default i18n;
