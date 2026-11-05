import type { Settings, ThemeStyle } from '@/db/types';

/**
 * Theme engine.
 *
 * The theme is an attribute on <html data-theme="{style}-{light|dark}">, not
 * React state. Six themes = three surface styles × light/dark:
 *   normal   – thermal receipt: paper tones, mono type, dashed rules, torn edges
 *   morphism – frosted glass over a living aurora backdrop
 *   brutal   – neo-brutalist: hard borders, offset shadows, loud fills
 *
 * Settings live in IndexedDB (async), so a copy is mirrored to localStorage
 * where the blocking boot script in index.html can read it before first paint
 * (no light→dark flash). The `storage` event keeps other tabs in sync.
 * THEME_IDS / STYLES below are the only place the style×mode mapping lives.
 */

export const STYLES: ThemeStyle[] = ['normal', 'morphism', 'brutal'];
export type Mode = Settings['theme'];
export const STORAGE_KEY = 'moneta.theme';

export interface ThemePrefs {
  style: ThemeStyle;
  mode: Mode;
  accent: string;
}

const mq = () => window.matchMedia('(prefers-color-scheme: dark)');
export const isDark = (mode: Mode) => mode === 'dark' || (mode === 'system' && mq().matches);
export const themeId = (style: ThemeStyle, dark: boolean) => `${style}-${dark ? 'dark' : 'light'}`;
export const nextStyle = (s: ThemeStyle) => STYLES[(STYLES.indexOf(s) + 1) % STYLES.length];

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue-shift a colour (used to derive the cyan/violet companions of any accent). */
function shiftHue([r, g, b]: number[], deg: number, light = 0) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h = (h * 60 + deg + 360) % 360;
  const L = Math.min(0.85, Math.max(0.15, l + light));
  const c = (1 - Math.abs(2 * L - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = L - c / 2;
  const [a, bb, cc] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [a, bb, cc].map((v) => Math.round((v + m) * 255)).join(' ');
}

function paint(p: ThemePrefs) {
  const root = document.documentElement;
  const dark = isDark(p.mode);
  root.dataset.theme = themeId(p.style, dark);
  root.classList.toggle('dark', dark);
  const [r, g, b] = hexToRgb(p.accent);
  root.style.setProperty('--brand', `${r} ${g} ${b}`);
  root.style.setProperty('--brand-light', `${Math.min(255, r + 90)} ${Math.min(255, g + 90)} ${Math.min(255, b + 90)}`);
  root.style.setProperty('--brand-2', shiftHue([r, g, b], -28, 0.04));
  root.style.setProperty('--brand-3', shiftHue([r, g, b], 48, 0));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bar-color').trim() || p.accent);
}

let current: ThemePrefs | null = null;

/** Apply + persist. `animate` cross-fades via the View Transitions API when available. */
export function applyTheme(p: ThemePrefs, animate = false) {
  const same = current && current.style === p.style && current.mode === p.mode && current.accent === p.accent;
  current = p;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* private mode */ }
  if (same && document.documentElement.dataset.theme) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (animate && !reduced && doc.startViewTransition) doc.startViewTransition(() => paint(p));
  else paint(p);
}

/** Follow OS changes (mode = system) and other tabs. Returns an unsubscribe. */
export function watchTheme(getPrefs: () => ThemePrefs | null) {
  const onOs = () => { const p = getPrefs(); if (p?.mode === 'system') paint(p); };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try { const p = JSON.parse(e.newValue) as ThemePrefs; current = p; paint(p); } catch { /* ignore */ }
  };
  const m = mq();
  m.addEventListener('change', onOs);
  window.addEventListener('storage', onStorage);
  return () => { m.removeEventListener('change', onOs); window.removeEventListener('storage', onStorage); };
}
