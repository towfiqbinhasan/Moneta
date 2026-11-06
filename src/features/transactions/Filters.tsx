import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { Transaction, TxType } from '@/db/types';
import { useData } from '@/hooks/useData';
import { Button, Field, Input, Select } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { rootOf, toBase } from '@/lib/stats';
import { parseAmount } from '@/lib/format';

/** Search + filter by category, account, currency, amount, date, tag, note. */
export interface TxFilter {
  q: string;
  type: TxType | '';
  categoryId: string;
  accountId: string;
  currency: string;
  tag: string;
  min: string;
  max: string;
  from: string;
  to: string;
}

export const EMPTY_FILTER: TxFilter = { q: '', type: '', categoryId: '', accountId: '', currency: '', tag: '', min: '', max: '', from: '', to: '' };

export function useFiltered(txs: Transaction[], f: TxFilter) {
  const { categories, ctx } = useData();
  return useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return txs.filter((t) => {
      if (f.type && t.type !== f.type) return false;
      if (f.categoryId && t.categoryId !== f.categoryId && rootOf(t.categoryId, categories) !== f.categoryId) return false;
      if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
      if (f.currency && t.currency !== f.currency) return false;
      if (f.tag && !t.tags.includes(f.tag.replace(/^#/, ''))) return false;
      const day = t.date ? t.date.slice(0, 10) : '';
      const [from, to] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
      if (from && day < from) return false;
      if (to && day > to) return false;
      const v = toBase(t.amount, t.currency, ctx);
      const min = f.min ? parseAmount(f.min) : undefined;
      const max = f.max ? parseAmount(f.max) : undefined;
      const [lo, hi] = min !== undefined && max !== undefined && min > max ? [max, min] : [min, max];
      if (lo !== undefined && v < lo) return false;
      if (hi !== undefined && v > hi) return false;
      if (q) {
        const cat = categories.find((c) => c.id === t.categoryId)?.name ?? '';
        const hay = `${t.note} ${t.tags.map((x) => '#' + x).join(' ')} ${cat} ${t.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [txs, f, categories, ctx]);
}

export function FilterBar({ value, onChange }: { value: TxFilter; onChange: (f: TxFilter) => void }) {
  const { t } = useTranslation();
  const { categories, accounts, transactions, settings } = useData();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const active = Object.entries(value).filter(([k, v]) => k !== 'q' && v).length;
  const tags = useMemo(() => [...new Set(transactions.flatMap((x) => x.tags))].sort(), [transactions]);
  const currencies = useMemo(() => [...new Set(transactions.map((x) => x.currency))].sort(), [transactions]);
  const set = (k: keyof TxFilter, v: string) => setDraft({ ...draft, [k]: v });

  return (
    <>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={value.q} onChange={(e) => onChange({ ...value, q: e.target.value })} placeholder={t('filter.search')} className="ps-10" />
        </div>
        <Button variant={active ? 'primary' : 'soft'} className="h-12 w-12 !px-0" onClick={() => { setDraft(value); setOpen(true); }} aria-label={t('filter.title')}>
          <SlidersHorizontal size={20} />
          {active > 0 && <span className="text-xs">{active}</span>}
        </Button>
      </div>
      {active > 0 && (
        <button onClick={() => onChange({ ...EMPTY_FILTER, q: value.q })} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand">
          <X size={14} /> {t('filter.clear')}
        </button>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('filter.title')}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft({ ...EMPTY_FILTER, q: value.q })}>{t('filter.clear')}</Button>
            <Button block onClick={() => { onChange(draft); setOpen(false); }}>{t('filter.apply')}</Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('filter.type')} className="col-span-2">
            <Select value={draft.type} onChange={(e) => set('type', e.target.value)}>
              <option value="">{t('filter.all')}</option>
              <option value="expense">{t('tx.expense')}</option>
              <option value="income">{t('tx.income')}</option>
              <option value="transfer">{t('tx.transfer')}</option>
            </Select>
          </Field>
          <Field label={t('filter.category')} className="col-span-2">
            <Select value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">{t('filter.all')}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>)}
            </Select>
          </Field>
          <Field label={t('filter.account')}>
            <Select value={draft.accountId} onChange={(e) => set('accountId', e.target.value)}>
              <option value="">{t('filter.all')}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label={t('filter.currency')}>
            <Select value={draft.currency} onChange={(e) => set('currency', e.target.value)}>
              <option value="">{t('filter.all')}</option>
              {currencies.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('filter.tag')} className="col-span-2">
            <Select value={draft.tag} onChange={(e) => set('tag', e.target.value)}>
              <option value="">{t('filter.all')}</option>
              {tags.map((c) => <option key={c} value={c}>#{c}</option>)}
            </Select>
          </Field>
          <Field label={`${t('filter.min')} (${settings.baseCurrency})`}><Input inputMode="decimal" value={draft.min} onChange={(e) => set('min', e.target.value)} /></Field>
          <Field label={`${t('filter.max')} (${settings.baseCurrency})`}><Input inputMode="decimal" value={draft.max} onChange={(e) => set('max', e.target.value)} /></Field>
          <Field label={t('filter.from')}><Input type="date" value={draft.from} onChange={(e) => set('from', e.target.value)} /></Field>
          <Field label={t('filter.to')}><Input type="date" value={draft.to} onChange={(e) => set('to', e.target.value)} /></Field>
        </div>
      </Sheet>
    </>
  );
}
