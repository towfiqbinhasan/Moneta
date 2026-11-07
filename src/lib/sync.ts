import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { db, SYNC_TABLES } from '@/db/db';
import type { Base, Settings } from '@/db/types';
import { AUTH_CALLBACK, isNative, openBrowser, SITE_URL } from './native';

/**
 * Supabase: authentication + cloud database sync (see supabase/schema.sql).
 *
 * Data model: every local record is one row in `records(user_id, tbl, id, data, updated_at, deleted, synced_at)`.
 * Sync: pull rows the server received since our last pull (server clock `synced_at`), apply them
 * last-write-wins on `updatedAt`, then push local rows changed since the last sync. Deletions travel
 * as tombstones. Runs automatically: a few seconds after any local change, on focus/online, every
 * minute, and instantly when another device writes (Supabase Realtime).
 *
 * The app stays fully usable offline / signed out; sync simply resumes later.
 */

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const syncEnabled = !!(URL_ && KEY);
export const supabase: SupabaseClient | null = syncEnabled
  ? createClient(URL_!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

/** Device-local settings that never travel between devices. */
export const LOCAL_ONLY: (keyof Settings)[] = ['lock', 'lastSyncAt', 'lastPullAt', 'ratesFetchedAt', 'lastAccountId', 'syncUserId'];

interface Row {
  user_id: string;
  tbl: string;
  id: string;
  data: unknown;
  updated_at: number;
  deleted: boolean;
  synced_at?: string;
}

/* ============================== Status store ============================== */

export type SyncStatus = 'off' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'offline' | 'conflict';
export interface SyncUser { id: string; email: string; name?: string; avatar?: string; provider?: string }
export interface SyncState {
  status: SyncStatus;
  user: SyncUser | null;
  lastSyncAt?: number;
  error?: string;
  /** Set while waiting for the user to decide what to do with another account's local data. */
  conflictEmail?: string;
  recovery?: boolean; // arrived via password-reset link
}

let state: SyncState = { status: syncEnabled ? 'signed-out' : 'off', user: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
export const getSyncState = () => state;
export function useSync(): SyncState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getSyncState, getSyncState);
}

const toUser = (u: User): SyncUser => ({
  id: u.id,
  email: u.email ?? '',
  name: (u.user_metadata?.name ?? u.user_metadata?.full_name) as string | undefined,
  avatar: u.user_metadata?.avatar_url as string | undefined,
  provider: u.app_metadata?.provider as string | undefined,
});

/* ============================== Auth ============================== */

function need() {
  if (!supabase) throw new Error('Cloud sync is not configured (.env)');
  return supabase;
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await need().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Returns true if the project requires e-mail confirmation before the first sign-in. */
export async function signUp(email: string, password: string, name: string): Promise<boolean> {
  const { data, error } = await need().auth.signUp({
    email: email.trim(), password,
    options: { data: { name: name.trim() }, emailRedirectTo: SITE_URL || undefined },
  });
  if (error) throw error;
  return !data.session;
}

/**
 * Which social logins are switched on in the Supabase project, so the app only
 * shows buttons that work. Cached per session; offline → assume none.
 */
let providersP: Promise<{ google: boolean }> | null = null;
export function authProviders() {
  if (!syncEnabled) return Promise.resolve({ google: false });
  providersP ??= fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY! } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d) => ({ google: !!d?.external?.google }))
    .catch(() => { providersP = null; return { google: false }; });
  return providersP;
}

export async function signInWithGoogle() {
  if (isNative) {
    // Phone app: sign in in the system browser, which hands back via the app's deep link.
    const { data, error } = await need().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: AUTH_CALLBACK, skipBrowserRedirect: true } });
    if (error) throw error;
    if (data.url) await openBrowser(data.url);
    return;
  }
  const { error } = await need().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  if (error) throw error;
}

/** Send the sign-up confirmation e-mail again. */
export async function resendConfirmation(email: string) {
  const { error } = await need().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: SITE_URL || undefined } });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await need().auth.resetPasswordForEmail(email.trim(), { redirectTo: SITE_URL ? `${SITE_URL}/auth?mode=reset` : undefined });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await need().auth.updateUser({ password });
  if (error) throw error;
  set({ recovery: false });
}

/**
 * Sign out. `wipe` also removes this account's data from the device (shared computer);
 * otherwise data stays and keeps working offline.
 */
export async function signOut(wipe = false) {
  stopLive();
  await supabase?.auth.signOut();
  set({ status: syncEnabled ? 'signed-out' : 'off', user: null, error: undefined, conflictEmail: undefined });
  if (wipe) {
    await db.delete();
    try { localStorage.removeItem('moneta.theme'); } catch { /* ignore */ }
    location.assign('/');
  }
}

/* ============================== Engine ============================== */

let started = false;
let timer: number | undefined;
let running: Promise<unknown> | null = null;
let again = false;
let channel: ReturnType<SupabaseClient['channel']> | null = null;
let interval: number | undefined;

/** Debounced sync request — called after every local write (see db/repo.ts). */
export function scheduleSync(delay = 2500) {
  if (!supabase || !state.user || state.status === 'conflict') return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { runSync().catch(() => {}); }, delay);
}

async function runSync() {
  if (running) { again = true; return running; }
  if (!navigator.onLine) { set({ status: 'offline' }); return; }
  set({ status: 'syncing', error: undefined });
  running = syncNow()
    .then(() => set({ status: 'idle', lastSyncAt: Date.now() }))
    .catch((e: Error) => set({ status: navigator.onLine ? 'error' : 'offline', error: e.message }))
    .finally(() => {
      running = null;
      if (again) { again = false; scheduleSync(500); }
    });
  return running;
}

/** Public "Sync now" button. */
export async function syncNowManual() {
  await runSync();
  if (state.status === 'error') throw new Error(state.error);
}

function startLive(userId: string) {
  if (!supabase) return;
  stopLive();
  channel = supabase
    .channel(`records-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` }, () => scheduleSync(800))
    .subscribe();
  interval = window.setInterval(() => scheduleSync(0), 60_000);
}

function stopLive() {
  if (channel) supabase?.removeChannel(channel);
  channel = null;
  window.clearInterval(interval);
}

/** Called once at app start. Wires auth state → sync engine. */
export function startSyncEngine() {
  if (!supabase || started) return;
  started = true;

  const onUser = async (u: User | null) => {
    if (!u) { stopLive(); set({ status: 'signed-out', user: null }); return; }
    const user = toUser(u);
    const local = await db.settings.get('app');
    // Another account's data on this device? Ask before mixing.
    if (local?.syncUserId && local.syncUserId !== user.id && (await hasLocalData())) {
      set({ status: 'conflict', user, conflictEmail: user.email });
      return;
    }
    await adopt(user);
  };

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
    const id = session?.user?.id ?? null;
    if (id !== (state.user?.id ?? null) || (event === 'INITIAL_SESSION' && id)) onUser(session?.user ?? null);
  });
  window.addEventListener('online', () => scheduleSync(0));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(300); });
}

/** Bind this device to `user`, fill the profile from the account, and start syncing. */
async function adopt(user: SyncUser) {
  const local = await db.settings.get('app');
  if (local) {
    const profile = { ...local.profile };
    if (!profile.name && user.name) profile.name = user.name;
    await db.settings.put({ ...local, syncUserId: user.id, profile, updatedAt: local.profile.name === profile.name ? local.updatedAt : Date.now() });
  }
  set({ user, status: 'idle', conflictEmail: undefined });
  startLive(user.id);
  await runSync();
}

async function hasLocalData() {
  for (const t of SYNC_TABLES) if (await db.table(t).count()) return true;
  return false;
}

/** Conflict resolution: replace this device's data with the signed-in account's cloud data. */
export async function resolveConflictReplace() {
  if (!state.user) return;
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.tombstones, db.settings], async () => {
    for (const t of SYNC_TABLES) await db.table(t).clear();
    await db.tombstones.clear();
    const s = await db.settings.get('app');
    if (s) await db.settings.put({ ...s, lastSyncAt: 0, lastPullAt: undefined, syncUserId: undefined });
  });
  await adopt(state.user);
}

/* ============================== Sync core ============================== */

const PULL_PAGE = 1000;
const PULL_OVERLAP_MS = 60_000;

export async function syncNow(): Promise<{ pushed: number; pulled: number }> {
  const sb = need();
  const user = (await sb.auth.getSession()).data.session?.user;
  if (!user) throw new Error('Not signed in');
  const settings = await db.settings.get('app');
  const since = settings?.lastSyncAt ?? 0;
  /** A device that hasn't finished setup takes the cloud settings instead of overwriting them. */
  const fresh = !settings?.setupDone;
  const startedAt = Date.now();

  // ---- Pull first, so newer remote edits are applied before we push ----
  let pulled = 0;
  let pullMark = settings?.lastPullAt ?? '1970-01-01T00:00:00Z';
  // Re-read a short overlap: an upsert that committed late can carry a synced_at just before our last mark.
  // Re-applying rows is harmless (updatedAt decides), so overlap only costs a few duplicate reads.
  const markMs = Date.parse(pullMark);
  let cursor = settings?.lastPullAt && Number.isFinite(markMs) ? new Date(markMs - PULL_OVERLAP_MS).toISOString() : pullMark;
  /** Rows already handled at the cursor timestamp (one upsert batch shares one synced_at). */
  let seenAtCursor = new Set<string>();
  /** Rows applied from the cloud — not pushed straight back (that echo could overwrite a newer edit). */
  const fromCloud = new Set<string>();
  for (;;) {
    // Cursor paging (not offsets): stable even when rows are re-stamped while we read.
    const { data, error } = await sb.from('records').select('*').gte('synced_at', cursor)
      .order('synced_at').order('tbl').order('id').limit(PULL_PAGE);
    if (error) throw error;
    const fresh_ = ((data ?? []) as Row[]).filter((r) => !(r.synced_at === cursor && seenAtCursor.has(`${r.tbl}:${r.id}`)));
    if (!fresh_.length) break;
    for (const row of fresh_) {
      if (row.synced_at && row.synced_at > pullMark) pullMark = row.synced_at;
      if (row.synced_at !== cursor) { cursor = row.synced_at!; seenAtCursor = new Set(); }
      seenAtCursor.add(`${row.tbl}:${row.id}`);
      if (row.tbl === 'settings') {
        const local = await db.settings.get('app');
        if (local && row.data && typeof row.data === 'object' && (fresh || row.updated_at > local.updatedAt)) {
          const remote = row.data as Partial<Settings>;
          const keep = Object.fromEntries(LOCAL_ONLY.map((k) => [k, local[k]]));
          await db.settings.put({ ...local, ...remote, ...keep, id: 'app', updatedAt: row.updated_at } as Settings);
          pulled++;
        }
        continue;
      }
      if (!(SYNC_TABLES as readonly string[]).includes(row.tbl)) continue;
      const table = db.table(row.tbl);
      const local = (await table.get(row.id)) as Base | undefined;
      const tomb = await db.tombstones.get(`${row.tbl}:${row.id}`);
      if (row.deleted) {
        if (local && local.updatedAt <= row.updated_at) { await table.delete(row.id); fromCloud.add(`${row.tbl}:${row.id}`); pulled++; }
      } else if (tomb && tomb.deletedAt >= row.updated_at) {
        // Deleted locally after the remote edit — keep it deleted (tombstone will be pushed).
      } else if (!local || local.updatedAt < row.updated_at) {
        if (row.data && typeof row.data === 'object') {
          await table.put(row.data);
          if (tomb) await db.tombstones.delete(tomb.key);
          fromCloud.add(`${row.tbl}:${row.id}`);
          pulled++;
        }
      }
    }
    if ((data?.length ?? 0) < PULL_PAGE) break;
  }

  // ---- Push local changes since last sync ----
  const push: Row[] = [];
  for (const tbl of SYNC_TABLES) {
    const changed = (await db.table(tbl).where('updatedAt').above(since).toArray()) as Base[];
    for (const r of changed) if (!fromCloud.has(`${tbl}:${r.id}`)) push.push({ user_id: user.id, tbl, id: r.id, data: r, updated_at: r.updatedAt, deleted: false });
  }
  for (const tomb of await db.tombstones.where('deletedAt').above(since).toArray()) {
    push.push({ user_id: user.id, tbl: tomb.table, id: tomb.recordId, data: null, updated_at: tomb.deletedAt, deleted: true });
  }
  const s2 = await db.settings.get('app');
  if (s2 && s2.setupDone && s2.updatedAt > since) {
    const shared = { ...s2 } as Partial<Settings>;
    LOCAL_ONLY.forEach((k) => delete shared[k]);
    push.push({ user_id: user.id, tbl: 'settings', id: 'app', data: shared, updated_at: s2.updatedAt, deleted: false });
  }
  for (let i = 0; i < push.length; i += 500) {
    const { error } = await sb.from('records').upsert(push.slice(i, i + 500), { onConflict: 'user_id,tbl,id' });
    if (error) throw error;
  }

  const cur = await db.settings.get('app');
  if (cur) await db.settings.put({ ...cur, lastSyncAt: startedAt, lastPullAt: pullMark }); // don't bump updatedAt
  return { pushed: push.length, pulled };
}

/** Finish a native Google sign-in from the deep link (`app.moneta.tracker://auth-callback#access_token=…` or `?code=…`). */
export async function completeAuthFromUrl(url: string) {
  if (!supabase) return;
  const u = new URL(url.replace(/^[a-z.]+:\/\//, 'https://x/'));
  const hash = new URLSearchParams(u.hash.slice(1));
  const code = u.searchParams.get('code');
  const err = hash.get('error_description') ?? u.searchParams.get('error_description');
  if (err) throw new Error(err);
  if (code) await supabase.auth.exchangeCodeForSession(code);
  else if (hash.get('access_token') && hash.get('refresh_token'))
    await supabase.auth.setSession({ access_token: hash.get('access_token')!, refresh_token: hash.get('refresh_token')! });
}
