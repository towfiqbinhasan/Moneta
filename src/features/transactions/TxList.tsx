import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Copy, Paperclip, Repeat, Trash2 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { haptic } from '@/components/motion';
import { create, remove } from '@/db/repo';
import { isoDateTime } from '@/lib/period';
import { cx } from '@/lib/utils';
import type { Transaction } from '@/db/types';
import { useData } from '@/hooks/useData';
import { IconTile } from '@/components/ui';
import { Icon } from '@/lib/icons';
import { useQuickAdd } from '../AppShell';
import { totals } from '@/lib/stats';
import { groupBy } from '@/lib/utils';

/**
 * One transaction row.
 * Tap → edit. Swipe left → delete (with Undo). Swipe right → duplicate as a new entry dated now.
 * Horizontal drags only engage after 12px and when clearly horizontal, so vertical scrolling is untouched.
 */
export function TxRow({ tx }: { tx: Transaction }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { categories, accounts, money, settings, base } = useData();
  const openAdd = useQuickAdd();
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const start = useRef<{ x: number; y: number; locked?: boolean } | null>(null);
  const moved = useRef(false);

  const cat = categories.find((c) => c.id === tx.categoryId);
  const parent = cat?.parentId ? categories.find((c) => c.id === cat.parentId) : undefined;
  const acc = accounts.find((a) => a.id === tx.accountId);
  const to = accounts.find((a) => a.id === tx.toAccountId);
  const isTransfer = tx.type === 'transfer';
  const title = isTransfer ? `${acc?.name ?? '?'} → ${to?.name ?? '?'}` : (parent ? `${parent.name} · ${cat!.name}` : cat?.name ?? t('cat.uncategorized'));
  const sub = [tx.note, tx.tags.map((x) => '#' + x).join(' '), !isTransfer && acc?.name].filter(Boolean).join(' · ');
  const color = tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : tx.type === 'expense' ? 'text-ink' : 'text-brand';
  const LIMIT = 96;

  const onDown = (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY }; moved.current = false; };
  const onMove = (e: React.PointerEvent) => {
    const s0 = start.current;
    if (!s0) return;
    const ddx = e.clientX - s0.x;
    const ddy = e.clientY - s0.y;
    if (!s0.locked) {
      if (Math.abs(ddx) < 12) return;
      if (Math.abs(ddy) > Math.abs(ddx)) { start.current = null; return; }
      s0.locked = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    moved.current = true;
    const v = Math.max(-LIMIT * 1.4, Math.min(LIMIT * 1.4, ddx));
    if ((Math.abs(v) >= LIMIT) !== (Math.abs(dx) >= LIMIT)) haptic(8);
    setDx(v);
  };
  const onUp = async () => {
    const v = dx;
    start.current = null;
    if (v <= -LIMIT) {
      setGone(true);
      const undo = await remove('transactions', tx.id);
      toast(t('tx.deleted'), undo);
    } else if (v >= LIMIT) {
      const { id: _id, createdAt: _c, updatedAt: _u, recurringId: _r, ...copy } = tx;
      await create<Transaction>('transactions', { ...copy, date: isoDateTime(new Date()) });
      toast(t('tx.duplicated'));
    }
    setDx(0);
  };

  return (
    <div className={cx('relative overflow-hidden rounded-2xl transition-all duration-300', gone && 'max-h-0 opacity-0')} style={gone ? undefined : { maxHeight: 120 }}>
      {/* Swipe action backgrounds */}
      <div aria-hidden className={cx('absolute inset-0 flex items-center justify-between px-5 text-sm font-semibold text-white transition-opacity', dx === 0 && 'opacity-0')} style={{ background: dx > 0 ? '#0ea5e9' : '#e34948' }}>
        <span className={cx('flex items-center gap-1.5 transition-transform', dx >= LIMIT && 'scale-110')}><Copy size={17} />{t('tx.duplicate')}</span>
        <span className={cx('flex items-center gap-1.5 transition-transform', dx <= -LIMIT && 'scale-110')}>{t('common.delete')}<Trash2 size={17} /></span>
      </div>
      <button
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { start.current = null; setDx(0); }}
        onClick={(e) => { if (moved.current) { e.preventDefault(); return; } openAdd({ tx }); }}
        className={cx('relative flex w-full touch-pan-y items-center gap-3 rounded-2xl px-2 py-2.5 text-start hover:bg-ink/[.03] active:bg-ink/[.06]', !start.current && 'transition-transform duration-300 ease-[cubic-bezier(.2,.9,.3,1.2)]')}
        // Solid only while swiping, so glass themes stay translucent at rest but hide the action colour mid-swipe.
        style={dx ? { transform: `translateX(${dx}px)`, background: 'rgb(var(--card))' } : undefined}
      >
        {isTransfer ? (
          <IconTile color="#2a78d6"><ArrowLeftRight size={20} /></IconTile>
        ) : (
          <IconTile color={cat?.color ?? '#7a7f87'}><Icon name={cat?.icon ?? 'circle-ellipsis'} size={20} /></IconTile>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 truncate text-[15px] font-medium text-ink">
            {title}
            {tx.recurringId && <Repeat size={12} className="shrink-0 text-muted" />}
            {tx.receipt && <Paperclip size={12} className="shrink-0 text-muted" />}
          </span>
          {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
        </span>
        <span className="text-end">
          <span className={`block whitespace-nowrap font-semibold tabular ${color}`}>
            {tx.type === 'expense' ? '−' : tx.type === 'income' ? '+' : ''}{money(tx.amount, tx.currency)}
          </span>
          {tx.currency !== settings.baseCurrency && <span className="block text-[11px] text-muted">≈ {base(tx.amount, tx.currency)}</span>}
        </span>
      </button>
    </div>
  );
}

/** Transactions grouped by day with a daily net total. */
export function TxGroupedList({ txs }: { txs: Transaction[] }) {
  const { date, ctx, money } = useData();
  const groups = groupBy(txs, (t) => t.date.slice(0, 10));
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([day, list]) => {
        const tt = totals(list, ctx);
        return (
          <section key={day} className="m-card p-2 animate-rise">
            <header className="m-label flex items-center justify-between border-b border-dashed border-line px-2 pb-2 pt-1.5 !normal-case !tracking-normal">
              <span>{date(day, 'EEE, ' + 'd MMM yyyy')}</span>
              <span className="tabular">{money(tt.net, undefined, { sign: true })}</span>
            </header>
            {list.map((tx) => <TxRow key={tx.id} tx={tx} />)}
          </section>
        );
      })}
    </div>
  );
}
