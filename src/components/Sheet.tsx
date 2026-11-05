import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '@/lib/utils';

/**
 * Bottom sheet on phones, centred dialog on larger screens.
 * - Drag the handle/header down to dismiss (distance or flick velocity).
 * - Backdrop tap, Esc and the close button animate out before unmounting.
 */
export function Sheet({ open, onClose, title, children, footer, tall }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number } | null>(null);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); setDy(0); onClose(); }, 220);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  if (!open) return null;

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { y: e.clientY, t: performance.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setDy(Math.max(0, e.clientY - drag.current.y));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dist = e.clientY - drag.current.y;
    const v = dist / Math.max(1, performance.now() - drag.current.t);
    drag.current = null;
    if (dist > 130 || v > 0.7) close();
    else setDy(0);
  };

  const dragging = drag.current !== null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div
        className={cx('absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200', closing ? 'opacity-0' : 'animate-fade-in')}
        style={dy ? { opacity: Math.max(0.2, 1 - dy / 400) } : undefined}
        onClick={close}
      />
      <div
        className={cx(
          'm-sheet relative flex w-full max-w-lg flex-col shadow-2xl sm:rounded-[calc(var(--radius-card)+12px)]',
          tall ? 'h-[94dvh] sm:h-[88dvh]' : 'max-h-[92dvh]',
          closing ? 'translate-y-full opacity-0 transition-all duration-200 ease-in sm:translate-y-4' : 'animate-slide-up sm:animate-pop',
          !dragging && !closing && 'transition-transform duration-300 ease-[cubic-bezier(.2,.9,.3,1.2)]',
        )}
        style={dy && !closing ? { transform: `translateY(${dy}px)` } : undefined}
      >
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="cursor-grab touch-none select-none active:cursor-grabbing">
          <div className="mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-ink/20 sm:hidden" />
          {title && (
            <div className="flex items-center gap-2 px-5 pb-2 pt-3">
              <h2 className="flex-1 text-lg font-bold tracking-tight text-ink">{title}</h2>
              <button onClick={close} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-ink/5 active:scale-90">
                <X size={20} />
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="m-rule px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
