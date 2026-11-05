import { db, type SyncTable } from './db';
import type { Base, Settings } from './types';
import { uid } from '@/lib/utils';
import { scheduleSync } from '@/lib/sync';

/**
 * Small repository layer. Every write stamps timestamps; every delete writes a
 * tombstone (for sync) and returns an `undo` callback for the Undo toast.
 */

type New<T> = Omit<T, keyof Base> & Partial<Base>;

export async function create<T extends Base>(table: SyncTable, data: New<T>): Promise<T> {
  const now = Date.now();
  const rec = { ...data, id: data.id ?? uid(), createdAt: data.createdAt ?? now, updatedAt: now } as T;
  await db.table(table).put(rec);
  await db.tombstones.delete(`${table}:${rec.id}`);
  scheduleSync();
  return rec;
}

/** Updates a record and returns an undo function that restores the previous version. */
export async function update<T extends Base>(table: SyncTable, id: string, patch: Partial<T>): Promise<() => Promise<void>> {
  const prev = (await db.table(table).get(id)) as T | undefined;
  if (!prev) return async () => {};
  await db.table(table).put({ ...prev, ...patch, id, updatedAt: Date.now() });
  scheduleSync();
  return async () => {
    await db.table(table).put({ ...prev, updatedAt: Date.now() });
    scheduleSync();
  };
}

/** Upsert — used by forms that handle both "new" and "edit". */
export async function save<T extends Base>(table: SyncTable, data: New<T>): Promise<T> {
  if (data.id && (await db.table(table).get(data.id))) {
    await update<T>(table, data.id, data as Partial<T>);
    return (await db.table(table).get(data.id)) as T;
  }
  return create<T>(table, data);
}

/** Deletes records and returns undo. `cascade` lets callers remove children too. */
export async function remove(table: SyncTable, ids: string | string[]): Promise<() => Promise<void>> {
  const list = Array.isArray(ids) ? ids : [ids];
  const prev = (await db.table(table).bulkGet(list)).filter(Boolean) as Base[];
  const now = Date.now();
  await db.transaction('rw', db.table(table), db.tombstones, async () => {
    await db.table(table).bulkDelete(list);
    await db.tombstones.bulkPut(list.map((id) => ({ key: `${table}:${id}`, table, recordId: id, deletedAt: now })));
  });
  scheduleSync();
  return async () => {
    await db.table(table).bulkPut(prev.map((p) => ({ ...p, updatedAt: Date.now() })));
    await db.tombstones.bulkDelete(list.map((id) => `${table}:${id}`));
    scheduleSync();
  };
}

export async function getSettings(): Promise<Settings | undefined> {
  return db.settings.get('app');
}

export async function patchSettings(patch: Partial<Settings>) {
  const cur = await db.settings.get('app');
  if (!cur) return;
  await db.settings.put({ ...cur, ...patch, updatedAt: Date.now() });
  scheduleSync();
}
