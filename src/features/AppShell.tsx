import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, Bell, ChevronsLeft, FileDown, HandCoins, Home, LayoutGrid, List, Moon, Plane, Plus, PiggyBank, Repeat, Search,
  Settings, Shapes, Sun, Target, Users, Wallet,
} from 'lucide-react';
import type { Transaction, TxTemplateFields, TxType } from '@/db/types';
import { QuickAdd } from './transactions/QuickAdd';
import { useData } from '@/hooks/useData';
import { compressImage, cx } from '@/lib/utils';
import { Aurora, haptic } from '@/components/motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BrandMark, Wordmark } from '@/components/Brand';
import { AccountMenu, ConflictDialog, SyncBadge } from '@/components/Account';
import { useToast } from '@/components/Toast';
import { patchSettings } from '@/db/repo';
import { isDark } from '@/theme/theme';
import { restoreJSON } from '@/lib/export';
import { useSync } from '@/lib/sync';
import { CommandPalette } from './desktop/CommandPalette';
import { ShortcutsHelp, useShortcuts } from './desktop/Shortcuts';
import { ImportCsv } from './desktop/ImportCsv';

/** Opening the add/edit sheet from anywhere in the app. */
export interface AddOptions {
  tx?: Transaction; // edit an existing transaction
  type?: TxType;
  prefill?: Partial<TxTemplateFields>;
  receipt?: string; // e.g. an image dropped onto the window
}
const AddCtx = createContext<(o?: AddOptions) => void>(() => {});
export const useQuickAdd = () => useContext(AddCtx);

/** Lets any page open the CSV importer (Settings, palette, drag & drop). */
const ImportCtx = createContext<() => void>(() => {});
export const useImport = () => useContext(ImportCtx);

const SIDEBAR_KEY = 'moneta.sidebar';

interface NavDef { to: string; icon: typeof Home; label: string; end?: boolean; kbd?: string }

export function AppShell() {
  const { t } = useTranslation();
  const { settings, trips } = useData();
  const { pathname } = useLocation();
  const toast = useToast();
  const [add, setAdd] = useState<AddOptions | null>(null);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; } });
  const pickRef = useRef<HTMLInputElement>(null);
  const open = useCallback((o: AddOptions = {}) => { haptic(10); setAdd(o); }, []);
  const trip = trips.find((x) => x.id === settings.activeTripId);
  const dark = isDark(settings.theme);
  const syncState = useSync();

  const toggleSidebar = useCallback(() => setCollapsed((c) => { try { localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; }), []);

  /* ---------- Drag & drop anywhere: CSV → import, JSON → restore, image → receipt ---------- */
  const handleFile = useCallback(async (f: File) => {
    if (/\.csv$/i.test(f.name) || f.type === 'text/csv') setImportFile(f);
    else if (/\.json$/i.test(f.name)) {
      if (confirm(t('data.restoreConfirm'))) {
        try { await restoreJSON(f); toast(t('data.restored')); } catch (e) { toast((e as Error).message, undefined, 'warn'); }
      }
    } else if (f.type.startsWith('image/')) open({ type: 'expense', receipt: await compressImage(f) });
    else toast(t('import.unsupported'), undefined, 'warn');
  }, [open, t, toast]);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth++; setDragging(true); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) handleFile(f);
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over); window.removeEventListener('drop', drop);
    };
  }, [handleFile]);

  const startImport = useCallback(() => pickRef.current?.click(), []);

  const mobileNav = [
    { to: '/', icon: Home, label: t('nav.home'), end: true },
    { to: '/transactions', icon: List, label: t('nav.transactions') },
    { to: '/reports', icon: BarChart3, label: t('nav.reports') },
    { to: '/more', icon: LayoutGrid, label: t('nav.more') },
  ];
  const groups: { title: string; items: NavDef[] }[] = [
    { title: t('navg.overview'), items: [
      { to: '/', icon: Home, label: t('nav.home'), end: true, kbd: 'G H' },
      { to: '/transactions', icon: List, label: t('nav.transactions'), kbd: 'G T' },
      { to: '/reports', icon: BarChart3, label: t('nav.reports'), kbd: 'G R' },
    ] },
    { title: t('navg.plan'), items: [
      { to: '/budgets', icon: PiggyBank, label: t('nav.budgets'), kbd: 'G B' },
      { to: '/goals', icon: Target, label: t('nav.goals'), kbd: 'G G' },
      { to: '/bills', icon: Bell, label: t('nav.bills') },
      { to: '/recurring', icon: Repeat, label: t('nav.recurring') },
    ] },
    { title: t('navg.money'), items: [
      { to: '/accounts', icon: Wallet, label: t('nav.accounts'), kbd: 'G A' },
      { to: '/debts', icon: HandCoins, label: t('nav.debts'), kbd: 'G D' },
      { to: '/split', icon: Users, label: t('nav.split') },
      { to: '/trips', icon: Plane, label: t('nav.trips') },
    ] },
    { title: t('navg.manage'), items: [
      { to: '/categories', icon: Shapes, label: t('nav.categories'), kbd: 'G C' },
      { to: '/settings', icon: Settings, label: t('nav.settings'), kbd: 'G S' },
    ] },
  ];

  return (
    <AddCtx.Provider value={open}>
      <ImportCtx.Provider value={startImport}>
        <ShortcutLayer palette={() => setPalette(true)} help={() => setHelp(true)} toggleSidebar={toggleSidebar} />
        <Aurora />
        <div className="flex min-h-screen">
          {/* ---------------- Desktop sidebar ---------------- */}
          <aside className={cx('sticky top-0 hidden h-screen shrink-0 flex-col border-e border-line/60 py-5 transition-[width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] md:flex', collapsed ? 'w-[76px] px-3' : 'w-64 px-4')}>
            <div className={cx('mb-5 flex items-center', collapsed ? 'justify-center' : 'gap-2.5 px-1')}>
              <NavLink to="/" aria-label="Moneta"><BrandMark size={collapsed ? 40 : 42} /></NavLink>
              {!collapsed && <Wordmark size={24} className="animate-fade-in" />}
            </div>
            <button onClick={() => open()} title={t('tx.add')} className={cx('m-btn m-btn-primary mb-4 h-11 text-sm', collapsed && '!px-0')}>
              <Plus size={20} /> {!collapsed && t('tx.add')}
            </button>
            <nav className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 no-scrollbar">
              {groups.map((g) => (
                <div key={g.title}>
                  {!collapsed && <div className="m-label mb-1 px-3 !text-[10px]">{g.title}</div>}
                  {g.items.map((n) => (
                    <NavLink
                      key={n.to} to={n.to} end={n.end} title={collapsed ? n.label : undefined}
                      className={({ isActive }) => cx(
                        'group relative flex h-10 items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200',
                        collapsed ? 'justify-center' : 'px-3',
                        isActive ? 'bg-brand/10 text-brand' : 'text-ink/75 hover:translate-x-0.5 hover:bg-ink/5 hover:text-ink rtl:hover:-translate-x-0.5',
                      )}
                    >
                      {({ isActive }) => (
                        <>
                          <span className={cx('absolute start-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand transition-all duration-300', isActive ? 'opacity-100' : 'scale-y-0 opacity-0')} />
                          <n.icon size={19} strokeWidth={isActive ? 2.4 : 2} className="shrink-0" />
                          {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
                          {!collapsed && n.kbd && <kbd className="hidden rounded px-1 text-[9px] text-muted opacity-0 transition group-hover:opacity-100 lg:block">{n.kbd}</kbd>}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
            <div className={cx('mt-3 flex items-center gap-2 border-t border-line/60 pt-3', collapsed && 'flex-col')}>
              <AccountMenu placement="up" onShortcuts={() => setHelp(true)} />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{settings.profile.name || t('profile.you')}</div>
                  <SyncBadge compact />
                </div>
              )}
              <button onClick={toggleSidebar} aria-label={t('kbd.sidebar')} title={`${t('kbd.sidebar')} ( [ )`} className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-ink/5 hover:text-ink">
                <ChevronsLeft size={17} className={cx('transition-transform duration-300', collapsed && 'rotate-180', 'rtl:-scale-x-100')} />
              </button>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {/* ---------------- Desktop top bar ---------------- */}
            <header className="sticky top-0 z-30 hidden h-16 items-center gap-3 border-b border-line/50 bg-surface/70 px-6 backdrop-blur-xl md:flex">
              <button onClick={() => setPalette(true)} className="m-input group flex !h-10 max-w-md flex-1 items-center gap-2.5 !px-3 text-start text-sm text-muted transition hover:border-brand/50">
                <Search size={17} className="transition group-hover:text-brand" />
                <span className="flex-1 truncate">{t('cmd.placeholder')}</span>
                <kbd className="m-tile px-1.5 text-[10px] font-semibold">{/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd>
              </button>
              <div className="ms-auto flex items-center gap-2">
                <NavLink to={syncState.user ? '/settings#sync' : '/auth'} className="transition hover:opacity-80"><SyncBadge /></NavLink>
                <button onClick={startImport} title={t('import.title')} className="grid h-10 w-10 place-items-center rounded-full text-ink/75 transition hover:bg-ink/5 active:scale-90"><FileDown size={19} /></button>
                <button onClick={() => patchSettings({ theme: dark ? 'light' : 'dark' })} title={`${t('cmd.toggleDark')} (D)`} className="grid h-10 w-10 place-items-center rounded-full text-ink/75 transition hover:bg-ink/5 active:scale-90">
                  {dark ? <Sun size={19} className="animate-pop" /> : <Moon size={19} className="animate-pop" />}
                </button>
                <AccountMenu onShortcuts={() => setHelp(true)} />
              </div>
            </header>

            <main className="mx-auto min-w-0 max-w-[1400px] overflow-x-clip px-4 pb-32 md:px-8 md:pb-12 md:pt-2">
              {trip && (
                <div className="-mx-4 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold text-white md:mx-0 md:mt-3 md:rounded-full" style={{ background: 'var(--brand-grad)' }}>
                  <Plane size={14} className="animate-float" /> {t('trip.activeBanner', { name: trip.name, currency: trip.currency })}
                </div>
              )}
              <div key={pathname} className="animate-page">
                <ErrorBoundary resetKey={pathname}>
                  <Outlet />
                </ErrorBoundary>
              </div>
            </main>
          </div>
        </div>

        {/* ---------------- Mobile bottom navigation ---------------- */}
        <nav className="m-bar fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="mx-auto grid h-[68px] max-w-lg grid-cols-5 items-center">
            {mobileNav.slice(0, 2).map((n) => <NavItem key={n.to} {...n} />)}
            <div className="flex justify-center">
              <button
                onClick={() => open()}
                aria-label={t('tx.add')}
                className={cx('m-btn m-btn-primary -mt-9 h-16 w-16 !rounded-full ring-[6px] ring-surface transition-transform duration-300', add && 'rotate-45')}
              >
                <Plus size={30} strokeWidth={2.5} />
              </button>
            </div>
            {mobileNav.slice(2).map((n) => <NavItem key={n.to} {...n} />)}
          </div>
        </nav>

        {/* Drop overlay */}
        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-[80] grid place-items-center bg-brand/10 backdrop-blur-sm animate-fade-in">
            <div className="m-card flex flex-col items-center gap-3 border-2 border-dashed !border-brand px-12 py-10 text-center animate-pop">
              <BrandMark size={72} float />
              <div className="text-lg font-bold">{t('import.dropTitle')}</div>
              <div className="text-sm text-muted">{t('import.dropText')}</div>
            </div>
          </div>
        )}

        <input ref={pickRef} type="file" accept=".csv,text/csv,.json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        {add && <QuickAdd options={add} onClose={() => setAdd(null)} />}
        <CommandPalette open={palette} onClose={() => setPalette(false)} onShortcuts={() => setHelp(true)} onImport={startImport} />
        <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
        <ImportCsv file={importFile} onClose={() => setImportFile(null)} />
        <ConflictDialog />
      </ImportCtx.Provider>
    </AddCtx.Provider>
  );
}

/** Mounted inside the providers so shortcuts can use the quick-add context. */
function ShortcutLayer(h: { palette: () => void; help: () => void; toggleSidebar: () => void }) {
  useShortcuts(h);
  return null;
}

function NavItem({ to, icon: Ico, label, end }: { to: string; icon: typeof Home; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} onClick={() => haptic(5)} className={({ isActive }) => cx('group flex flex-col items-center gap-0.5 text-[10.5px] font-semibold transition-colors', isActive ? 'text-brand' : 'text-muted')}>
      {({ isActive }) => (
        <>
          <span className={cx('grid h-8 w-14 place-items-center rounded-full transition-all duration-300 ease-[cubic-bezier(.3,1.4,.6,1)]', isActive ? 'scale-100 bg-brand/15' : 'scale-90 bg-transparent group-active:scale-75')}>
            <Ico size={21} strokeWidth={isActive ? 2.4 : 2} />
          </span>
          <span className="max-w-full truncate px-1">{label}</span>
        </>
      )}
    </NavLink>
  );
}
