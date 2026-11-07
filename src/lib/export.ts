import writeXlsxFile from 'write-excel-file';
import { db, SYNC_TABLES, type SyncTable } from '@/db/db';
import type { Account, Category, Settings, Transaction } from '@/db/types';
import { download } from './utils';
import { isNative } from './native';
import { formatDate, formatMoney } from './format';
import { LOCAL_ONLY, getSyncState, scheduleSync, signOut } from './sync';

/** Exports (CSV / XLSX / PDF) and JSON backup & restore. */

export interface ExportCtx {
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  t: (k: string) => string;
}

function rows(txs: Transaction[], c: ExportCtx) {
  const acc = (id?: string) => c.accounts.find((a) => a.id === id)?.name ?? '';
  const cat = (id?: string) => {
    const x = c.categories.find((k) => k.id === id);
    if (!x) return '';
    const parent = x.parentId ? c.categories.find((k) => k.id === x.parentId) : undefined;
    return parent ? `${parent.name} / ${x.name}` : x.name;
  };
  return txs.map((t) => ({
    date: t.date.replace('T', ' '),
    type: c.t(`tx.${t.type}`),
    amount: t.type === 'expense' ? -t.amount : t.amount,
    currency: t.currency,
    category: t.type === 'transfer' ? `${acc(t.accountId)} → ${acc(t.toAccountId)}` : cat(t.categoryId),
    account: acc(t.accountId),
    note: t.note,
    tags: t.tags.map((x) => '#' + x).join(' '),
  }));
}

const HEAD = ['date', 'type', 'amount', 'currency', 'category', 'account', 'note', 'tags'] as const;

export function exportCSV(txs: Transaction[], c: ExportCtx) {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [HEAD.map((h) => c.t(`export.${h}`)).join(',')];
  for (const r of rows(txs, c)) lines.push(HEAD.map((h) => esc(r[h])).join(','));
  // BOM so Excel opens UTF-8 (Bangla, Hindi …) correctly.
  download('﻿' + lines.join('\n'), `moneta-${Date.now()}.csv`, 'text/csv;charset=utf-8');
}

export async function exportXLSX(txs: Transaction[], c: ExportCtx) {
  const data = [
    HEAD.map((h) => ({ value: c.t(`export.${h}`), fontWeight: 'bold' as const })),
    ...rows(txs, c).map((r) => HEAD.map((h) => ({ value: r[h] as string | number, type: h === 'amount' ? Number : String }))),
  ];
  await writeXlsxFile(data as never, { fileName: `moneta-${Date.now()}.xlsx`, columns: HEAD.map((h) => ({ width: h === 'note' ? 36 : 16 })) });
}

/**
 * PDF via the browser's print dialog ("Save as PDF"). Using HTML instead of a
 * PDF library means every script (Bangla, Devanagari, Arabic …) renders correctly.
 */
export async function exportPDF(txs: Transaction[], c: ExportCtx, title: string, summary: [string, string][]) {
  const s = c.settings;
  // Phone app: WebViews can't print, so share the report page (open it → Print → Save as PDF).
  const w = isNative ? null : window.open('', '_blank');
  if (!isNative && !w) return;
  const logo = await logoDataUrl();
  const dir = document.documentElement.dir || 'ltr';
  const body = rows(txs, c)
    .map((r, i) => `<tr><td>${formatDate(txs[i].date, s)}</td><td>${esc(r.type)}</td><td>${esc(r.category)}</td><td>${esc(r.account)}</td><td>${esc(r.note)} ${esc(r.tags)}</td><td class="n">${formatMoney(r.amount, r.currency, s)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Noto+Sans+Bengali&family=Noto+Sans+Devanagari&display=swap" rel="stylesheet">
  <style>body{font-family:Inter,'Noto Sans Bengali','Noto Sans Devanagari',sans-serif;padding:24px;color:#111}
  h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}
  th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:start}th{background:#f3f4f6}.n{text-align:end;white-space:nowrap}
  .sum{display:flex;gap:24px;margin-top:8px;font-size:13px}.sum b{display:block;font-size:16px}</style></head><body>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px"><img src="${logo}" width="44" height="44" alt=""><div><div style="font-weight:800;font-size:22px;letter-spacing:-.02em">Moneta</div><div style="font-size:10px;color:#667;letter-spacing:.08em">Freelance • Work • Earn • Globally</div></div></div>
  <h1>${esc(title)}</h1><div class="sum">${summary.map(([k, v]) => `<div>${esc(k)}<b>${v}</b></div>`).join('')}</div>
  <table><thead><tr>${['date', 'type', 'category', 'account', 'note', 'amount'].map((h) => `<th${h === 'amount' ? ' class="n"' : ''}>${esc(c.t(`export.${h}`))}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
  ${isNative ? '' : '<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>'}</body></html>`;
  if (!w) return download(html, `moneta-report-${new Date().toISOString().slice(0, 10)}.html`, 'text/html');
  w.document.write(html);
  w.document.close();
}

/** The logo inlined, so the report also works as a standalone file. */
async function logoDataUrl() {
  try {
    const blob = await (await fetch('/brand/moneta-mark-128.png')).blob();
    return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
  } catch {
    return `${location.origin}/brand/moneta-mark-128.png`;
  }
}

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/* ----------------------------- Backup ----------------------------- */

export async function backupJSON() {
  const out: Record<string, unknown> = { app: 'moneta', version: 1, exportedAt: new Date().toISOString() };
  for (const t of SYNC_TABLES) out[t] = await db.table(t).toArray();
  out.settings = await db.settings.toArray();
  out.rates = await db.rates.toArray();
  out.languages = await db.languages.toArray();
  download(JSON.stringify(out), `moneta-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
}

export async function restoreJSON(file: File) {
  const data = JSON.parse(await file.text());
  if (data?.app !== 'moneta') throw new Error('Not a Moneta backup file');
  const tables = [...SYNC_TABLES, 'settings', 'rates', 'languages'] as const;
  const now = Date.now();
  await db.transaction('rw', [...tables.map((t) => db.table(t)), db.tombstones], async () => {
    const localSettings = await db.settings.get('app');
    for (const t of tables) {
      if (!Array.isArray(data[t])) continue;
      const incoming = data[t] as Record<string, unknown>[];
      if ((SYNC_TABLES as readonly string[]).includes(t)) {
        // Records missing from the backup are deleted everywhere (tombstones), and restored ones get a
        // fresh updatedAt so they are pushed and win over older cloud copies.
        const keep = new Set(incoming.map((r) => r.id as string));
        const dropped = ((await db.table(t).toCollection().primaryKeys()) as string[]).filter((id) => !keep.has(id));
        await db.tombstones.bulkPut(dropped.map((id) => ({ key: `${t}:${id}`, table: t as SyncTable, recordId: id, deletedAt: now })));
        await db.tombstones.bulkDelete([...keep].map((id) => `${t}:${id}`));
        await db.table(t).clear();
        await db.table(t).bulkPut(incoming.map((r) => ({ ...r, updatedAt: now })));
      } else if (t === 'settings') {
        // This device's sync bookkeeping (account, clocks, lock) is not part of the backup.
        const keep = localSettings ? Object.fromEntries(LOCAL_ONLY.map((k) => [k, localSettings[k]])) : {};
        await db.table(t).clear();
        await db.table(t).bulkPut(incoming.map((r) => ({ ...r, ...keep, lastSyncAt: 0, updatedAt: now })));
      } else {
        await db.table(t).clear();
        await db.table(t).bulkPut(incoming);
      }
    }
  });
  scheduleSync(500);
}

/**
 * Deletes everything on this device. When signed in, it also signs out — otherwise the next
 * start would pull the whole account back from the cloud and quietly undo the reset.
 * Cloud data itself is kept (delete it from another device or the account).
 */
export async function wipeAll() {
  if (getSyncState().user) return signOut(true);
  await db.delete();
  location.reload();
}
