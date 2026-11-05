import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/utils';

/**
 * Moneta brand kit.
 *
 * Assets (public/brand, generated from the original logo + banner files):
 *   moneta-mark-{128,256,512}.webp/png – the M + globe + orbit + paper-plane mark (transparent)
 *   moneta-banner-light.webp           – full banner, transparent, navy text (light themes)
 *   moneta-banner-dark.webp            – same banner with white text (dark themes)
 *   moneta-banner(.png/.webp)          – original banner on white (README, social)
 *
 *   th-badge-{128,256}.webp/png        – TH Team logo as a round badge (any background)
 *   th-glow-256.webp/png               – TH Team logo, black made transparent (dark / navy backgrounds)
 *
 * Brand colours (from the mark): cyan #00b8ff → blue #2563ff → violet #8b2cf5 on navy #0b1240.
 */

export const BRAND = { cyan: '#00b8ff', blue: '#2563ff', violet: '#8b2cf5', navy: '#0b1240' };
export const TAGLINE = 'Freelance • Work • Earn • Globally';

/** Who made Moneta — shown on the splash, sign-in, About and More screens. */
export const MAKER = { name: 'MD. Towfiq Bin Hasan', team: 'TH Team' };

const markSrc = (px: number) => (px <= 64 ? '/brand/moneta-mark-128.webp' : px <= 140 ? '/brand/moneta-mark-256.webp' : '/brand/moneta-mark-512.webp');

/**
 * The logo mark with living details:
 *  - soft brand glow that breathes behind it
 *  - a light sheen that sweeps across only the logo's own pixels (CSS mask)
 *  - optional entrance (blur → sharp, scale up) and gentle float
 */
export function BrandMark({ size = 40, animated = false, float = false, className }: { size?: number; animated?: boolean; float?: boolean; className?: string }) {
  const src = markSrc(size);
  return (
    <span className={cx('brand-mark relative inline-block shrink-0', animated && 'brand-enter', float && 'animate-float', className)} style={{ width: size, height: size }}>
      {size >= 32 && <img src={src} alt="" aria-hidden className="brand-glow absolute inset-0 h-full w-full" draggable={false} />}
      <img src={src} alt="Moneta" className="relative h-full w-full select-none object-contain" draggable={false} />
      {size >= 28 && <span aria-hidden className="brand-sheen absolute inset-0" style={{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }} />}
    </span>
  );
}

/** The circled check that replaces the "o" in the wordmark. */
function OCheck({ size }: { size: number }) {
  return (
    <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 40 40" className="inline-block align-[-0.08em]" aria-hidden>
      <defs>
        <linearGradient id="mo-check" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={BRAND.blue} />
          <stop offset="1" stopColor={BRAND.violet} />
        </linearGradient>
      </defs>
      <circle cx="20" cy="21" r="15" fill="none" stroke="currentColor" strokeWidth="6.5" />
      <path d="M12.5 20.5l6 6.5L35 6" fill="none" stroke="url(#mo-check)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="brand-check" />
    </svg>
  );
}

/** "Moneta" wordmark (theme-aware ink colour) with optional tagline. */
export function Wordmark({ size = 22, tagline, animated, className }: { size?: number; tagline?: boolean; animated?: boolean; className?: string }) {
  const letters = ['M', 'o', 'n', 'e', 't', 'a'];
  return (
    <span className={cx('inline-flex flex-col leading-none', className)}>
      <span className="brand-word inline-flex items-baseline font-extrabold tracking-tight text-ink" style={{ fontSize: size }}>
        {letters.map((l, i) => (
          <span key={i} className={cx('inline-block', animated && 'brand-letter')} style={animated ? { animationDelay: `${380 + i * 70}ms` } : undefined}>
            {l === 'o' ? <OCheck size={size} /> : l}
          </span>
        ))}
      </span>
      {tagline && (
        <span className={cx('mt-1.5 whitespace-nowrap font-medium tracking-[.08em] text-muted', animated && 'brand-tagline')} style={{ fontSize: Math.max(9, size * 0.3) }}>
          {TAGLINE.split(' • ').map((w, i, a) => (
            <span key={w}>{w}{i < a.length - 1 && <span className="mx-1.5" style={{ color: BRAND.violet }}>•</span>}</span>
          ))}
        </span>
      )}
    </span>
  );
}

/** Mark + wordmark side by side. */
export function BrandLockup({ size = 36, tagline, animated, className }: { size?: number; tagline?: boolean; animated?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <BrandMark size={size} animated={animated} />
      <Wordmark size={size * 0.62} tagline={tagline} animated={animated} />
    </span>
  );
}

/**
 * The full banner artwork. `auto` swaps to the white-text variant in dark themes
 * (pure CSS, no flash); `light` / `dark` force a variant (e.g. on the deep-navy auth panel).
 */
export function BrandBanner({ className, animated, variant = 'auto' }: { className?: string; animated?: boolean; variant?: 'auto' | 'light' | 'dark' }) {
  const alt = 'Moneta — Freelance · Work · Earn · Globally';
  return (
    <span className={cx('relative block', animated && 'brand-enter', className)}>
      {variant !== 'dark' && <img src="/brand/moneta-banner-light.webp" alt={alt} className={cx('block w-full', variant === 'auto' && 'dark:hidden')} draggable={false} />}
      {variant !== 'light' && <img src="/brand/moneta-banner-dark.webp" alt={alt} className={cx('w-full', variant === 'auto' ? 'hidden dark:block' : 'block')} draggable={false} />}
      <span aria-hidden className="brand-sheen absolute inset-0" style={{ WebkitMaskImage: 'url(/brand/moneta-banner-light.webp)', maskImage: 'url(/brand/moneta-banner-light.webp)', WebkitMaskSize: '100% 100%', maskSize: '100% 100%' }} />
    </span>
  );
}

/**
 * Logo with an animated orbit: an ellipse draws itself around the mark and a
 * glowing comet travels along it (echoing the logo's orbit + paper plane).
 */
export function OrbitLogo({ size = 140 }: { size?: number }) {
  const w = size * 1.7;
  const h = size * 1.25;
  return (
    <span className="relative inline-grid place-items-center" style={{ width: w, height: h }}>
      <svg className="absolute inset-0 overflow-visible" viewBox="0 0 170 125" width={w} height={h} aria-hidden>
        <defs>
          <linearGradient id="orbit-g" x1="0" x2="1">
            <stop offset="0" stopColor={BRAND.cyan} stopOpacity="0" />
            <stop offset=".5" stopColor={BRAND.blue} />
            <stop offset="1" stopColor={BRAND.violet} />
          </linearGradient>
          <radialGradient id="comet-g">
            <stop offset="0" stopColor="#fff" />
            <stop offset=".4" stopColor={BRAND.cyan} />
            <stop offset="1" stopColor={BRAND.violet} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform="rotate(-14 85 62)">
          <ellipse cx="85" cy="62" rx="80" ry="26" fill="none" stroke="url(#orbit-g)" strokeWidth="1.6" className="orbit-draw" />
          <circle r="5" fill="url(#comet-g)">
            <animateMotion dur="3.6s" repeatCount="indefinite" path="M5,62 a80,26 0 1,0 160,0 a80,26 0 1,0 -160,0" />
          </circle>
        </g>
      </svg>
      <BrandMark size={size} animated />
    </span>
  );
}

/**
 * Splash: deep-space brand gradient, aurora, orbiting logo, letter-by-letter
 * wordmark and tagline; fades out when the app is ready.
 */
export function Splash({ leaving }: { leaving?: boolean }) {
  return (
    <div className={cx('splash fixed inset-0 z-[100] grid place-items-center overflow-hidden transition-opacity duration-500', leaving && 'pointer-events-none opacity-0')}>
      <div className="aurora !opacity-100"><span /><span /><span /></div>
      <div className="splash-stars" aria-hidden />
      <div className={cx('relative flex flex-col items-center transition-transform duration-500', leaving && 'scale-110')}>
        <OrbitLogo size={132} />
        <div className="dark mt-2 text-center" style={{ ['--ink' as string]: '240 243 255', ['--muted' as string]: '170 180 220' }}>
          <Wordmark size={44} tagline animated />
        </div>
        <span className="mt-8 h-1 w-40 overflow-hidden rounded-full bg-white/10">
          <span className="splash-bar block h-full w-1/3 rounded-full" />
        </span>
      </div>
      {/* Maker credit rises in after the wordmark */}
      <div className="absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),28px)] flex justify-center">
        <MadeBy dark animated delay={1.1} />
      </div>
    </div>
  );
}

/** Shows the splash at least `minMs` on the first open of a session, then fades it out. */
export function useSplash(ready: boolean, minMs = 2300) {
  const seen = (() => { try { return sessionStorage.getItem('moneta.splash') === '1'; } catch { return false; } })();
  const [minDone, setMinDone] = useState(seen);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (seen) return;
    const id = setTimeout(() => setMinDone(true), minMs);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const show = !(ready && minDone);
  useEffect(() => {
    if (show) return;
    try { sessionStorage.setItem('moneta.splash', '1'); } catch { /* ignore */ }
    const id = setTimeout(() => setGone(true), 520);
    return () => clearTimeout(id);
  }, [show]);
  return { show, leaving: !show && !gone, mounted: !gone };
}

/* ----------------------------- TH Team ----------------------------- */

/**
 * TH Team logo. `glow` uses the version whose black background is transparent
 * (best on dark / navy); otherwise the round badge, which reads on any theme.
 * `animated` = spark entrance + a light ring that keeps orbiting the badge.
 */
export function TeamLogo({ size = 40, glow, animated, delay = 0, className }: { size?: number; glow?: boolean; animated?: boolean; delay?: number; className?: string }) {
  const src = glow ? '/brand/th-glow-256.webp' : size <= 56 ? '/brand/th-badge-128.webp' : '/brand/th-badge-256.webp';
  return (
    <span
      className={cx('th-logo relative inline-grid shrink-0 place-items-center rounded-full', animated && 'th-enter', className)}
      style={{ width: size, height: size, animationDelay: `${delay}s` }}
    >
      {animated && <span className="th-ring" aria-hidden />}
      <img src={src} alt={MAKER.team} width={size} height={size} draggable={false} className="th-img relative h-full w-full rounded-full object-contain" />
    </span>
  );
}

/**
 * Co-brand lockup: Moneta mark and TH Team logo joined by a beam with a
 * travelling spark — "Moneta, made by TH Team".
 */
export function CoBrand({ size = 44, dark, animated, className }: { size?: number; dark?: boolean; animated?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <BrandMark size={size} animated={animated} />
      <span className={cx('co-beam', dark && 'co-beam-dark')} style={{ width: size * 0.9 }} aria-hidden>
        <span className="co-x">×</span>
      </span>
      <TeamLogo size={size * 0.92} glow={dark} animated={animated} delay={animated ? 0.35 : 0} />
    </span>
  );
}

/** "Designed & developed by MD. Towfiq Bin Hasan · TH Team" with the TH logo. */
export function MadeBy({ dark, animated, delay = 0, coBrand, className }: { dark?: boolean; animated?: boolean; delay?: number; coBrand?: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cx('flex items-center gap-3', animated && 'credit-in', className)} style={animated ? { animationDelay: `${delay}s` } : undefined}>
      {coBrand ? <CoBrand size={34} dark={dark} /> : <TeamLogo size={34} glow={dark} animated={animated} delay={delay + 0.15} />}
      <div className="text-start leading-tight">
        <div className={cx('text-[10px] font-semibold uppercase tracking-[0.14em]', dark ? 'text-white/55' : 'text-muted')}>
          {t('brand.craftedBy', { defaultValue: 'Designed & developed by' })}
        </div>
        <div className={cx('text-[13px] font-bold', dark ? 'text-white' : 'text-ink')}>{MAKER.name}</div>
        <div className="text-brand-grad text-[11px] font-extrabold tracking-wide">{MAKER.team}</div>
      </div>
    </div>
  );
}
