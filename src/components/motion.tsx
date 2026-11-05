import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isNative, nativeHaptic } from '@/lib/native';

/** Motion & feel helpers: count-up numbers, haptics, aurora, stagger, success check. */

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Light haptic tick on supported phones (Android Chrome). */
export const haptic = (ms: number | number[] = 8) => {
  if (reduced()) return;
  if (isNative) return nativeHaptic(Array.isArray(ms) ? Math.max(...ms) : ms);
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
};

/** Animates from the previous value to `value` with ease-out-cubic. */
export function useCountUp(value: number, duration = 750) {
  const [v, setV] = useState(reduced() ? value : 0);
  const from = useRef(reduced() ? value : 0);
  useEffect(() => {
    if (reduced()) { setV(value); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setV(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, duration]);
  return v;
}

/** Renders a number that counts up, formatted by `format`. */
export function CountUp({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{format(v)}</span>;
}

/** Stagger style for list/grid entrances: <div className="animate-rise" style={stagger(i)} /> */
export const stagger = (i: number, step = 45): CSSProperties => ({ animationDelay: `${Math.min(i, 12) * step}ms` });

/** Living gradient backdrop (visible in Normal subtly, Morphism fully, hidden in Brutal). */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <span /><span /><span />
    </div>
  );
}

/** Animated check mark (draws itself). */
export function SuccessCheck({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#10b981" />
      <path d="M7 12.5l3.2 3.2L17 9" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="check-draw" />
    </svg>
  );
}
