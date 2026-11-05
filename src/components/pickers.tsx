import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Sheet } from './Sheet';
import { Input, IconTile } from './ui';
import { allCurrencyCodes, currencyName, defaultSymbol } from '@/lib/currency';
import { ICON_NAMES, Icon } from '@/lib/icons';
import { PALETTE, cx } from '@/lib/utils';
import type { Account, Category } from '@/db/types';

/* ----------------------------- Currency ----------------------------- */

const POPULAR = ['USD', 'EUR', 'GBP', 'BDT', 'INR', 'PKR', 'SAR', 'AED', 'NOK', 'JPY', 'CNY', 'CAD', 'AUD', 'MYR', 'SGD', 'CHF'];

export function CurrencyPicker({ value, onChange, compact }: { value: string; onChange: (c: string) => void; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const all = allCurrencyCodes();
    const sorted = [...POPULAR.filter((c) => all.includes(c)), ...all.filter((c) => !POPULAR.includes(c))];
    const s = q.trim().toLowerCase();
    return s
      ? sorted.filter((c) => c.toLowerCase().includes(s) || currencyName(c, i18n.language).toLowerCase().includes(s) || currencyName(c).toLowerCase().includes(s))
      : sorted;
  }, [q, i18n.language]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          'm-input inline-flex items-center gap-1.5 font-semibold transition hover:bg-ink/5',
          compact ? '!h-9 !w-auto px-3 text-sm' : 'h-12 w-full px-4 text-[15px]',
        )}
      >
        <span className="text-muted">{defaultSymbol(value)}</span>
        <span>{value}</span>
        {!compact && <span className="flex-1 truncate text-start text-sm font-normal text-muted">{currencyName(value, i18n.language)}</span>}
        <ChevronDown size={16} className="text-muted" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('currency.choose')} tall>
        <div className="sticky top-0 z-10 bg-card pb-2">
          <div className="relative">
            <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('currency.search')} className="ps-10" />
          </div>
        </div>
        <ul>
          {list.map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => { onChange(c); setOpen(false); setQ(''); }}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-start hover:bg-ink/5"
              >
                <span className="grid h-10 w-12 place-items-center rounded-xl bg-ink/5 text-sm font-bold">{defaultSymbol(c)}</span>
                <span className="flex-1">
                  <span className="block font-semibold text-ink">{c}</span>
                  <span className="block text-xs text-muted">{currencyName(c, i18n.language)}</span>
                </span>
                {c === value && <Check size={18} className="text-brand" />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

/* ----------------------------- Icon & colour ----------------------------- */

export function IconPicker({ value, onChange, color }: { value: string; onChange: (v: string) => void; color: string }) {
  return (
    <div className="grid grid-cols-7 gap-2 sm:grid-cols-9">
      {ICON_NAMES.map((n) => (
        <button
          key={n}
          type="button"
          aria-label={n}
          onClick={() => onChange(n)}
          className={cx('grid aspect-square place-items-center rounded-2xl transition', value === n ? 'ring-2 ring-offset-2 ring-offset-card' : 'bg-ink/5 hover:bg-ink/10')}
          style={value === n ? { backgroundColor: color + '22', color, ['--tw-ring-color' as string]: color } : undefined}
        >
          <Icon name={n} size={20} />
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={cx('h-9 w-9 rounded-full transition', value === c && 'ring-2 ring-offset-2 ring-offset-card')}
          style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
        />
      ))}
      <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-line" title="Custom">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        <span className="grid h-full w-full place-items-center text-xs text-muted">+</span>
      </label>
    </div>
  );
}

/* ----------------------------- Category grid ----------------------------- */

export function CategoryGrid({ categories, value, onChange, kind }: {
  categories: Category[];
  value?: string;
  onChange: (id: string) => void;
  kind: 'expense' | 'income';
}) {
  const parents = categories.filter((c) => c.kind === kind && !c.parentId);
  const selected = categories.find((c) => c.id === value);
  const activeParent = selected?.parentId ?? selected?.id;
  const subs = categories.filter((c) => c.parentId && c.parentId === activeParent);
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {parents.map((c) => {
          const on = activeParent === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              className={cx('flex flex-col items-center gap-1 rounded-2xl p-2 transition active:scale-95', on ? 'bg-ink/5 ring-2' : 'hover:bg-ink/5')}
              style={on ? { ['--tw-ring-color' as string]: c.color } : undefined}
            >
              <IconTile color={c.color} size={44}><Icon name={c.icon} size={22} /></IconTile>
              <span className="line-clamp-1 w-full text-center text-[11px] font-medium text-ink">{c.name}</span>
            </button>
          );
        })}
      </div>
      {subs.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {subs.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(value === s.id ? activeParent! : s.id)}
              className={cx('h-8 shrink-0 rounded-full border px-3 text-xs font-medium', value === s.id ? 'text-white' : 'border-line text-ink')}
              style={value === s.id ? { backgroundColor: s.color, borderColor: s.color } : undefined}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Account chips ----------------------------- */

export function AccountChips({ accounts, value, onChange, exclude }: { accounts: Account[]; value?: string; onChange: (id: string) => void; exclude?: string }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {accounts.filter((a) => !a.archived && a.id !== exclude).map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onChange(a.id)}
          className={cx('inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border px-3 text-sm font-medium transition', value === a.id ? 'border-transparent text-white' : 'border-line text-ink hover:bg-ink/5')}
          style={value === a.id ? { backgroundColor: a.color } : undefined}
        >
          <Icon name={a.icon} size={16} />
          {a.name}
          <span className="text-[10px] opacity-70">{a.currency}</span>
        </button>
      ))}
    </div>
  );
}
