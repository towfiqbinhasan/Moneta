import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown, ArrowUp, ChevronRight, Cloud, Database, Eye, EyeOff, Globe, Lock, Palette, RefreshCw, Bell, Coins, LayoutDashboard,
  Moon, Sun, MonitorSmartphone, UserRound,
} from 'lucide-react';
import { STYLES, isDark, themeId } from '@/theme/theme';
import { useData } from '@/hooks/useData';
import { Button, Card, Field, ImagePicker, Input, PageHeader, Segmented, Select, Toggle } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { ColorPicker, CurrencyPicker } from '@/components/pickers';
import { useToast } from '@/components/Toast';
import { patchSettings } from '@/db/repo';
import { COUNTRIES, countryName } from '@/db/defaults';
import type { CurrencyFormat, DigitStyle, Grouping, Settings, ThemeStyle } from '@/db/types';
import { allLanguages } from '@/i18n';
import { DATE_FORMATS, formatDate, formatMoney, parseAmount } from '@/lib/format';
import { defaultDecimals, defaultPosition, defaultSymbol } from '@/lib/currency';
import { fetchRates, perBase, rebaseManualRates, setManualRate } from '@/lib/rates';
import { biometricAvailable, hashPin, registerBiometric } from '@/lib/lock';
import { requestPermission } from '@/lib/notify';
import { backupJSON, exportCSV, restoreJSON, wipeAll } from '@/lib/export';
import { countDemo, removeDemo, seedDemo } from '@/db/demo';
import { AppUpdateButton } from '@/components/AppUpdate';
import { syncEnabled, syncNowManual, useSync } from '@/lib/sync';
import { AccountCard } from '@/components/Account';
import { BrandBanner, MadeBy } from '@/components/Brand';
import { useImport } from '../AppShell';
import { cx } from '@/lib/utils';

function Section({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="m-label mb-2 mt-7 flex items-center gap-2 px-1">{icon}{title}</h2>
      <Card className="space-y-4 animate-rise">{children}</Card>
    </section>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [hash]);
  return (
    <div>
      <PageHeader back title={t('nav.settings')} />
      <ProfileSection />
      <LanguageSection />
      <CurrencySection />
      <RatesSection />
      <AppearanceSection />
      <WidgetsSection />
      <SecuritySection />
      <RemindersSection />
      <DataSection />
      <SyncSection />
      <AboutSection />
    </div>
  );
}

/* --------------------------- Language & region --------------------------- */

function LanguageSection() {
  const { t, i18n } = useTranslation();
  const { settings: s, languages } = useData();
  const set = (p: Partial<Settings>) => patchSettings(p);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => formatDate(new Date(2023, 0, 1 + i), { ...s, digitStyle: 'latn' }, 'EEEE')), [s.language]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section id="language" icon={<Globe size={16} />} title={t('settings.language')}>
      <Field label={t('settings.appLanguage')}>
        <Select value={s.language} onChange={(e) => set({ language: e.target.value })}>
          {allLanguages(languages).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </Select>
      </Field>
      <Link to="/settings/languages" className="flex items-center justify-between rounded-2xl bg-brand/5 px-4 py-3 text-sm font-medium text-brand">
        {t('lang.editorLink')} <ChevronRight size={18} className="rtl:rotate-180" />
      </Link>
      <Field label={t('settings.country')}>
        <Select value={s.country} onChange={(e) => set({ country: e.target.value })}>
          {COUNTRIES.map((c) => ({ ...c, name: countryName(c.code, i18n.language) })).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label={t('settings.dateFormat')}>
        <Select value={s.dateFormat} onChange={(e) => set({ dateFormat: e.target.value })}>
          {DATE_FORMATS.map((f) => <option key={f} value={f}>{formatDate(new Date(), s, f)}  ({f})</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('settings.weekStart')}>
          <Select value={s.weekStartsOn} onChange={(e) => set({ weekStartsOn: +e.target.value as Settings['weekStartsOn'] })}>
            {weekdays.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </Select>
        </Field>
        <Field label={t('settings.monthStart')} hint={t('settings.monthStartHint')}>
          <Select value={s.monthStartDay} onChange={(e) => set({ monthStartDay: +e.target.value })}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t('settings.digits')}>
        <Segmented<DigitStyle> value={s.digitStyle} onChange={(v) => set({ digitStyle: v })} options={[{ value: 'latn', label: '123' }, { value: 'beng', label: '১২৩' }, { value: 'arab', label: '١٢٣' }, { value: 'deva', label: '१२३' }]} />
      </Field>
    </Section>
  );
}

/* --------------------------- Currency & number format --------------------------- */

function CurrencySection() {
  const { t } = useTranslation();
  const { settings: s, transactions, accounts } = useData();
  const [fmtFor, setFmtFor] = useState<string | null>(null);
  const used = useMemo(() => [...new Set([s.baseCurrency, ...accounts.map((a) => a.currency), ...transactions.map((x) => x.currency)])], [s.baseCurrency, accounts, transactions]);

  const changeBase = async (c: string) => {
    if (c === s.baseCurrency) return;
    await rebaseManualRates(s.baseCurrency, c);
    await patchSettings({ baseCurrency: c });
  };

  return (
    <Section id="currency" icon={<Coins size={16} />} title={t('settings.currency')}>
      <Field label={t('settings.baseCurrency')} hint={t('settings.baseHint')}>
        <CurrencyPicker value={s.baseCurrency} onChange={changeBase} />
      </Field>
      <div className="rounded-2xl bg-ink/[.03] p-3 text-center">
        <div className="text-xs text-muted">{t('setup.preview')}</div>
        <div className="text-2xl font-bold tabular">{formatMoney(1234567.891, s.baseCurrency, s)}</div>
      </div>
      <Field label={t('settings.grouping')}>
        <Segmented<Grouping> value={s.grouping} onChange={(v) => patchSettings({ grouping: v })} options={[{ value: 'western', label: '1,234,567' }, { value: 'indian', label: '12,34,567' }, { value: 'none', label: '1234567' }]} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('settings.decimalSep')}>
          <Select value={s.decimalSep} onChange={(e) => patchSettings({ decimalSep: e.target.value, groupSep: e.target.value === s.groupSep ? (e.target.value === '.' ? ',' : '.') : s.groupSep })}>
            <option value=".">. (1.50)</option><option value=",">, (1,50)</option>
          </Select>
        </Field>
        <Field label={t('settings.groupSep')}>
          <Select value={s.groupSep} onChange={(e) => patchSettings({ groupSep: e.target.value })}>
            <option value=",">, (1,000)</option><option value=".">. (1.000)</option><option value={' '}>␣ (1 000)</option><option value="’">’ (1’000)</option><option value="">— (1000)</option>
          </Select>
        </Field>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted">{t('settings.currencyFormats')}</div>
        <div className="flex flex-wrap gap-2">
          {used.map((c) => (
            <button key={c} onClick={() => setFmtFor(c)} className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-ink/5">
              <span className="font-semibold">{c}</span> <span className="text-muted">{formatMoney(1234.5, c, s)}</span>
            </button>
          ))}
          <CurrencyPickerButton onPick={setFmtFor} />
        </div>
      </div>
      {fmtFor && <CurrencyFormatSheet code={fmtFor} onClose={() => setFmtFor(null)} />}
    </Section>
  );
}

function CurrencyPickerButton({ onPick }: { onPick: (c: string) => void }) {
  const [v, setV] = useState('EUR');
  return <CurrencyPicker compact value={v} onChange={(c) => { setV(c); onPick(c); }} />;
}

function CurrencyFormatSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { settings: s } = useData();
  const cur = s.currencyFormats[code] ?? {};
  const [f, setF] = useState<CurrencyFormat>({ symbol: cur.symbol ?? defaultSymbol(code), position: cur.position ?? defaultPosition(code), decimals: cur.decimals ?? defaultDecimals(code), space: cur.space });
  const preview = formatMoney(1234567.891, code, { ...s, currencyFormats: { ...s.currencyFormats, [code]: f } });
  const saveIt = async () => { await patchSettings({ currencyFormats: { ...s.currencyFormats, [code]: f } }); onClose(); };
  const reset = async () => { const next = { ...s.currencyFormats }; delete next[code]; await patchSettings({ currencyFormats: next }); onClose(); };
  return (
    <Sheet open onClose={onClose} title={`${t('settings.formatFor')} ${code}`} footer={<div className="flex gap-2"><Button variant="ghost" onClick={reset}>{t('common.reset')}</Button><Button block onClick={saveIt}>{t('common.save')}</Button></div>}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-ink/[.03] p-3 text-center text-2xl font-bold tabular">{preview}</div>
        <Field label={t('settings.symbol')}><Input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} /></Field>
        <Field label={t('settings.symbolPos')}>
          <Segmented value={f.position!} onChange={(v) => setF({ ...f, position: v })} options={[{ value: 'before', label: `${f.symbol}100` }, { value: 'after', label: `100${f.symbol}` }]} />
        </Field>
        <Field label={t('settings.decimals')}>
          <Segmented value={String(f.decimals)} onChange={(v) => setF({ ...f, decimals: +v })} options={['0', '1', '2', '3'].map((d) => ({ value: d, label: d }))} />
        </Field>
        <Toggle checked={f.space ?? (f.position === 'after' || (f.symbol?.length ?? 0) > 1)} onChange={(v) => setF({ ...f, space: v })} label={t('settings.symbolSpace')} />
      </div>
    </Sheet>
  );
}

/* --------------------------- Exchange rates --------------------------- */

function RatesSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings: s, rates, accounts, transactions, trips, goals, date, num } = useData();
  const [busy, setBusy] = useState(false);
  const used = useMemo(() => [...new Set([...accounts.map((a) => a.currency), ...transactions.map((x) => x.currency), ...trips.map((x) => x.currency), ...goals.map((g) => g.currency)])].filter((c) => c !== s.baseCurrency).sort(), [accounts, transactions, trips, goals, s.baseCurrency]);
  const [extra, setExtra] = useState<string[]>([]);
  const list = [...new Set([...used, ...extra])];

  const refresh = async () => {
    setBusy(true);
    const ok = await fetchRates(true);
    setBusy(false);
    toast(ok ? t('rates.updated') : t('rates.offline'), undefined, ok ? 'ok' : 'warn');
  };

  return (
    <Section id="rates" icon={<RefreshCw size={16} />} title={t('settings.rates')}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted">{s.ratesFetchedAt ? t('rates.lastUpdate', { date: date(new Date(s.ratesFetchedAt).toISOString(), s.dateFormat + ' HH:mm') }) : t('rates.never')}<br />{t('rates.source')}</div>
        <Button variant="soft" size="sm" onClick={refresh} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />{t('rates.refresh')}</Button>
      </div>
      <p className="text-xs text-muted">{t('rates.manualHint', { base: s.baseCurrency })}</p>
      <div className="divide-y divide-line">
        {list.map((c) => <RateRow key={c} code={c} live={rates.get(c)?.perUsd && rates.get(s.baseCurrency)?.perUsd ? rates.get(s.baseCurrency)!.perUsd! / rates.get(c)!.perUsd! : undefined} manual={rates.get(c)?.manualPerBase} effective={perBase(c, s.baseCurrency, rates)} num={num} base={s.baseCurrency} />)}
      </div>
      <CurrencyPickerButton onPick={(c) => setExtra([...extra, c])} />
    </Section>
  );
}

function RateRow({ code, live, manual, effective, base, num }: { code: string; live?: number; manual?: number; effective?: number; base: string; num: (v: number, d?: number) => string }) {
  const { t } = useTranslation();
  const [v, setV] = useState(manual ? String(manual) : '');
  const dec = (x: number) => (x >= 100 ? 2 : x >= 1 ? 4 : 6);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="w-28 shrink-0">
        <div className="text-sm font-semibold">1 {code}</div>
        <div className="text-[11px] text-muted">{effective ? `= ${num(effective, dec(effective))} ${base}` : t('rates.unknown')}</div>
      </div>
      <Input inputMode="decimal" value={v} placeholder={live ? num(live, dec(live)) : t('rates.manual')} onChange={(e) => setV(e.target.value)} onBlur={() => setManualRate(code, parseAmount(v) || undefined)} className={cx('h-10 text-sm', !!manual && 'border-amber-500')} />
      {manual && <span className="text-[10px] font-semibold uppercase text-amber-600">{t('rates.manualTag')}</span>}
    </div>
  );
}

/* --------------------------- Appearance --------------------------- */

function AppearanceSection() {
  const { t } = useTranslation();
  const { settings: s } = useData();
  const dark = isDark(s.theme);
  return (
    <Section id="appearance" icon={<Palette size={16} />} title={t('settings.appearance')}>
      <Field label={t('style.title')}>
        <div className="grid grid-cols-3 gap-2.5">
          {STYLES.map((st) => (
            <StylePreview key={st} style={st} dark={dark} active={s.style === st} onClick={() => patchSettings({ style: st })} />
          ))}
        </div>
      </Field>
      <p className="-mt-1 text-xs text-muted">{t(`style.${s.style}Desc`)}</p>
      <Field label={t('settings.theme')}>
        <Segmented value={s.theme} onChange={(v) => patchSettings({ theme: v })} options={[{ value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun size={14} />{t('settings.light')}</span> }, { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon size={14} />{t('settings.dark')}</span> }, { value: 'system', label: <span className="inline-flex items-center gap-1.5"><MonitorSmartphone size={14} />{t('settings.system')}</span> }]} />
      </Field>
      <Field label={t('settings.accent')}><ColorPicker value={s.accent} onChange={(c) => patchSettings({ accent: c })} /></Field>
    </Section>
  );
}

/**
 * A miniature of the app rendered under its own data-theme, so the tokens in
 * index.css apply to just this box — a true live preview of each style.
 */
export function StylePreview({ style, dark, active, onClick }: { style: ThemeStyle; dark: boolean; active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button onClick={onClick} className={cx('group relative overflow-hidden rounded-2xl p-0.5 text-start transition', active ? 'bg-brand' : 'bg-transparent hover:bg-ink/10')}>
      <div data-theme={themeId(style, dark)} className="relative overflow-hidden rounded-[14px] bg-surface p-2" style={{ fontFamily: 'var(--font-app)' }}>
        {style === 'morphism' && <div className="absolute inset-0 opacity-90" style={{ background: 'radial-gradient(circle at 20% 20%, rgb(var(--brand) / .55), transparent 55%), radial-gradient(circle at 90% 80%, rgb(236 72 153 / .45), transparent 55%)' }} />}
        <div className="m-card relative mb-1.5 p-2">
          <div className="text-[8px] font-semibold uppercase tracking-wider text-muted">{t('dash.netWorth')}</div>
          <div className="text-[13px] font-bold text-ink">$4,280</div>
        </div>
        <div className="relative flex gap-1.5">
          <div className="m-card h-6 flex-1" />
          <div className="m-btn m-btn-primary h-6 w-6 !p-0 text-[10px]">+</div>
        </div>
      </div>
      <div className={cx('px-1.5 py-1 text-center text-[11px] font-semibold', active ? 'text-white' : 'text-ink')}>{t(`style.${style}`)}</div>
    </button>
  );
}

/* --------------------------- Profile --------------------------- */

function ProfileSection() {
  const { t } = useTranslation();
  const { settings: s } = useData();
  const [name, setName] = useState(s.profile.name);
  return (
    <Section id="profile" icon={<UserRound size={16} />} title={t('profile.title')}>
      <div className="flex items-center gap-4">
        <ImagePicker value={s.profile.avatar} onChange={(v) => patchSettings({ profile: { ...s.profile, avatar: v } })} maxSide={400} round />
        <div className="min-w-0 flex-1">
          <Field label={t('profile.name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== s.profile.name && patchSettings({ profile: { ...s.profile, name: name.trim() } })} placeholder={t('profile.namePh')} maxLength={40} />
          </Field>
        </div>
      </div>
    </Section>
  );
}

/* --------------------------- Dashboard widgets --------------------------- */

function WidgetsSection() {
  const { t } = useTranslation();
  const { settings: s } = useData();
  const ws = s.widgets;
  const move = (i: number, d: -1 | 1) => {
    const next = [...ws];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    patchSettings({ widgets: next });
  };
  return (
    <Section id="widgets" icon={<LayoutDashboard size={16} />} title={t('settings.widgets')}>
      <div className="-my-2 divide-y divide-line">
        {ws.map((w, i) => (
          <div key={w.id} className="flex items-center gap-2 py-2">
            <button onClick={() => patchSettings({ widgets: ws.map((x) => (x.id === w.id ? { ...x, visible: !x.visible } : x)) })} className={cx('grid h-9 w-9 place-items-center rounded-xl', w.visible ? 'bg-brand/10 text-brand' : 'bg-ink/5 text-muted')} aria-label="toggle">
              {w.visible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <span className={cx('flex-1 text-sm', !w.visible && 'text-muted line-through')}>{t(`widget.${w.id}`)}</span>
            <button disabled={i === 0} onClick={() => move(i, -1)} className="p-1.5 text-muted disabled:opacity-20" aria-label="up"><ArrowUp size={16} /></button>
            <button disabled={i === ws.length - 1} onClick={() => move(i, 1)} className="p-1.5 text-muted disabled:opacity-20" aria-label="down"><ArrowDown size={16} /></button>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------- Security --------------------------- */

function SecuritySection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings: s } = useData();
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [bioOk, setBioOk] = useState(false);
  useEffect(() => { biometricAvailable().then(setBioOk); }, []);

  const savePin = async () => {
    if (!/^\d{4,6}$/.test(pin) || pin !== pin2) return;
    const { hash, salt } = await hashPin(pin);
    await patchSettings({ lock: { ...s.lock, enabled: true, pinHash: hash, salt, pinLength: pin.length } });
    setPinOpen(false); setPin(''); setPin2('');
    toast(t('lock.pinSet'));
  };

  return (
    <Section id="security" icon={<Lock size={16} />} title={t('settings.security')}>
      <Toggle checked={s.lock.enabled} onChange={(v) => (v ? setPinOpen(true) : patchSettings({ lock: { enabled: false } }))} label={t('lock.enable')} desc={t('lock.desc')} />
      {s.lock.enabled && <Button variant="soft" size="sm" onClick={() => setPinOpen(true)}>{t('lock.change')}</Button>}
      {s.lock.enabled && bioOk && (
        <Toggle checked={!!s.lock.biometricId} onChange={async (v) => {
          if (!v) return patchSettings({ lock: { ...s.lock, biometricId: undefined } });
          const id = await registerBiometric();
          if (id) patchSettings({ lock: { ...s.lock, biometricId: id } });
          else toast(t('lock.bioFailed'), undefined, 'warn');
        }} label={t('lock.biometric')} />
      )}
      <Sheet open={pinOpen} onClose={() => setPinOpen(false)} title={t('lock.setPin')} footer={<Button block disabled={!/^\d{4,6}$/.test(pin) || pin !== pin2} onClick={savePin}>{t('common.save')}</Button>}>
        <div className="space-y-3">
          <Field label={t('lock.newPin')}><Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus /></Field>
          <Field label={t('lock.confirmPin')} hint={pin2 && pin !== pin2 ? t('lock.mismatch') : undefined}><Input type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} /></Field>
        </div>
      </Sheet>
    </Section>
  );
}

/* --------------------------- Reminders --------------------------- */

function RemindersSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings: s } = useData();
  return (
    <Section id="reminders" icon={<Bell size={16} />} title={t('settings.reminders')}>
      <Toggle checked={s.dailyReminder.enabled} onChange={async (v) => {
        if (v && !(await requestPermission())) toast(t('reminder.denied'), undefined, 'warn');
        patchSettings({ dailyReminder: { ...s.dailyReminder, enabled: v } });
      }} label={t('reminder.daily')} desc={t('reminder.desc')} />
      {s.dailyReminder.enabled && (
        <Field label={t('reminder.time')}><Input type="time" value={s.dailyReminder.time} onChange={(e) => e.target.value && patchSettings({ dailyReminder: { ...s.dailyReminder, time: e.target.value } })} /></Field>
      )}
      <p className="text-xs text-muted">{t('reminder.limit')}</p>
    </Section>
  );
}

/* --------------------------- Data --------------------------- */

function DataSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { transactions, settings, accounts, categories } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const startImport = useImport();
  return (
    <Section id="data" icon={<Database size={16} />} title={t('settings.data')}>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={backupJSON}>{t('data.backup')}</Button>
        <Button variant="soft" onClick={() => fileRef.current?.click()}>{t('data.restore')}</Button>
        <Button variant="soft" onClick={() => exportCSV(transactions, { settings, accounts, categories, t })}>{t('data.exportAll')}</Button>
        <Button variant="soft" onClick={startImport}>{t('import.title')}</Button>
        <Button variant="soft" onClick={async () => { await seedDemo(settings.baseCurrency, t); toast(t('data.demoLoaded')); }}>{t('data.loadDemo')}</Button>
        <Button variant="soft" onClick={async () => {
          const n = await countDemo();
          if (!n) { toast(t('data.noDemo')); return; }
          if (!confirm(t('data.removeDemoConfirm', { count: n }))) return;
          const removed = await removeDemo();
          toast(t('data.demoRemoved', { count: removed }));
        }}>{t('data.removeDemo')}</Button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = ''; // so picking the same file again (after cancelling) still fires onChange
        if (!f || !confirm(t('data.restoreConfirm'))) return;
        try { await restoreJSON(f); toast(t('data.restored')); } catch (err) { toast(String((err as Error).message), undefined, 'warn'); }
      }} />
      <Button variant="danger" block onClick={() => { if (confirm(t('data.resetConfirm')) && prompt(t('data.resetType')) === 'DELETE') wipeAll(); }}>{t('data.reset')}</Button>
    </Section>
  );
}

/* --------------------------- Cloud sync --------------------------- */

function SyncSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const sync = useSync();
  const { settings, date } = useData();
  return (
    <Section id="sync" icon={<Cloud size={16} />} title={t('settings.sync')}>
      {!syncEnabled ? (
        <p className="text-sm text-muted">{t('sync.notConfigured')}</p>
      ) : (
        <>
          <AccountCard />
          {sync.user ? (
            <>
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>{settings.lastSyncAt ? t('sync.last', { date: date(new Date(settings.lastSyncAt), settings.dateFormat + ' HH:mm') }) : t('sync.never')}</span>
                <Button size="sm" variant="soft" disabled={sync.status === 'syncing'} onClick={() => syncNowManual().then(() => toast(t('sync.synced'))).catch((e) => toast(e.message, undefined, 'warn'))}>
                  <RefreshCw size={14} className={sync.status === 'syncing' ? 'animate-spin' : ''} />{t('sync.now')}
                </Button>
              </div>
              <p className="text-xs text-muted">{t('sync.auto')}</p>
              {sync.error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{sync.error}</p>}
            </>
          ) : (
            <p className="text-sm text-muted">{t('sync.intro')}</p>
          )}
        </>
      )}
    </Section>
  );
}

/* --------------------------- About --------------------------- */

function AboutSection() {
  const { t } = useTranslation();
  return (
    <section className="mt-8 flex flex-col items-center text-center">
      <BrandBanner className="w-64 sm:w-80" />
      <p className="mt-2 text-xs text-muted">v1.3 · {t('settings.offlineNote')}</p>
      <AppUpdateButton />
      <MadeBy coBrand className="m-tile mt-5 rounded-2xl px-4 py-3" />
    </section>
  );
}
