import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BarChart3, Bell, CornerDownLeft, Database, Download, FileUp, HandCoins, Home, Keyboard,
  Languages, List, Moon, Palette, PiggyBank, Plane, RefreshCw, Repeat, Search, Settings, Shapes, Target, Users, Wallet,
} from 'lucide-react';
import { useData } from '@/hooks/useData';
import { patchSettings } from '@/db/repo';
import { isDark, nextStyle } from '@/theme/theme';
import { exportCSV, backupJSON } from '@/lib/export';
import { syncNowManual, useSync } from '@/lib/sync';
import { Icon } from '@/lib/icons';
import { cx } from '@/lib/utils';
import { useQuickAdd } from '../AppShell';

/**
 * Command palette (Ctrl/⌘ K or "/"): run actions, jump to pages, and search
 * transactions, categories and accounts — all from the keyboard.
 */
interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  kbd?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose, onShortcuts, onImport }: { open: boolean; onClose: () => void; onShortcuts: () => void; onImport: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const openAdd = useQuickAdd();
  const d = useData();
  const sync = useSync();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setQ(''); setSel(0); } }, [open]);

  const cmds = useMemo<Cmd[]>(() => {
    const A = t('cmd.actions'), N = t('cmd.navigate');
    const go = (to: string) => () => nav(to);
    const ico = (I: typeof Home) => <I size={17} />;
    const base: Cmd[] = [
      { id: 'a-exp', group: A, label: t('cmd.addExpense'), icon: ico(ArrowUpRight), kbd: 'N', run: () => openAdd({ type: 'expense' }) },
      { id: 'a-inc', group: A, label: t('cmd.addIncome'), icon: ico(ArrowDownLeft), kbd: 'I', run: () => openAdd({ type: 'income' }) },
      { id: 'a-tr', group: A, label: t('cmd.addTransfer'), icon: ico(ArrowLeftRight), kbd: 'T', run: () => openAdd({ type: 'transfer' }) },
      { id: 'a-dark', group: A, label: t('cmd.toggleDark'), icon: ico(Moon), kbd: 'D', run: () => patchSettings({ theme: isDark(d.settings.theme) ? 'light' : 'dark' }) },
      { id: 'a-style', group: A, label: t('style.switch'), hint: t(`style.${nextStyle(d.settings.style)}`), icon: ico(Palette), kbd: 'S', run: () => patchSettings({ style: nextStyle(d.settings.style) }) },
      ...(sync.user ? [{ id: 'a-sync', group: A, label: t('sync.now'), icon: ico(RefreshCw), run: () => { syncNowManual().catch(() => {}); } }] : []),
      { id: 'a-imp', group: A, label: t('import.title'), icon: ico(FileUp), run: onImport },
      { id: 'a-csv', group: A, label: t('data.exportAll'), icon: ico(Download), run: () => exportCSV(d.transactions, { settings: d.settings, accounts: d.accounts, categories: d.categories, t }) },
      { id: 'a-bak', group: A, label: t('data.backup'), icon: ico(Database), run: () => { backupJSON(); } },
      { id: 'a-kbd', group: A, label: t('kbd.title'), icon: ico(Keyboard), kbd: '?', run: onShortcuts },
      { id: 'n-home', group: N, label: t('nav.home'), icon: ico(Home), kbd: 'G H', run: go('/') },
      { id: 'n-tx', group: N, label: t('nav.transactions'), icon: ico(List), kbd: 'G T', run: go('/transactions') },
      { id: 'n-rep', group: N, label: t('nav.reports'), icon: ico(BarChart3), kbd: 'G R', run: go('/reports') },
      { id: 'n-bud', group: N, label: t('nav.budgets'), icon: ico(PiggyBank), kbd: 'G B', run: go('/budgets') },
      { id: 'n-goal', group: N, label: t('nav.goals'), icon: ico(Target), kbd: 'G G', run: go('/goals') },
      { id: 'n-acc', group: N, label: t('nav.accounts'), icon: ico(Wallet), kbd: 'G A', run: go('/accounts') },
      { id: 'n-cat', group: N, label: t('nav.categories'), icon: ico(Shapes), kbd: 'G C', run: go('/categories') },
      { id: 'n-debt', group: N, label: t('nav.debts'), icon: ico(HandCoins), kbd: 'G D', run: go('/debts') },
      { id: 'n-split', group: N, label: t('nav.split'), icon: ico(Users), run: go('/split') },
      { id: 'n-bill', group: N, label: t('nav.bills'), icon: ico(Bell), run: go('/bills') },
      { id: 'n-rec', group: N, label: t('nav.recurring'), icon: ico(Repeat), run: go('/recurring') },
      { id: 'n-trip', group: N, label: t('nav.trips'), icon: ico(Plane), run: go('/trips') },
      { id: 'n-set', group: N, label: t('nav.settings'), icon: ico(Settings), kbd: 'G S', run: go('/settings') },
      { id: 'n-lang', group: N, label: t('lang.editor'), icon: ico(Languages), run: go('/settings/languages') },
    ];
    return base;
  }, [t, d, sync.user]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (txt: string) => !s || txt.toLowerCase().includes(s) || fuzzy(txt.toLowerCase(), s);
    const out: Cmd[] = cmds.filter((c) => match(c.label + ' ' + (c.hint ?? '')));
    if (s) {
      const C = t('cmd.categories'), AC = t('nav.accounts'), TX = t('nav.transactions');
      for (const c of d.categories.filter((c) => c.name.toLowerCase().includes(s)).slice(0, 5)) {
        out.push({ id: 'c-' + c.id, group: C, label: c.name, icon: <Icon name={c.icon} size={17} style={{ color: c.color }} />, run: () => nav(`/transactions?category=${c.id}`) });
      }
      for (const a of d.accounts.filter((a) => a.name.toLowerCase().includes(s)).slice(0, 4)) {
        out.push({ id: 'ac-' + a.id, group: AC, label: a.name, hint: a.currency, icon: <Icon name={a.icon} size={17} style={{ color: a.color }} />, run: () => nav(`/transactions?account=${a.id}`) });
      }
      const txs = d.transactions.filter((x) => {
        const cat = d.categories.find((c) => c.id === x.categoryId)?.name ?? '';
        return `${x.note} ${x.tags.join(' ')} ${cat} ${x.amount}`.toLowerCase().includes(s);
      }).slice(0, 8);
      for (const x of txs) {
        const cat = d.categories.find((c) => c.id === x.categoryId);
        out.push({
          id: 'tx-' + x.id, group: TX, label: x.note || cat?.name || t(`tx.${x.type}`),
          hint: `${d.date(x.date, 'd MMM')} · ${x.type === 'expense' ? '−' : '+'}${d.money(x.amount, x.currency)}`,
          icon: <Icon name={cat?.icon ?? 'receipt'} size={17} style={{ color: cat?.color }} />,
          run: () => openAdd({ tx: x }),
        });
      }
    }
    return out;
  }, [q, cmds, d]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const exec = (c?: Cmd) => { if (!c) return; onClose(); setTimeout(c.run, 10); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); exec(results[sel]); }
    else if (e.key === 'Escape') onClose();
  };

  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label={t('cmd.title')}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="m-sheet relative w-full max-w-xl overflow-hidden !rounded-3xl shadow-2xl animate-pop" onKeyDown={onKey}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={20} className="text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cmd.placeholder')} className="h-14 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted" />
          <kbd className="m-tile px-2 py-0.5 text-[10px] text-muted">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && <p className="py-10 text-center text-sm text-muted">{t('cmd.empty')}</p>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? (lastGroup = c.group) : null;
            return (
              <div key={c.id}>
                {header && <div className="m-label px-3 pb-1 pt-3">{header}</div>}
                <button
                  data-i={i}
                  onMouseMove={() => setSel(i)}
                  onClick={() => exec(c)}
                  className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm transition-colors', i === sel ? 'bg-brand text-white' : 'text-ink')}
                >
                  <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', i === sel ? 'bg-white/20 text-white [&_svg]:!text-white' : 'bg-ink/5 text-muted')}>{c.icon}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                  {c.hint && <span className={cx('truncate text-xs', i === sel ? 'text-white/80' : 'text-muted')}>{c.hint}</span>}
                  {c.kbd && <kbd className={cx('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', i === sel ? 'bg-white/20' : 'm-tile text-muted')}>{c.kbd}</kbd>}
                  {i === sel && <CornerDownLeft size={14} className="shrink-0 opacity-80" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
          <span><kbd className="m-tile px-1">↑</kbd> <kbd className="m-tile px-1">↓</kbd> {t('cmd.move')}</span>
          <span><kbd className="m-tile px-1">↵</kbd> {t('cmd.run')}</span>
          <span className="ms-auto">Moneta</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Subsequence match: "adex" matches "add expense". */
function fuzzy(text: string, q: string) {
  let i = 0;
  for (const ch of text) if (ch === q[i]) i++;
  return i === q.length && q.length > 2;
}
