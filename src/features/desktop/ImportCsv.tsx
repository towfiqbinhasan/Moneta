import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button, Field, Select, Toggle } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useData } from '@/hooks/useData';
import { db } from '@/db/db';
import { remove } from '@/db/repo';
import type { Category, Transaction } from '@/db/types';
import { parseAmount } from '@/lib/format';
import { scheduleSync } from '@/lib/sync';
import { defaultDecimals } from '@/lib/currency';
import { toCur } from '@/lib/stats';
import { PALETTE, round, uid } from '@/lib/utils';

/**
 * CSV import (bank statements, other apps, or Moneta's own export).
 * Auto-detects delimiter and columns, lets you remap every column, previews the
 * first rows, then imports in one batch with a single Undo.
 */

type Col = 'date' | 'amount' | 'type' | 'category' | 'account' | 'note' | 'tags' | 'currency';
const COLS: Col[] = ['date', 'amount', 'type', 'category', 'account', 'note', 'tags', 'currency'];
const GUESS: Record<Col, RegExp> = {
  date: /date|dato|datum|তারিখ|तारीख|time|booked/i,
  amount: /amount|beløp|betrag|sum|value|টাকা|পরিমাণ|राशि|debit|credit/i,
  type: /^type$|typ|ধরন|प्रकार|kind/i,
  category: /categ|kategori|ক্যাটাগরি|श्रेणी/i,
  account: /account|konto|অ্যাকাউন্ট|अकाउंट|wallet/i,
  note: /note|desc|memo|text|merchant|payee|নোট|नोट|beskrivelse|verwendungszweck/i,
  tags: /tag/i,
  currency: /currency|valuta|währung|মুদ্রা|मुद्रा|ccy/i,
};

export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] ?? '';
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.replace(/^﻿/, '').trim()));
}

/** Accepts ISO, d/m/y, m/d/y (by the user's date format), d.m.y, with optional time. */
function parseDate(s: string, dmy: boolean): string | null {
  const t = s.match(/(\d{1,2}):(\d{2})/);
  const time = t ? `${t[1].padStart(2, '0')}:${t[2]}` : '12:00';
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${time}`;
  m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    const [d, mo] = dmy || s.includes('.') ? [m[1], m[2]] : [m[2], m[1]];
    if (+mo > 12) return `${y}-${d.padStart(2, '0')}-${mo.padStart(2, '0')}T${time}`;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${time}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : `${d.toISOString().slice(0, 10)}T${time}`;
}

export function ImportCsv({ file, onClose }: { file: File | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { accounts, categories, settings, ctx } = useData();
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<Col, number>>({} as Record<Col, number>);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [createCats, setCreateCats] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    file.text().then((txt) => {
      const r = parseCsv(txt);
      setRows(r);
      const head = r[0] ?? [];
      const m = {} as Record<Col, number>;
      const exportHeads = Object.fromEntries(COLS.map((c) => [c, t(`export.${c}`).toLowerCase()]));
      for (const c of COLS) m[c] = head.findIndex((h) => h.toLowerCase() === exportHeads[c] || GUESS[c].test(h));
      setMap(m);
    });
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  const head = rows[0] ?? [];
  const body = rows.slice(1);
  const dmy = !settings.dateFormat.startsWith('MM');

  const parsed = useMemo(() => body.map((r) => {
    const get = (c: Col) => (map[c] >= 0 ? r[map[c]] ?? '' : '');
    const raw = parseAmount(get('amount'));
    const typeTxt = get('type').toLowerCase();
    const type: Transaction['type'] = /inc|ein|inn|আয়|आय|credit/.test(typeTxt) ? 'income' : /trans|über|overf|ট্রান্স|ट्रांस/.test(typeTxt) ? 'transfer' : typeTxt ? 'expense' : raw < 0 ? 'expense' : 'income';
    return {
      date: parseDate(get('date'), dmy),
      amount: Math.abs(raw),
      type: type === 'transfer' ? 'expense' as const : type,
      category: get('category').split(' / ').pop()?.trim() ?? '',
      account: get('account'),
      note: get('note'),
      tags: get('tags').split(/[\s,]+/).map((x) => x.replace(/^#/, '')).filter(Boolean),
      currency: get('currency').toUpperCase(),
    };
  }).filter((x) => x.date && x.amount > 0), [rows, map, dmy]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setBusy(true);
    const now = Date.now();
    const catByName = new Map(categories.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c]));
    const newCats: Category[] = [];
    let order = Math.max(0, ...categories.map((c) => c.order)) + 1;
    const txs: Transaction[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      let cat = p.category ? catByName.get(`${p.type}:${p.category.toLowerCase()}`) : undefined;
      if (!cat && p.category && createCats) {
        cat = { id: uid(), createdAt: now, updatedAt: now, name: p.category, kind: p.type as 'expense' | 'income', icon: 'circle-ellipsis', color: PALETTE[newCats.length % PALETTE.length], order: order++ };
        catByName.set(`${p.type}:${p.category.toLowerCase()}`, cat);
        newCats.push(cat);
      }
      const acc = accounts.find((a) => a.name.toLowerCase() === p.account.toLowerCase()) ?? accounts.find((a) => a.id === accountId) ?? accounts[0];
      if (!acc) continue;
      const cur = p.currency || acc.currency;
      const accountAmount = cur !== acc.currency ? round(toCur(p.amount, cur, acc.currency, ctx), defaultDecimals(acc.currency)) : undefined;
      txs.push({
        id: uid(), createdAt: now + i, updatedAt: now, type: p.type, amount: p.amount, currency: cur,
        accountAmount, accountId: acc.id, categoryId: cat?.id, date: p.date!, note: p.note, tags: p.tags,
      });
    }
    await db.transaction('rw', db.transactions, db.categories, async () => {
      await db.categories.bulkPut(newCats);
      await db.transactions.bulkPut(txs);
    });
    scheduleSync();
    setBusy(false);
    toast(t('import.done', { count: txs.length }), async () => {
      await remove('transactions', txs.map((x) => x.id));
      if (newCats.length) await remove('categories', newCats.map((c) => c.id));
    });
    onClose();
  };

  return (
    <Sheet open={!!file} onClose={onClose} title={t('import.title')} tall
      footer={<Button block size="lg" disabled={!parsed.length || busy || map.date < 0 || map.amount < 0} onClick={run}><Upload size={18} />{t('import.run', { count: parsed.length })}</Button>}>
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-brand/5 p-3 text-sm">
        <FileSpreadsheet className="text-brand" /> <span className="min-w-0 flex-1 truncate font-medium">{file?.name}</span> <span className="text-xs text-muted">{body.length} {t('import.rows')}</span>
      </div>
      <p className="mb-3 text-xs text-muted">{t('import.mapHint')}</p>
      <div className="grid grid-cols-2 gap-3">
        {COLS.map((c) => (
          <Field key={c} label={t(`export.${c}`) + (c === 'date' || c === 'amount' ? ' *' : '')}>
            <Select value={map[c] ?? -1} onChange={(e) => setMap({ ...map, [c]: +e.target.value })} className="!h-10 text-sm">
              <option value={-1}>—</option>
              {head.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
            </Select>
          </Field>
        ))}
      </div>
      <Field label={t('import.defaultAccount')} className="mt-3">
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}</Select>
      </Field>
      <div className="mt-2"><Toggle checked={createCats} onChange={setCreateCats} label={t('import.createCats')} /></div>
      {map.type < 0 && <p className="mt-1 text-xs text-muted">{t('import.signHint')}</p>}

      <div className="m-label mb-1.5 mt-4">{t('import.preview')}</div>
      <div className="m-tile overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-muted">{['date', 'type', 'amount', 'category', 'note'].map((h) => <th key={h} className="px-2 py-1.5 text-start font-semibold">{t(`export.${h}`)}</th>)}</tr></thead>
          <tbody>
            {parsed.slice(0, 6).map((p, i) => (
              <tr key={i} className="border-t border-dashed border-line">
                <td className="whitespace-nowrap px-2 py-1.5">{p.date?.replace('T', ' ')}</td>
                <td className="px-2 py-1.5">{t(`tx.${p.type}`)}</td>
                <td className={`px-2 py-1.5 tabular ${p.type === 'income' ? 'text-emerald-600' : ''}`}>{p.amount}</td>
                <td className="px-2 py-1.5">{p.category}</td>
                <td className="max-w-[140px] truncate px-2 py-1.5">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!parsed.length && <p className="p-4 text-center text-xs text-muted">{t('import.nothing')}</p>}
      </div>
    </Sheet>
  );
}
