import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronLeft, Download, LogIn, Search, Smartphone } from 'lucide-react';
import { isNative } from '@/lib/native';
import { downloadApk } from '@/lib/appUpdate';
import { BrandBanner, BrandMark } from '@/components/Brand';
import { AuthScreen } from '../auth/AuthScreen';
import { scheduleSync, syncEnabled, useSync } from '@/lib/sync';
import { db } from '@/db/db';
import { COUNTRIES, CATEGORY_SETS, countryName } from '@/db/defaults';
import type { DigitStyle, Grouping, Settings } from '@/db/types';
import { allLanguages, applyLanguage } from '@/i18n';
import { Button, Input, Segmented, Toggle } from '@/components/ui';
import { allCurrencyCodes, currencyName, defaultSymbol } from '@/lib/currency';
import { formatMoney } from '@/lib/format';
import { seedAccounts, seedCategories, seedDemo } from '@/db/demo';
import { fetchRates } from '@/lib/rates';
import { cx } from '@/lib/utils';
import { Aurora } from '@/components/motion';
import { StylePreview } from '../settings/SettingsPage';
import { STYLES, applyTheme, isDark } from '@/theme/theme';

/**
 * First-launch wizard: language → country → main currency & number style →
 * category set (+ optional demo data). Everything can be changed later.
 */
export function SetupWizard({ settings }: { settings: Settings }) {
  const { t, i18n } = useTranslation();
  const custom = useLiveQuery(() => db.languages.toArray(), []) ?? [];
  const [step, setStep] = useState(0);
  const [s, setS] = useState<Settings>(settings);
  const [q, setQ] = useState('');
  const [preset, setPreset] = useState('standard');
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState(false);
  const sync = useSync();
  const patch = (p: Partial<Settings>) => setS((x) => ({ ...x, ...p }));
  const pickStyle = (style: Settings['style']) => { patch({ style }); applyTheme({ style, mode: s.theme, accent: s.accent }, true); };

  const countries = useMemo(() => {
    const list = COUNTRIES.map((c) => ({ ...c, name: countryName(c.code, i18n.language) })).sort((a, b) => a.name.localeCompare(b.name));
    const f = q.trim().toLowerCase();
    return f ? list.filter((c) => c.name.toLowerCase().includes(f) || c.code.toLowerCase().includes(f) || c.currency.toLowerCase().includes(f)) : list;
  }, [q, i18n.language]);

  const currencies = useMemo(() => {
    const f = q.trim().toLowerCase();
    const all = allCurrencyCodes();
    return f ? all.filter((c) => c.toLowerCase().includes(f) || currencyName(c, i18n.language).toLowerCase().includes(f)) : all;
  }, [q, i18n.language]);

  const pickLanguage = async (code: string) => {
    patch({ language: code, digitStyle: code === 'bn' ? 'beng' : code === 'hi' ? 'latn' : 'latn' });
    await applyLanguage(code, custom);
  };

  const pickCountry = (code: string) => {
    const c = COUNTRIES.find((x) => x.code === code)!;
    patch({ country: code, baseCurrency: c.currency, decimalSep: c.decimalSep, groupSep: c.groupSep, grouping: c.grouping, dateFormat: c.dateFormat, weekStartsOn: c.weekStartsOn });
    setPreset(['BD', 'IN', 'PK', 'NP', 'LK'].includes(code) ? 'southAsia' : 'standard');
  };

  const finish = async () => {
    setBusy(true);
    await db.settings.put({ ...s, updatedAt: Date.now() });
    if (!(await db.categories.count())) await seedCategories(preset, t);
    if (!(await db.accounts.count())) await seedAccounts(s.baseCurrency, t);
    fetchRates(true);
    if (demo) await seedDemo(s.baseCurrency, t);
    await db.settings.update('app', { setupDone: true, updatedAt: Date.now() });
    scheduleSync(500);
  };

  // Existing account: sign in, cloud settings & data are pulled; if setup was done elsewhere the app opens directly.
  if (auth) return <AuthScreen onDone={() => setAuth(false)} onSkip={() => setAuth(false)} />;

  const steps = [t('setup.language'), t('setup.country'), t('setup.currency'), t('setup.start')];
  const next = () => { setQ(''); setStep(step + 1); };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-5 pb-6 pt-[max(env(safe-area-inset-top),20px)]">
      <Aurora />
      <div className="mb-6 flex items-center gap-3">
        {step > 0 ? <button onClick={() => { setQ(''); setStep(step - 1); }} className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" aria-label="Back"><ChevronLeft className="rtl:rotate-180" /></button> : <BrandMark size={40} />}
        <div className="flex flex-1 gap-1.5">{steps.map((_, i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full transition', i <= step ? 'bg-brand' : 'bg-ink/10')} />)}</div>
      </div>

      <div key={step} className="animate-page">
      {step === 0 && (
        <>
          <BrandBanner className="mx-auto mb-6 w-full max-w-sm" animated />
          <h1 className="text-3xl font-bold tracking-tight">{t('setup.welcome')}</h1>
          <p className="mb-6 mt-1 text-muted">{t('setup.welcomeText')}</p>
          <div className="space-y-2">
            {allLanguages(custom).map((l) => (
              <Option key={l.code} active={s.language === l.code} onClick={() => pickLanguage(l.code)} title={l.name} sub={l.code.toUpperCase()} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{t('setup.langHint')}</p>
          {syncEnabled && sync.mode === 'local' && (
            <button onClick={() => setAuth(true)} className="m-card mt-5 flex w-full items-center gap-3 p-4 text-start transition active:scale-[.98]">
              <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: 'var(--brand-grad)' }}><LogIn size={18} /></span>
              <span className="flex-1"><b className="block text-sm">{t('auth.haveAccount')}</b><span className="text-xs text-muted">{t('auth.haveAccountText')}</span></span>
            </button>
          )}
          {!isNative && (
            <button onClick={() => downloadApk()} className="m-card mt-3 flex w-full items-center gap-3 p-4 text-start transition active:scale-[.98]">
              <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: 'var(--brand-grad)' }}><Smartphone size={18} /></span>
              <span className="flex-1"><b className="block text-sm">{t('update.getApp')}</b><span className="text-xs text-muted">{t('update.downloadAndroid')}</span></span>
              <Download size={18} className="text-muted" />
            </button>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="text-2xl font-bold">{t('setup.countryTitle')}</h1>
          <p className="mb-4 mt-1 text-muted">{t('setup.countryText')}</p>
          <SearchBox q={q} setQ={setQ} ph={t('setup.searchCountry')} />
          <div className="mt-2 space-y-1.5">
            {countries.map((c) => <Option key={c.code} active={s.country === c.code} onClick={() => pickCountry(c.code)} title={c.name} sub={`${c.currency} · ${defaultSymbol(c.currency)}`} />)}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="text-2xl font-bold">{t('setup.currencyTitle')}</h1>
          <p className="mb-4 mt-1 text-muted">{t('setup.currencyText')}</p>
          <div className="mb-4 m-card p-4 text-center ">
            <div className="text-xs text-muted">{t('setup.preview')}</div>
            <div className="text-3xl font-bold tabular">{formatMoney(1234567.5, s.baseCurrency, s)}</div>
          </div>
          <div className="mb-3 space-y-3">
            <Segmented<Grouping> value={s.grouping} onChange={(v) => patch({ grouping: v })} options={[{ value: 'western', label: '1,234,567' }, { value: 'indian', label: '12,34,567' }, { value: 'none', label: '1234567' }]} />
            <Segmented<DigitStyle> value={s.digitStyle} onChange={(v) => patch({ digitStyle: v })} options={[{ value: 'latn', label: '123' }, { value: 'beng', label: '১২৩' }, { value: 'arab', label: '١٢٣' }, { value: 'deva', label: '१२३' }]} />
          </div>
          <SearchBox q={q} setQ={setQ} ph={t('currency.search')} />
          <div className="mt-2 space-y-1.5">
            {currencies.slice(0, q ? 400 : 60).map((c) => <Option key={c} active={s.baseCurrency === c} onClick={() => patch({ baseCurrency: c })} title={`${c} · ${defaultSymbol(c)}`} sub={currencyName(c, i18n.language)} />)}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="text-2xl font-bold">{t('setup.makeItYours')}</h1>
          <div className="mb-5 mt-4 space-y-4">
            <label className="block">
              <span className="m-label mb-1.5 block">{t('profile.name')}</span>
              <Input value={s.profile.name} onChange={(e) => patch({ profile: { ...s.profile, name: e.target.value } })} placeholder={t('profile.namePh')} maxLength={40} />
            </label>
            <div>
              <span className="m-label mb-1.5 block">{t('style.title')}</span>
              <div className="grid grid-cols-3 gap-2.5">
                {STYLES.map((st) => <StylePreview key={st} style={st} dark={isDark(s.theme)} active={s.style === st} onClick={() => pickStyle(st)} />)}
              </div>
            </div>
          </div>
          <h2 className="text-lg font-bold">{t('setup.startTitle')}</h2>
          <p className="mb-3 mt-0.5 text-sm text-muted">{t('setup.startText')}</p>
          <div className="space-y-2">
            {Object.keys(CATEGORY_SETS).map((k) => (
              <Option key={k} active={preset === k} onClick={() => setPreset(k)} title={t(`preset.${k}`)} sub={CATEGORY_SETS[k].expense.slice(0, 5).map((x) => t(`cat.${x.key}`)).join(', ') + '…'} />
            ))}
          </div>
          <div className="mt-4 m-card px-4 py-2 ">
            <Toggle checked={demo} onChange={setDemo} label={t('setup.demo')} desc={t('setup.demoDesc')} />
          </div>
        </>
      )}

      </div>

      <div className="sticky bottom-0 mt-auto pt-4">
        {step < 3 ? <Button size="lg" block onClick={next}>{t('common.continue')}</Button> : <Button size="lg" block disabled={busy} onClick={finish}>{t('setup.finish')}</Button>}
      </div>
    </div>
  );
}

function Option({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button onClick={onClick} className={cx('m-card flex w-full items-center gap-3 px-4 py-3 text-start transition active:scale-[.98]', active && '!border-brand ring-2 ring-brand/30')}>
      <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span>{sub && <span className="block truncate text-xs text-muted">{sub}</span>}</span>
      {active && <Check className="text-brand animate-pop" size={20} />}
    </button>
  );
}

function SearchBox({ q, setQ, ph }: { q: string; setQ: (v: string) => void; ph: string }) {
  return (
    <div className="relative">
      <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ph} className="ps-10" />
    </div>
  );
}
