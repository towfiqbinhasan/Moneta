import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Undo2 } from 'lucide-react';
import { SuccessCheck, haptic } from './motion';

/** Toasts with an optional Undo action (used after delete / edit) and a countdown bar. */

interface ToastItem {
  id: number;
  text: string;
  undo?: () => void | Promise<void>;
  tone?: 'ok' | 'warn';
  ms: number;
}

const ToastCtx = createContext<(text: string, undo?: ToastItem['undo'], tone?: ToastItem['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const { t } = useTranslation();

  const show = useCallback((text: string, undo?: ToastItem['undo'], tone: ToastItem['tone'] = 'ok') => {
    const id = ++seq.current;
    const ms = undo ? 6000 : 2800;
    haptic(tone === 'warn' ? [20, 40, 20] : 10);
    setItems((l) => [...l.slice(-2), { id, text, undo, tone, ms }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), ms);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {items.map((it) => (
          <div key={it.id} className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl bg-ink text-surface shadow-2xl animate-pop">
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              {it.tone === 'warn' ? <AlertTriangle size={18} className="shrink-0 text-amber-400" /> : <SuccessCheck />}
              <span className="flex-1">{it.text}</span>
              {it.undo && (
                <button
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold transition hover:bg-white/10 active:scale-95"
                  style={{ color: 'rgb(var(--brand-light))' }}
                  onClick={async () => {
                    haptic(8);
                    await it.undo?.();
                    setItems((l) => l.filter((x) => x.id !== it.id));
                  }}
                >
                  <Undo2 size={15} /> {t('common.undo')}
                </button>
              )}
            </div>
            {it.undo && (
              <div className="absolute bottom-0 start-0 h-0.5 " style={{ backgroundColor: 'rgb(var(--brand-light))', animation: `toast-count ${it.ms}ms linear forwards` }} />
            )}
          </div>
        ))}
      </div>
      <style>{'@keyframes toast-count{from{width:100%}to{width:0}}'}</style>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
