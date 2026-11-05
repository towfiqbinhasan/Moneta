import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Cloud, Eye, EyeOff, Globe2, KeyRound, Loader2, Lock, Mail, ShieldCheck, Sparkles, UserRound, WifiOff } from 'lucide-react';
import { BrandBanner, BrandMark, CoBrand, MadeBy, OrbitLogo } from '@/components/Brand';
import { Aurora, haptic } from '@/components/motion';
import { Segmented } from '@/components/ui';
import { cx } from '@/lib/utils';
import {
  authProviders, resendConfirmation, sendPasswordReset, signInWithGoogle, signInWithPassword, signUp, syncEnabled, updatePassword, useSync,
} from '@/lib/sync';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

/**
 * Sign in / create account / reset password — backed by Supabase Auth.
 * Desktop: split screen with an animated brand panel. Phone: logo on top, card below.
 * Always offers "Continue without an account" (the app is fully usable offline).
 */
export function AuthScreen({ onDone, onSkip, initialMode }: { onDone: () => void; onSkip?: () => void; initialMode?: Mode }) {
  const { t } = useTranslation();
  const sync = useSync();
  const [mode, setMode] = useState<Mode>(initialMode ?? (sync.recovery ? 'reset' : 'signin'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errKey, setErrKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [google, setGoogle] = useState(false);
  useEffect(() => { authProviders().then((p) => setGoogle(p.google)); }, []);

  useEffect(() => { if (sync.recovery) setMode('reset'); }, [sync.recovery]);
  // Signed in (password, OAuth redirect, or confirmed e-mail) → continue.
  useEffect(() => { if (sync.user && mode !== 'reset' && !notice) onDone(); }, [sync.user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e: unknown) => {
    const msg = (e as Error).message || '';
    const notConfirmed = /not confirmed/i.test(msg) || (e as { code?: string }).code === 'email_not_confirmed';
    setUnconfirmed(notConfirmed);
    // Friendly, translated messages for the common Supabase/network errors.
    setError(
      /fetch|network|load failed/i.test(msg) ? t('auth.network')
        : /invalid login credentials/i.test(msg) ? t('auth.badCredentials')
        : /already registered|already exists/i.test(msg) ? t('auth.exists')
        : notConfirmed ? t('auth.notConfirmed')
        : /rate limit|too many/i.test(msg) ? t('auth.rateLimit')
        : /provider is not enabled|unsupported provider/i.test(msg) ? t('auth.googleOff')
        : msg || t('auth.failed'),
    );
    setErrKey((k) => k + 1);
    haptic([20, 40, 20]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signin') await signInWithPassword(email, pw);
      else if (mode === 'signup') {
        const needsConfirm = await signUp(email, pw, name);
        if (needsConfirm) setNotice(t('auth.confirmEmail', { email }));
      } else if (mode === 'forgot') {
        await sendPasswordReset(email);
        setNotice(t('auth.resetSent', { email }));
      } else {
        await updatePassword(pw);
        setNotice(t('auth.passwordUpdated'));
        setTimeout(onDone, 1200);
      }
    } catch (err) { fail(err); }
    setBusy(false);
  };

  const strength = pwStrength(pw);
  const valid = mode === 'forgot' ? /\S+@\S+\.\S+/.test(email)
    : mode === 'reset' ? pw.length >= 8
    : /\S+@\S+\.\S+/.test(email) && pw.length >= (mode === 'signup' ? 8 : 6) && (mode !== 'signup' || name.trim().length > 0);

  return (
    <div className="relative grid min-h-[100dvh] lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      {/* Form side */}
      <div className="relative flex flex-col items-center justify-center px-5 py-10">
        <Aurora />
        <div className="mb-7 flex flex-col items-center lg:hidden">
          <BrandBanner className="w-72" animated />
        </div>

        <div className="glow-border w-full max-w-md rounded-[28px] animate-rise">
          <div className="m-card !rounded-[27px] p-6 sm:p-8">
            {!syncEnabled ? (
              <NotConfigured onSkip={onSkip} />
            ) : notice ? (
              <div className="py-6 text-center animate-rise">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-500 animate-pop"><CheckCircle2 size={34} /></div>
                <p className="text-sm">{notice}</p>
                <button className="m-btn m-btn-soft mt-5 h-11 px-5 text-sm" onClick={() => { setNotice(''); setMode('signin'); }}>{t('auth.backToSignIn')}</button>
              </div>
            ) : (
              <>
                <div className="mb-5">
                  <h1 className="text-2xl font-extrabold tracking-tight">
                    {mode === 'signup' ? t('auth.createTitle') : mode === 'forgot' ? t('auth.forgotTitle') : mode === 'reset' ? t('auth.resetTitle') : t('auth.welcomeBack')}
                  </h1>
                  <p className="mt-1 text-sm text-muted">
                    {mode === 'signup' ? t('auth.createText') : mode === 'forgot' ? t('auth.forgotText') : mode === 'reset' ? t('auth.resetText') : t('auth.signInText')}
                  </p>
                </div>

                {(mode === 'signin' || mode === 'signup') && (
                  <Segmented className="mb-5" value={mode} onChange={(m) => { setMode(m); setError(''); }} options={[{ value: 'signin', label: t('auth.signIn') }, { value: 'signup', label: t('auth.signUp') }]} />
                )}

                <form onSubmit={submit} className="space-y-3.5">
                  {mode === 'signup' && (
                    <AuthInput icon={<UserRound size={18} />} value={name} onChange={setName} placeholder={t('profile.name')} autoComplete="name" />
                  )}
                  {mode !== 'reset' && (
                    <AuthInput icon={<Mail size={18} />} type="email" value={email} onChange={setEmail} placeholder="email@example.com" autoComplete="email" />
                  )}
                  {mode !== 'forgot' && (
                    <AuthInput
                      icon={<Lock size={18} />} type={show ? 'text' : 'password'} value={pw} onChange={setPw}
                      placeholder={mode === 'signin' ? t('auth.password') : t('auth.newPassword')}
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      trailing={<button type="button" onClick={() => setShow(!show)} aria-label={t('auth.showPassword')} className="text-muted transition hover:text-ink">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
                    />
                  )}
                  {(mode === 'signup' || mode === 'reset') && pw && (
                    <div className="animate-fade-in">
                      <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className="h-1.5 flex-1 rounded-full bg-ink/10 transition-colors duration-300" style={i < strength.score ? { backgroundColor: strength.color } : undefined} />)}</div>
                      <p className="mt-1 text-[11px] text-muted">{t(`auth.strength.${strength.label}`)} · {t('auth.pwRule')}</p>
                    </div>
                  )}
                  {mode === 'signin' && (
                    <div className="flex justify-end">
                      <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => { setMode('forgot'); setError(''); }}>{t('auth.forgot')}</button>
                    </div>
                  )}

                  {error && (
                    <div key={errKey} role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 animate-shake dark:text-red-400">
                      {error}
                      {unconfirmed && (
                        <button
                          type="button"
                          className="mt-1.5 flex items-center gap-1.5 font-semibold text-brand hover:underline"
                          onClick={async () => {
                            try { await resendConfirmation(email); setError(''); setUnconfirmed(false); setNotice(t('auth.confirmResent', { email })); } catch (err) { fail(err); }
                          }}
                        >
                          <Mail size={14} /> {t('auth.resendConfirm')}
                        </button>
                      )}
                    </div>
                  )}

                  <button type="submit" disabled={!valid || busy} className="m-btn m-btn-primary group h-12 w-full text-[15px]">
                    {busy ? <Loader2 size={18} className="animate-spin" /> : (
                      <>
                        {mode === 'signin' ? t('auth.signIn') : mode === 'signup' ? t('auth.signUp') : mode === 'forgot' ? t('auth.sendLink') : t('auth.savePassword')}
                        <ArrowRight size={18} className="transition-transform group-hover:translate-x-1 rtl:rotate-180" />
                      </>
                    )}
                  </button>
                </form>

                {google && (mode === 'signin' || mode === 'signup') && (
                  <>
                    <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{t('auth.or')}<span className="h-px flex-1 bg-line" /></div>
                    <button onClick={() => signInWithGoogle().catch(fail)} className="m-btn m-btn-ghost h-12 w-full border border-line text-[15px]">
                      <GoogleIcon /> {t('auth.google')}
                    </button>
                  </>
                )}
                {mode === 'forgot' && (
                  <button className="mt-4 w-full text-center text-sm font-semibold text-brand hover:underline" onClick={() => setMode('signin')}>{t('auth.backToSignIn')}</button>
                )}
              </>
            )}
          </div>
        </div>

        {onSkip && syncEnabled && (
          <button onClick={onSkip} className="group mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-ink">
            <WifiOff size={15} /> {t('auth.skip')} <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
          </button>
        )}
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted"><ShieldCheck size={13} /> {t('auth.privacy')}</p>
        {/* Moneta × TH Team — who built this */}
        <MadeBy coBrand animated delay={0.5} className="m-tile mt-6 rounded-2xl px-4 py-3 lg:hidden" />
      </div>
    </div>
  );
}

/** Left panel on desktop: animated brand story. */
function BrandPanel() {
  const { t } = useTranslation();
  const features = [
    { icon: Globe2, title: t('auth.f1'), text: t('auth.f1Text') },
    { icon: Cloud, title: t('auth.f2'), text: t('auth.f2Text') },
    { icon: ShieldCheck, title: t('auth.f3'), text: t('auth.f3Text') },
  ];
  return (
    <aside className="splash relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="aurora !opacity-100"><span /><span /><span /></div>
      <div className="splash-stars" aria-hidden />
      <div className="relative flex items-center justify-between gap-6">
        <BrandBanner variant="dark" className="w-80" animated />
        <CoBrand size={48} dark animated className="shrink-0" />
      </div>

      <div className="relative">
        <div className="relative mx-auto mb-10 h-64 w-full max-w-md">
          <div className="absolute inset-0 grid place-items-center"><OrbitLogo size={150} /></div>
          {/* floating preview cards */}
          <FloatCard className="left-0 top-2" delay={0}><Sparkles size={14} className="text-amber-300" /> {t('auth.cardBudget')}</FloatCard>
          <FloatCard className="right-0 top-16" delay={1.2}><span className="font-bold text-emerald-300">+৳12,500</span> {t('tx.income')}</FloatCard>
          <FloatCard className="bottom-0 left-10" delay={2.1}><span className="font-bold">€ $ ৳ ₹ kr</span> {t('auth.cardCurrencies')}</FloatCard>
        </div>
        <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white">{t('auth.heroTitle')}</h2>
        <p className="mt-2 max-w-md text-white/70">{t('auth.heroText')}</p>
        <ul className="mt-8 space-y-4">
          {features.map((f, i) => (
            <li key={f.title} className="flex gap-3 animate-rise" style={{ animationDelay: `${600 + i * 120}ms` }}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 backdrop-blur"><f.icon size={19} /></span>
              <span><b className="block text-sm text-white">{f.title}</b><span className="text-sm text-white/60">{f.text}</span></span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative flex items-center justify-between gap-4">
        <MadeBy dark animated delay={0.9} />
        <p className="text-xs text-white/40">© {new Date().getFullYear()} Moneta</p>
      </div>
    </aside>
  );
}

function FloatCard({ children, className, delay }: { children: ReactNode; className: string; delay: number }) {
  return (
    <div className={cx('absolute flex items-center gap-1.5 rounded-2xl bg-white/10 px-3 py-2 text-xs text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md animate-float', className)} style={{ animationDelay: `${delay}s`, animationDuration: '4.5s' }}>
      {children}
    </div>
  );
}

function AuthInput({ icon, trailing, onChange, ...p }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { icon: ReactNode; trailing?: ReactNode; onChange: (v: string) => void }) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted">{icon}</span>
      <input {...p} onChange={(e) => onChange(e.target.value)} className="m-input !h-12 !ps-11 !pe-11" />
      {trailing && <span className="absolute end-4 top-1/2 -translate-y-1/2">{trailing}</span>}
    </label>
  );
}

function NotConfigured({ onSkip }: { onSkip?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="text-center">
      <BrandMark size={64} float className="mx-auto mb-4" />
      <h1 className="text-xl font-extrabold">{t('auth.notConfiguredTitle')}</h1>
      <p className="mt-2 text-sm text-muted">{t('auth.notConfiguredText')}</p>
      <ol className="m-tile mt-4 space-y-1.5 p-4 text-start text-xs text-muted">
        <li>1. supabase.com → New project</li>
        <li>2. SQL editor → <code>supabase/schema.sql</code></li>
        <li>3. <code>.env</code> → VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY</li>
        <li>4. <code>npm run dev</code></li>
      </ol>
      {onSkip && <button className="m-btn m-btn-primary mt-5 h-12 w-full" onClick={onSkip}><KeyRound size={17} />{t('auth.skip')}</button>}
    </div>
  );
}

function pwStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const label = (['weak', 'weak', 'fair', 'good', 'strong'] as const)[score];
  const color = ['#e34948', '#e34948', '#eda100', '#16a34a', '#16a34a'][score];
  return { score: Math.max(1, score), label, color };
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
