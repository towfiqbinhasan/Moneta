import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowLeftRight, ArrowUp, Copy, Download, Pencil, Trash2, Wallet, X, Shapes } from 'lucide-react';
import type { Transaction } from '@/db/types';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { IconTile } from '@/components/ui';
import { db } from '@/db/db';
import { create, remove } from '@/db/repo';
import { Icon } from '@/lib/icons';
import { isoDateTime } from '@/lib/period';
import { toBase } from '@/lib/stats';
import { exportCSV } from '@/lib/export';
import { scheduleSync } from '@/lib/sync';
import { cx } from '@/lib/utils';
import { useQuickAdd } from '../AppShell';

/**
 * Desktop transactions table: sortable columns, multi-select (click / Shift-click
 * ranges / select all), a floating bulk-action bar, right-click context menu,
 * and keyboard (Delete removes selection, Esc clears it).
 */
type SortKey = 'date' | 'category' | 'account' | 'amount';

export function TxTable({ txs }: { txs: Transaction[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const openAdd = useQuickAdd();
  const d = useData();
  const { categories, accounts, money, date, ctx, settings } = d;
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; tx: Transaction } | null>(null);
  const [bulk, setBulk] = useState<'category' | 'account' | null>(null);

  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? '';
  const accName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '';

  const rows = useMemo(() => {
    const val = (x: Transaction): string | number => {
      switch (sort.key) {
        case 'date': return x.date;
        case 'category': return x.type === 'transfer' ? '~' : catName(x.categoryId).toLowerCase();
        case 'account': return accName(x.accountId).toLowerCase();
        case 'amount': return (x.type === 'expense' ? -1 : 1) * toBase(x.amount, x.currency, ctx);
      }
    };
    return [...txs].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [txs, sort, ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drop selections that no longer exist (deleted / filtered out).
  useEffect(() => {
    const ids = new Set(txs.map((x) => x.id));
    setSel((s) => { const n = new Set([...s].filter((id) => ids.has(id))); return n.size === s.size ? s : n; });
  }, [txs]);

  const selected = rows.filter((x) => sel.has(x.id));

  const deleteSelected = async (list = selected) => {
    if (!list.length) return;
    const undo = await remove('transactions', list.map((x) => x.id));
    setSel(new Set());
    toast(t('table.deleted', { count: list.length }), undo);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape') { setSel(new Set()); setMenu(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); deleteSelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(new Set(rows.map((x) => x.id))); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [menu]);

  const toggle = (i: number, shift: boolean) => {
    const id = rows[i].id;
    setSel((prev) => {
      const next = new Set(prev);
      if (shift && anchor !== null) {
        const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
        for (let k = a; k <= b; k++) next.add(rows[k].id);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(i);
  };

  const applyBulk = async (field: 'categoryId' | 'accountId', value: string) => {
    const before = selected.map((x) => ({ id: x.id, v: x[field] }));
    await db.transaction('rw', db.transactions, async () => {
      for (const x of selected) if (!(field === 'categoryId' && x.type === 'transfer')) await db.transactions.update(x.id, { [field]: value, updatedAt: Date.now() } as Partial<Transaction>);
    });
    scheduleSync();
    setBulk(null);
    toast(t('table.updated', { count: selected.length }), async () => {
      await db.transaction('rw', db.transactions, async () => { for (const b of before) await db.transactions.update(b.id, { [field]: b.v, updatedAt: Date.now() } as Partial<Transaction>); });
      scheduleSync();
    });
  };

  const duplicate = async (x: Transaction) => {
    const { id: _i, createdAt: _c, updatedAt: _u, recurringId: _r, ...copy } = x;
    await create<Transaction>('transactions', { ...copy, date: isoDateTime(new Date()) });
    toast(t('tx.duplicated'));
  };

  const Th = ({ k, children, end }: { k: SortKey; children: React.ReactNode; end?: boolean }) => (
    <th className={cx('px-3 py-3 text-start font-semibold', end && '!text-end')}>
      <button onClick={() => setSort({ key: k, dir: sort.key === k ? (sort.dir === 1 ? -1 : 1) : k === 'date' || k === 'amount' ? -1 : 1 })} className={cx('m-label inline-flex items-center gap-1 transition hover:text-ink', sort.key === k && '!text-brand')}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  const allChecked = rows.length > 0 && sel.size === rows.length;
  return (
    <div className="m-card overflow-clip !p-0">
      <table className="w-full text-sm">
        <thead className="sticky top-16 z-10 border-b border-line bg-card/95 text-start backdrop-blur">
          <tr>
            <th className="w-10 px-3 py-3"><Check checked={allChecked} partial={sel.size > 0 && !allChecked} onChange={() => setSel(allChecked ? new Set() : new Set(rows.map((x) => x.id)))} /></th>
            <Th k="date">{t('export.date')}</Th>
            <Th k="category">{t('export.category')}</Th>
            <th className="px-3 py-3 text-start"><span className="m-label">{t('export.note')}</span></th>
            <Th k="account">{t('export.account')}</Th>
            <Th k="amount" end>{t('export.amount')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x, i) => {
            const cat = categories.find((c) => c.id === x.categoryId);
            const parent = cat?.parentId ? categories.find((c) => c.id === cat.parentId) : undefined;
            const isSel = sel.has(x.id);
            return (
              <tr
                key={x.id}
                onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey || sel.size ? toggle(i, e.shiftKey) : openAdd({ tx: x }))}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ x: Math.min(e.clientX, innerWidth - 220), y: Math.min(e.clientY, innerHeight - 200), tx: x }); }}
                className={cx('group cursor-pointer border-b border-dashed border-line/70 transition-colors last:border-0', isSel ? 'bg-brand/10' : 'hover:bg-ink/[.035]')}
              >
                <td className="px-3 py-2.5" onClick={(e) => { e.stopPropagation(); toggle(i, e.shiftKey); }}>
                  <Check checked={isSel} onChange={() => {}} className={cx(!isSel && !sel.size && 'opacity-0 group-hover:opacity-100')} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular text-muted">{date(x.date, settings.dateFormat)}<span className="ms-1.5 text-[11px] opacity-70">{x.date.slice(11, 16)}</span></td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2.5">
                    {x.type === 'transfer' ? <IconTile color="#2563ff" size={30}><ArrowLeftRight size={15} /></IconTile> : <IconTile color={cat?.color ?? '#7a7f87'} size={30}><Icon name={cat?.icon ?? 'circle-ellipsis'} size={15} /></IconTile>}
                    <span className="truncate font-medium">{x.type === 'transfer' ? `${accName(x.accountId)} → ${accName(x.toAccountId)}` : parent ? `${parent.name} · ${cat!.name}` : cat?.name ?? t('cat.uncategorized')}</span>
                  </span>
                </td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <span className="block truncate">{x.note}</span>
                  {x.tags.length > 0 && <span className="flex flex-wrap gap-1">{x.tags.map((g) => <span key={g} className="rounded-full bg-brand/10 px-1.5 text-[10px] text-brand">#{g}</span>)}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{x.type === 'transfer' ? '' : accName(x.accountId)}</td>
                <td className={cx('whitespace-nowrap px-3 py-2.5 text-end font-semibold tabular', x.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : x.type === 'transfer' ? 'text-brand' : '')}>
                  {x.type === 'expense' ? '−' : x.type === 'income' ? '+' : ''}{money(x.amount, x.currency)}
                  {x.currency !== settings.baseCurrency && <span className="block text-[11px] font-normal text-muted">≈ {d.base(x.amount, x.currency)}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Floating bulk bar */}
      {sel.size > 0 && createPortal(
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 animate-rise">
          <div className="flex items-center gap-1 rounded-2xl bg-ink p-1.5 ps-4 text-sm text-surface shadow-2xl">
            <b className="me-2 tabular">{t('table.selected', { count: sel.size })}</b>
            <div className="relative">
              <BarBtn onClick={() => setBulk(bulk === 'category' ? null : 'category')}><Shapes size={15} />{t('table.setCategory')}</BarBtn>
              {bulk === 'category' && (
                <Pick onClose={() => setBulk(null)} items={categories.map((c) => ({ id: c.id, label: (c.parentId ? '— ' : '') + c.name, icon: <Icon name={c.icon} size={14} style={{ color: c.color }} /> }))} onPick={(id) => applyBulk('categoryId', id)} />
              )}
            </div>
            <div className="relative">
              <BarBtn onClick={() => setBulk(bulk === 'account' ? null : 'account')}><Wallet size={15} />{t('table.setAccount')}</BarBtn>
              {bulk === 'account' && (
                <Pick onClose={() => setBulk(null)} items={accounts.map((a) => ({ id: a.id, label: `${a.name} · ${a.currency}`, icon: <Icon name={a.icon} size={14} style={{ color: a.color }} /> }))} onPick={(id) => applyBulk('accountId', id)} />
              )}
            </div>
            <BarBtn onClick={() => exportCSV(selected, { settings, accounts, categories, t })}><Download size={15} />CSV</BarBtn>
            <BarBtn danger onClick={() => deleteSelected()}><Trash2 size={15} />{t('common.delete')}</BarBtn>
            <button onClick={() => setSel(new Set())} aria-label="Clear" className="ms-1 grid h-8 w-8 place-items-center rounded-xl hover:bg-white/10"><X size={16} /></button>
          </div>
        </div>,
        document.body,
      )}

      {/* Context menu */}
      {menu && createPortal(
        <div className="m-card fixed z-[60] w-52 p-1.5 text-sm shadow-2xl animate-pop" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <CtxItem icon={Pencil} onClick={() => { setMenu(null); openAdd({ tx: menu.tx }); }}>{t('tx.edit')}</CtxItem>
          <CtxItem icon={Copy} onClick={() => { setMenu(null); duplicate(menu.tx); }}>{t('tx.duplicate')}</CtxItem>
          <CtxItem icon={Shapes} onClick={() => { setSel(new Set([menu.tx.id])); setMenu(null); setBulk('category'); }}>{t('table.setCategory')}</CtxItem>
          <div className="m-rule my-1" />
          <CtxItem icon={Trash2} danger onClick={() => { setMenu(null); deleteSelected([menu.tx]); }}>{t('common.delete')}</CtxItem>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Check({ checked, partial, onChange, className }: { checked: boolean; partial?: boolean; onChange: () => void; className?: string }) {
  return (
    <span role="checkbox" aria-checked={partial ? 'mixed' : checked} tabIndex={0} onClick={onChange} onKeyDown={(e) => e.key === ' ' && onChange()}
      className={cx('grid h-[18px] w-[18px] cursor-pointer place-items-center rounded-md border-2 transition-all', checked || partial ? 'border-brand bg-brand text-white' : 'border-line hover:border-brand/60', className)}>
      {checked ? <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" className="check-draw" /></svg> : partial ? <span className="h-0.5 w-2 rounded bg-white" /> : null}
    </span>
  );
}

const BarBtn = ({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick} className={cx('inline-flex h-9 items-center gap-1.5 rounded-xl px-3 font-medium transition hover:bg-white/10 active:scale-95', danger && 'text-red-300')}>{children}</button>
);

function Pick({ items, onPick, onClose }: { items: { id: string; label: string; icon: React.ReactNode }[]; onPick: (id: string) => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="m-card absolute bottom-12 start-0 max-h-72 w-60 overflow-y-auto p-1.5 text-ink shadow-2xl animate-pop">
      {items.map((it) => (
        <button key={it.id} onClick={() => onPick(it.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-ink/5">{it.icon}<span className="truncate">{it.label}</span></button>
      ))}
    </div>
  );
}

function CtxItem({ icon: I, children, onClick, danger }: { icon: typeof Copy; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition hover:bg-ink/5', danger && 'text-red-500')}>
      <I size={15} className={danger ? '' : 'text-muted'} />{children}
    </button>
  );
}
