import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { db } from './db/db';
import { defaultSettings, normalizeSettings } from './db/defaults';
import { applyTheme, watchTheme } from './theme/theme';
import { NotFound } from './components/ErrorBoundary';
import type { Settings } from './db/types';
import { applyLanguage, loadCustomLanguages } from './i18n';
import { DataProvider } from './hooks/useData';
import { ToastProvider } from './components/Toast';
import { AppShell } from './features/AppShell';
import { SetupWizard } from './features/setup/SetupWizard';
import { LockScreen } from './features/lock/LockScreen';
import { Dashboard } from './features/dashboard/Dashboard';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { MorePage } from './features/MorePage';
import { AccountsPage } from './features/accounts/AccountsPage';
import { CategoriesPage } from './features/categories/CategoriesPage';
import { BudgetsPage } from './features/budgets/BudgetsPage';
import { GoalsPage } from './features/goals/GoalsPage';
import { DebtsPage } from './features/debts/DebtsPage';
import { SplitPage } from './features/split/SplitPage';
import { BillsPage } from './features/bills/BillsPage';
import { RecurringPage } from './features/recurring/RecurringPage';
import { TripsPage } from './features/trips/TripsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { LanguageEditor } from './features/settings/LanguageEditor';
import { runRecurring } from './lib/recurring';
import { fetchRates } from './lib/rates';
import { hasEntryOn, scheduleDailyReminder } from './lib/notify';
import { completeAuthFromUrl, startSyncEngine, useSync } from './lib/sync';
import { initNative } from './lib/native';
import { Splash, useSplash } from './components/Brand';
import { AuthScreen } from './features/auth/AuthScreen';
import { isoDay } from './lib/period';

/** Applies style × mode × accent; follows the OS and other tabs. */
function useTheme(s: Settings | null | undefined) {
  const ref = useRef(s);
  ref.current = s;
  const first = useRef(true);
  useEffect(() => watchTheme(() => (ref.current ? { style: ref.current.style, mode: ref.current.theme, accent: ref.current.accent } : null)), []);
  useEffect(() => {
    if (!s) return;
    applyTheme({ style: s.style, mode: s.theme, accent: s.accent }, !first.current);
    first.current = false;
  }, [s?.style, s?.theme, s?.accent]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Supabase auth + sync engine starts once, before any UI (handles OAuth/reset redirects too).
startSyncEngine();
initNative((url) => { completeAuthFromUrl(url).catch((e) => console.error('auth callback', e)); });

export function Root() {
  const settings = useLiveQuery(() => db.settings.get('app').then((s) => (s ? normalizeSettings(s) : null)), []);
  const languages = useLiveQuery(() => db.languages.toArray(), []);
  const [locked, setLocked] = useState(true);
  const [langReady, setLangReady] = useState(false);
  const { t } = useTranslation();

  // First run: create default settings.
  useEffect(() => {
    if (settings === null) db.settings.put(defaultSettings());
  }, [settings]);

  // Language + RTL direction (also re-applied when custom languages change).
  useEffect(() => {
    if (!settings || !languages) return;
    loadCustomLanguages(languages);
    applyLanguage(settings.language, languages).then(() => setLangReady(true));
  }, [settings?.language, languages]); // eslint-disable-line react-hooks/exhaustive-deps

  useTheme(settings);

  // Background jobs on start: recurring entries, exchange rates, auto-sync.
  useEffect(() => {
    if (!settings?.setupDone) return;
    runRecurring();
    fetchRates();
    const onOnline = () => fetchRates();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [settings?.setupDone]);

  // Daily reminder (fires while the app / PWA is running).
  useEffect(() => {
    if (!settings?.setupDone) return;
    scheduleDailyReminder(settings, t('reminder.title'), t('reminder.body'), async () =>
      hasEntryOn(await db.transactions.where('date').startsWith(isoDay(new Date())).toArray()),
    );
  }, [settings?.dailyReminder.enabled, settings?.dailyReminder.time, settings?.setupDone, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = useSync();
  // Cloud mode: wait until we know whether someone is signed in and, if so, their cloud data is in.
  const cloud = sync.mode === 'cloud';
  const cloudGate = !cloud || (sync.authReady && (!sync.user || sync.cloudReady));
  const ready = !!settings && langReady && cloudGate;
  const splash = useSplash(ready);

  let body: JSX.Element | null = null;
  if (ready) {
    if (sync.recovery) body = <AuthScreen initialMode="reset" onDone={() => {}} />; // arrived from a password-reset e-mail
    else if (cloud && !sync.user) body = <AuthScreen onDone={() => {}} />; // cloud mode: sign in, or choose "this device only"
    else if (!settings.setupDone) body = <SetupWizard settings={settings} />;
    else if (settings.lock.enabled && locked) body = <LockScreen settings={settings} onUnlock={() => setLocked(false)} />;
    else body = (
      <DataProvider settings={settings}>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="auth" element={<AuthRoute />} />
              <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="more" element={<MorePage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="budgets" element={<BudgetsPage />} />
                <Route path="goals" element={<GoalsPage />} />
                <Route path="debts" element={<DebtsPage />} />
                <Route path="split" element={<SplitPage />} />
                <Route path="bills" element={<BillsPage />} />
                <Route path="recurring" element={<RecurringPage />} />
                <Route path="trips" element={<TripsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="settings/languages" element={<LanguageEditor />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </DataProvider>
    );
  }

  return (
    <>
      {body}
      {splash.mounted && <Splash leaving={splash.leaving} />}
    </>
  );
}

/** /auth inside the app: back to where you came from when done or skipped. */
function AuthRoute() {
  const nav = useNavigate();
  const back = () => (window.history.length > 2 ? nav(-1) : nav('/', { replace: true }));
  return <AuthScreen onDone={() => nav('/', { replace: true })} onSkip={back} />;
}
