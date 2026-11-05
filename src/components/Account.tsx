import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Cloud, CloudOff, Keyboard, Loader2, LogIn, LogOut, RefreshCw, Settings, UserRound } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Avatar, Button } from './ui';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { resolveConflictReplace, signOut, syncNowManual, useSync, type SyncStatus } from '@/lib/sync';
import { cx } from '@/lib/utils';

/** Account UI: sync status chip, avatar dropdown, sign-out choices, account-switch dialog. */

const STATUS: Record<SyncStatus, { icon: typeof Cloud; tone: string }> = {
  off: { icon: CloudOff, tone: 'text-muted' },
  'signed-out': { icon: CloudOff, tone: 'text-muted' },
  idle: { icon: Check, tone: 'text-emerald-500' },
  syncing: { icon: Loader2, tone: 'text-brand' },
  error: { icon: AlertTriangle, tone: 'text-red-500' },
  offline: { icon: CloudOff, tone: 'text-amber-500' },
  conflict: { icon: AlertTriangle, tone: 'text-amber-500' },
};

export function SyncBadge({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const s = useSync();
  const S = STATUS[s.status];
  return (
    <span title={s.error ?? t(`sync.status.${s.status}`)} className={cx('inline-flex items-center gap-1.5 rounded-full text-xs font-semibold', !compact && 'm-tile px-2.5 py-1', S.tone)}>
      <span className="relative grid place-items-center">
        {s.status === 'idle' && <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400/50 [animation-iteration-count:2]" />}
        <S.icon size={14} className={s.status === 'syncing' ? 'animate-spin' : ''} />
      </span>
      {!compact && <span>{t(`sync.status.${s.status}`)}</span>}
    </span>
  );
}

/** Avatar button + dropdown (desktop top bar & sidebar). */
export function AccountMenu({ onShortcuts, placement = 'down' }: { onShortcuts?: () => void; placement?: 'down' | 'up' }) {
  const { t } = useTranslation();
  const { settings } = useData();
  const s = useSync();
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const name = settings.profile.name || s.user?.name || t('profile.you');
  const go = (to: string) => { setOpen(false); nav(to); };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} className="relative rounded-full transition active:scale-95">
        <Avatar name={name} src={settings.profile.avatar ?? s.user?.avatar} size={38} />
        <span className="absolute -bottom-0.5 -end-0.5 grid h-4 w-4 place-items-center rounded-full bg-card ring-2 ring-card"><SyncBadge compact /></span>
      </button>
      {open && (
        <div role="menu" className={cx('m-card absolute end-0 z-50 w-72 p-2 shadow-2xl animate-pop', placement === 'down' ? 'top-12 origin-top-right' : 'bottom-12 origin-bottom-left start-0 end-auto')}>
          <div className="flex items-center gap-3 rounded-xl p-2">
            <Avatar name={name} src={settings.profile.avatar ?? s.user?.avatar} size={44} />
            <div className="min-w-0">
              <div className="truncate font-bold">{name}</div>
              <div className="truncate text-xs text-muted">{s.user?.email ?? t('auth.localOnly')}</div>
            </div>
          </div>
          <div className="m-rule my-1.5" />
          {s.user && (
            <div className="flex items-center justify-between px-2 py-1.5">
              <SyncBadge />
              <button onClick={() => syncNowManual().then(() => toast(t('sync.synced'))).catch((e) => toast(e.message, undefined, 'warn'))} className="m-btn m-btn-ghost h-8 px-2 text-xs"><RefreshCw size={14} className={s.status === 'syncing' ? 'animate-spin' : ''} />{t('sync.now')}</button>
            </div>
          )}
          <MenuItem icon={UserRound} onClick={() => go('/settings#profile')}>{t('profile.title')}</MenuItem>
          <MenuItem icon={Settings} onClick={() => go('/settings')}>{t('nav.settings')}</MenuItem>
          {onShortcuts && <MenuItem icon={Keyboard} onClick={() => { setOpen(false); onShortcuts(); }} kbd="?">{t('kbd.title')}</MenuItem>}
          <div className="m-rule my-1.5" />
          {s.user ? (
            <MenuItem icon={LogOut} danger onClick={() => { setOpen(false); setSignOutOpen(true); }}>{t('auth.signOut')}</MenuItem>
          ) : (
            <MenuItem icon={LogIn} onClick={() => go('/auth')}>{t('auth.signInSync')}</MenuItem>
          )}
        </div>
      )}
      <SignOutDialog open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </div>
  );
}

function MenuItem({ icon: Ico, children, onClick, danger, kbd }: { icon: typeof Cloud; children: React.ReactNode; onClick: () => void; danger?: boolean; kbd?: string }) {
  return (
    <button role="menuitem" onClick={onClick} className={cx('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition hover:bg-ink/5', danger && 'text-red-500')}>
      <Ico size={17} className={danger ? '' : 'text-muted'} /> <span className="flex-1 text-start">{children}</span>
      {kbd && <kbd className="m-tile px-1.5 text-[10px] text-muted">{kbd}</kbd>}
    </button>
  );
}

/** Sign out: keep data on this device (default) or remove it (shared computer). */
export function SignOutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async (wipe: boolean) => {
    setBusy(true);
    await signOut(wipe);
    setBusy(false);
    onClose();
    if (!wipe) toast(t('auth.signedOut'));
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('auth.signOutTitle')}>
      <p className="mb-4 text-sm text-muted">{t('auth.signOutText')}</p>
      <div className="space-y-2 pb-2">
        <Button block size="lg" disabled={busy} onClick={() => go(false)}><LogOut size={18} />{t('auth.signOutKeep')}</Button>
        <Button block size="lg" variant="danger" disabled={busy} onClick={() => go(true)}>{t('auth.signOutWipe')}</Button>
      </div>
    </Sheet>
  );
}

/** Shown when someone signs into a different account than the one this device's data belongs to. */
export function ConflictDialog() {
  const { t } = useTranslation();
  const s = useSync();
  const [busy, setBusy] = useState(false);
  if (s.status !== 'conflict') return null;
  return (
    <Sheet open onClose={() => signOut(false)} title={t('auth.conflictTitle')}>
      <p className="mb-4 text-sm text-muted">{t('auth.conflictText', { email: s.conflictEmail })}</p>
      <div className="space-y-2 pb-2">
        <Button block size="lg" disabled={busy} onClick={async () => { setBusy(true); await resolveConflictReplace(); setBusy(false); }}>{t('auth.conflictReplace')}</Button>
        <Button block size="lg" variant="ghost" disabled={busy} onClick={() => signOut(false)}>{t('auth.conflictCancel')}</Button>
      </div>
    </Sheet>
  );
}

/** Compact account card for phones (More page). */
export function AccountCard() {
  const { t } = useTranslation();
  const { settings } = useData();
  const s = useSync();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const name = settings.profile.name || s.user?.name || t('profile.you');
  return (
    <div className="m-card flex items-center gap-3 p-3">
      <Avatar name={name} src={settings.profile.avatar ?? s.user?.avatar} size={48} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{name}</div>
        <div className="truncate text-xs text-muted">{s.user?.email ?? t('auth.localOnly')}</div>
        {s.user && <div className="mt-1"><SyncBadge /></div>}
      </div>
      {s.user ? (
        <Button size="sm" variant="ghost" onClick={() => setSignOutOpen(true)}><LogOut size={14} />{t('auth.signOut')}</Button>
      ) : (
        <Link to="/auth" className="m-btn m-btn-primary h-9 px-3 text-xs"><LogIn size={14} />{t('auth.signIn')}</Link>
      )}
      <SignOutDialog open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </div>
  );
}
