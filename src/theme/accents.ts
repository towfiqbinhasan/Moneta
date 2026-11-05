/**
 * Named accent hues for cards and tiles: accent('emerald').grad etc.
 * Roles:
 *   grad, glow – theme-independent; they sit under white text on a filled chip
 *   text       – readable tinted text (mixed toward the current ink colour)
 *   dot        – the pure hue, for small marks
 *   soft, line – translucent tint / outline that adapt to light and dark surfaces
 */
export const ACCENT_HEX = {
  emerald: '#10b981',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  amber: '#f59e0b',
  rose: '#f43f5e',
  indigo: '#6366f1',
  teal: '#14b8a6',
  orange: '#f97316',
  fuchsia: '#d946ef',
} as const;

export type AccentName = keyof typeof ACCENT_HEX;

export interface Accent {
  grad: string;
  glow: string;
  text: string;
  dot: string;
  soft: string;
  line: string;
}

function shade(hex: string, pct: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * (pct < 0 ? c : 255 - c))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

const cache = new Map<string, Accent>();

/** Works for named accents and any hex (e.g. a category colour). */
export function accent(nameOrHex: AccentName | string): Accent {
  const hex = (ACCENT_HEX as Record<string, string>)[nameOrHex] ?? nameOrHex;
  if (cache.has(hex)) return cache.get(hex)!;
  const a: Accent = {
    grad: `linear-gradient(135deg, ${shade(hex, 12)} 0%, ${hex} 45%, ${shade(hex, -28)} 100%)`,
    glow: `0 14px 34px -14px ${hex}cc`,
    text: `color-mix(in srgb, ${hex} 72%, rgb(var(--ink)))`,
    dot: hex,
    soft: `color-mix(in srgb, ${hex} 13%, transparent)`,
    line: `color-mix(in srgb, ${hex} 34%, transparent)`,
  };
  cache.set(hex, a);
  return a;
}
