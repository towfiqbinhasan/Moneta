import { forwardRef, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ImagePlus, UserRound, X } from 'lucide-react';
import { compressImage, cx } from '@/lib/utils';
import { haptic } from './motion';
import { accent } from '@/theme/accents';

/**
 * Shared UI primitives. They style themselves through the semantic classes in
 * index.css (.m-card, .m-btn, .m-input …), so every theme restyles them
 * without conditional classes here.
 */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'soft' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'primary', size = 'md', block, className, onClick, ...p }, ref,
) {
  return (
    <button
      ref={ref}
      {...p}
      onClick={(e) => { haptic(6); onClick?.(e); }}
      className={cx(
        'm-btn',
        `m-btn-${variant}`,
        size === 'lg' && 'h-14 px-6 text-base',
        size === 'md' && 'h-11 px-4 text-sm',
        size === 'sm' && 'h-8 px-3 text-xs',
        block && 'w-full',
        className,
      )}
    />
  );
});

export const IconButton = ({ className, label, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
  <button aria-label={label} title={label} {...p} className={cx('grid h-10 w-10 place-items-center rounded-full text-ink/80 transition hover:bg-ink/5 active:scale-90', className)} />
);

export const Card = ({ className, children, onClick, style }: { className?: string; children: ReactNode; onClick?: () => void; style?: CSSProperties }) => (
  <div onClick={onClick} style={style} className={cx('m-card p-4', onClick && 'cursor-pointer transition-transform active:scale-[.99]', className)}>
    {children}
  </div>
);

/** Card header: accent dot-icon + uppercase label + optional action. */
export function CardTitle({ icon, hue = 'indigo', children, action }: { icon?: ReactNode; hue?: string; children: ReactNode; action?: ReactNode }) {
  const a = accent(hue);
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon && <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: a.soft, color: a.text }}>{icon}</span>}
      <span className="m-label flex-1 truncate">{children}</span>
      {action}
    </div>
  );
}

export const Field = ({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) => (
  <label className={cx('block', className)}>
    <span className="m-label mb-1.5 block">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx('m-input', className)} />;
});

export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx('m-input appearance-none pe-8', className)}>{children}</select>
);

export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx('m-input h-auto min-h-[80px] py-3', className)} />
);

export function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; desc?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => { haptic(5); onChange(!checked); }} className="flex w-full items-center gap-3 py-2 text-start">
      <span className="flex-1">
        <span className="block text-[15px] text-ink">{label}</span>
        {desc && <span className="block text-xs text-muted">{desc}</span>}
      </span>
      <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300', checked ? 'bg-brand' : 'bg-ink/15')}>
        <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all duration-300 ease-[cubic-bezier(.3,1.5,.6,1)]', checked ? 'start-[1.375rem]' : 'start-0.5')} />
      </span>
    </button>
  );
}

/** Segmented control with a sliding highlight pill. */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={cx('m-tile relative flex p-1', className)} role="tablist">
      <span
        aria-hidden
        className="absolute bottom-1 top-1 rounded-[calc(var(--radius-ctl)-3px)] bg-card shadow-sm transition-all duration-300 ease-[cubic-bezier(.3,1.3,.6,1)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, insetInlineStart: `calc(0.25rem + (100% - 0.5rem) / ${options.length} * ${i})` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => { haptic(5); onChange(o.value); }}
          className={cx('relative z-10 flex-1 rounded-xl px-2 py-2 text-sm font-medium transition-colors', value === o.value ? 'text-ink' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, back, action, subtitle }: { title: ReactNode; back?: boolean; action?: ReactNode; subtitle?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-2 bg-surface/80 px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl md:static md:mx-0 md:bg-transparent md:px-0 md:pt-6 md:backdrop-blur-none">
      {back && (
        <IconButton label="Back" onClick={() => nav(-1)} className="-ms-2">
          <ArrowLeft size={22} className="rtl:rotate-180" />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center animate-rise">
      <div className="relative mb-5">
        <div className="absolute inset-0 scale-125 rounded-full bg-brand/10 blur-xl" />
        <div className="relative grid h-20 w-20 place-items-center rounded-full bg-brand/10 text-brand animate-float">{icon}</div>
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export const Chip = ({ active, children, onClick, color }: { active?: boolean; children: ReactNode; onClick?: () => void; color?: string }) => (
  <button
    type="button"
    onClick={() => { haptic(5); onClick?.(); }}
    style={active && color ? { backgroundColor: color, borderColor: color } : undefined}
    className={cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition active:scale-95', active ? 'border-brand bg-brand text-white' : 'border-line bg-card/60 text-ink hover:bg-ink/5')}
  >
    {children}
  </button>
);

export const SectionTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="mb-2 mt-5 flex items-center justify-between px-1">
    <h2 className="m-label">{children}</h2>
    {action}
  </div>
);

/** Rounded icon tile used for categories, accounts, goals. */
export const IconTile = ({ color, children, size = 40 }: { color: string; children: ReactNode; size?: number }) => (
  <span className="grid shrink-0 place-items-center rounded-2xl" style={{ width: size, height: size, backgroundColor: color + '22', color }}>
    {children}
  </span>
);

export function ListRow({ left, title, subtitle, right, onClick }: { left?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div';
  return (
    <C type={onClick ? 'button' : undefined} onClick={onClick} className={cx('flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-start', onClick && 'transition hover:bg-ink/5 active:bg-ink/10')}>
      {left}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{title}</span>
        {subtitle && <span className="block truncate text-xs text-muted">{subtitle}</span>}
      </span>
      {right}
    </C>
  );
}

/** Profile avatar: picture, or initials on the brand gradient. */
export function Avatar({ name, src, size = 44 }: { name?: string; src?: string; size?: number }) {
  const initials = (name ?? '').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return src ? (
    <img src={src} alt="" className="shrink-0 rounded-full object-cover ring-2 ring-card" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-card" style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand) / .6))' }}>
      {initials || <UserRound size={size * 0.5} />}
    </span>
  );
}

/* --------------------------- Image picker --------------------------- */

/** Rules for pictures (avatar, goal cover). Enforced below and printed under the picker. */
export const IMAGE_MAX_MB = 8;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

export function ImagePicker({ value, onChange, maxSide = 800, round, aspect = 'aspect-[16/9]' }: {
  value?: string;
  onChange: (v: string | undefined) => void;
  maxSide?: number;
  round?: boolean;
  aspect?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (f?: File) => {
    if (!f) return;
    setError('');
    if (f.type && !IMAGE_TYPES.includes(f.type)) return setError(t('image.badType'));
    if (f.size > IMAGE_MAX_MB * 1024 * 1024) return setError(t('image.tooBig', { mb: IMAGE_MAX_MB }));
    setBusy(true);
    try { onChange(await compressImage(f, maxSide, 0.78)); } catch { setError(t('image.badType')); }
    setBusy(false);
  };

  return (
    <div>
      <div className={cx('relative overflow-hidden', round ? 'h-24 w-24 rounded-full' : cx('w-full rounded-2xl', aspect))}>
        <button type="button" onClick={() => ref.current?.click()} className={cx('m-tile grid h-full w-full place-items-center overflow-hidden text-muted transition hover:text-brand', round && '!rounded-full', busy && 'shimmer')}>
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus size={22} />{t('image.add')}</span>}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(undefined)} aria-label={t('common.delete')} className="absolute end-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur">
            <X size={14} />
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept={IMAGE_TYPES.join(',')} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <p className={cx('mt-1.5 text-[11px]', error ? 'text-red-500 animate-shake' : 'text-muted')}>{error || t('image.rules', { mb: IMAGE_MAX_MB })}</p>
    </div>
  );
}
