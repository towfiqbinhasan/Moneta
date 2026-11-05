import { db } from '@/db/db';
import type { Rate } from '@/db/types';
import { patchSettings } from '@/db/repo';

/**
 * Exchange rates.
 * - Live rates come from open.er-api.com (free, no API key), stored as "per 1 USD".
 * - The user may set a manual override per currency as "1 CODE = X base".
 * - Offline: whatever was last cached (or manual) is used.
 */

const API = 'https://open.er-api.com/v6/latest/USD';
const STALE_MS = 12 * 60 * 60 * 1000;

export async function fetchRates(force = false): Promise<boolean> {
  const s = await db.settings.get('app');
  if (!force && s?.ratesFetchedAt && Date.now() - s.ratesFetchedAt < STALE_MS) return true;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  try {
    const res = await fetch(API);
    if (!res.ok) return false;
    const json = (await res.json()) as { result: string; rates: Record<string, number> };
    if (json.result !== 'success') return false;
    const now = Date.now();
    const existing = new Map((await db.rates.toArray()).map((r) => [r.code, r]));
    await db.rates.bulkPut(
      Object.entries(json.rates).map(([code, perUsd]) => ({ ...existing.get(code), code, perUsd, updatedAt: now })),
    );
    await patchSettings({ ratesFetchedAt: now });
    return true;
  } catch {
    return false;
  }
}

export type RateMap = Map<string, Rate>;

/** Value of 1 unit of `code` expressed in `base`, or undefined if unknown. */
export function perBase(code: string, base: string, rates: RateMap): number | undefined {
  if (code === base) return 1;
  const r = rates.get(code);
  if (r?.manualPerBase) return r.manualPerBase;
  const b = rates.get(base);
  if (r?.perUsd && b?.perUsd) return b.perUsd / r.perUsd;
  // Manual rate defined on the base side (1 base = x code) isn't modelled; fall back to unknown.
  return undefined;
}

/** Convert between any two currencies. Unknown rates fall back to 1:1 (flagged in UI). */
export function convert(amount: number, from: string, to: string, base: string, rates: RateMap): number {
  if (from === to) return amount;
  const f = perBase(from, base, rates) ?? 1;
  const t = perBase(to, base, rates) ?? 1;
  return (amount * f) / t;
}

export async function setManualRate(code: string, perBaseValue: number | undefined) {
  const r = await db.rates.get(code);
  await db.rates.put({ ...(r ?? { code }), code, manualPerBase: perBaseValue || undefined, updatedAt: Date.now() });
}

/**
 * When the base currency changes, manual overrides ("1 CODE = X base") must be
 * re-expressed in the new base, otherwise they would silently become wrong.
 */
export async function rebaseManualRates(oldBase: string, newBase: string) {
  const rates: RateMap = new Map((await db.rates.toArray()).map((r) => [r.code, r]));
  const newInOld = perBase(newBase, oldBase, rates); // 1 newBase = X oldBase
  const updates: Rate[] = [];
  for (const r of rates.values()) {
    if (!r.manualPerBase) continue;
    const manual = r.code === newBase || !newInOld ? undefined : r.manualPerBase / newInOld;
    updates.push({ ...r, manualPerBase: manual, updatedAt: Date.now() });
  }
  if (updates.length) await db.rates.bulkPut(updates);
}
