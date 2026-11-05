import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { patchSettings } from '@/db/repo';
import { isDark, nextStyle } from '@/theme/theme';
import { useData } from '@/hooks/useData';
import { useQuickAdd } from '../AppShell';

/**
 * Global keyboard shortcuts (ignored while typing in a field or when a dialog is open).
 *   Ctrl/⌘ K or /  command palette        N / I / T   add expense / income / transfer
 *   G then H T R B G A C D S   go to page  D  dark mode   S  switch style
 *   [  collapse sidebar                    ?  this help
 */
export function useShortcuts(h: { palette: () => void; help: () => void; toggleSidebar: () => void }) {
  const nav = useNavigate();
  const openAdd = useQuickAdd();
  const { settings } = useData();
  const pendingG = useRef(0);
  const ref = useRef({ h, settings });
  ref.current = { h, settings };

  useEffect(() => {
    const GO: Record<string, string> = { h: '/', t: '/transactions', r: '/reports', b: '/budgets', g: '/goals', a: '/accounts', c: '/categories', d: '/debts', s: '/settings' };
    const onKey = (e: KeyboardEvent) => {
      const { h, settings } = ref.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); h.palette(); return; }
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (Date.now() - pendingG.current < 1200 && GO[k]) { e.preventDefault(); pendingG.current = 0; nav(GO[k]); return; }
      switch (e.key) {
        case '/': e.preventDefault(); h.palette(); break;
        case '?': e.preventDefault(); h.help(); break;
        case '[': h.toggleSidebar(); break;
        case 'n': case 'N': e.preventDefault(); openAdd({ type: 'expense' }); break;
        case 'i': case 'I': e.preventDefault(); openAdd({ type: 'income' }); break;
        case 't': case 'T': e.preventDefault(); openAdd({ type: 'transfer' }); break;
        case 'd': case 'D': patchSettings({ theme: isDark(settings.theme) ? 'light' : 'dark' }); break;
        case 's': case 'S': patchSettings({ style: nextStyle(settings.style) }); break;
        case 'g': case 'G': pendingG.current = Date.now(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, openAdd]);
}

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const rows: [string[], string][] = [
    [[mac ? '⌘' : 'Ctrl', 'K'], t('cmd.title')],
    [['/'], t('cmd.title')],
    [['N'], t('cmd.addExpense')],
    [['I'], t('cmd.addIncome')],
    [['T'], t('cmd.addTransfer')],
    [['D'], t('cmd.toggleDark')],
    [['S'], t('style.switch')],
    [['['], t('kbd.sidebar')],
    [['G', 'H'], t('nav.home')],
    [['G', 'T'], t('nav.transactions')],
    [['G', 'R'], t('nav.reports')],
    [['G', 'B'], t('nav.budgets')],
    [['G', 'G'], t('nav.goals')],
    [['G', 'A'], t('nav.accounts')],
    [['G', 'S'], t('nav.settings')],
    [['Enter'], t('kbd.save')],
    [['Del'], t('kbd.deleteSelected')],
    [['Esc'], t('kbd.close')],
    [['?'], t('kbd.title')],
  ];
  return (
    <Sheet open={open} onClose={onClose} title={t('kbd.title')}>
      <div className="grid gap-x-6 gap-y-1 pb-3 sm:grid-cols-2">
        {rows.map(([keys, label], i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-b border-dashed border-line py-2 text-sm animate-rise" style={{ animationDelay: `${i * 20}ms` }}>
            <span className="text-ink">{label}</span>
            <span className="flex shrink-0 gap-1">{keys.map((k) => <kbd key={k} className="m-tile min-w-[26px] px-1.5 py-0.5 text-center text-[11px] font-semibold">{k}</kbd>)}</span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
