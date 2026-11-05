import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, OctagonAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BudgetState } from '@/lib/stats';
import { clamp, cx } from '@/lib/utils';

/** Status colours are reserved for budget state, and always paired with an icon + label. */
export const STATE_COLOR: Record<BudgetState, string> = { safe: '#16a34a', warn: '#eda100', over: '#e34948' };

/** Animate from 0 on mount so bars and rings "fill up". */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(id); }, []);
  return m;
}

export function ProgressBar({ pct, state, color, className }: { pct: number; state?: BudgetState; color?: string; className?: string }) {
  const mounted = useMounted();
  const c = color ?? (state ? STATE_COLOR[state] : 'rgb(var(--brand))');
  const w = mounted ? clamp(pct, 0, 1) * 100 : 0;
  return (
    <div className={cx('h-2.5 w-full overflow-hidden rounded-full bg-ink/10', className)} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cx('relative h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]', state === 'over' && 'shimmer')}
        style={{ width: `${w}%`, backgroundColor: c, backgroundImage: state === 'over' ? undefined : `linear-gradient(90deg, ${c}cc, ${c})` }}
      />
    </div>
  );
}

export function StateBadge({ state }: { state: BudgetState }) {
  const { t } = useTranslation();
  const Ico = state === 'safe' ? CheckCircle2 : state === 'warn' ? AlertTriangle : OctagonAlert;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: STATE_COLOR[state], backgroundColor: STATE_COLOR[state] + '1a' }}>
      <Ico size={13} /> {t(`budget.state.${state}`)}
    </span>
  );
}

export function ProgressRing({ pct, color, size = 72, stroke = 8, children }: { pct: number; color: string; size?: number; stroke?: number; children?: React.ReactNode }) {
  const mounted = useMounted();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = mounted ? clamp(pct, 0, 1) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-ink/10" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 4px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-xs font-bold text-ink">{children}</div>
    </div>
  );
}
