import { Delete } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { toDigits } from '@/lib/format';
import { haptic } from './motion';

/**
 * Custom numpad for fast amount entry. Supports + − × ÷ so "120+45" works.
 * `value` is the raw expression string with '.' as decimal point.
 */
export function Numpad({ value, onChange, decimals = 2 }: { value: string; onChange: (v: string) => void; decimals?: number }) {
  const { settings } = useData();
  const press = (k: string) => {
    haptic(5);
    if (k === 'del') return onChange(value.slice(0, -1));
    if (k === 'C') return onChange('');
    const ops = '+-×÷';
    if (ops.includes(k)) {
      if (!value) return;
      return onChange(ops.includes(value.slice(-1)) ? value.slice(0, -1) + k : value + k);
    }
    const lastNum = value.split(/[+\-×÷]/).pop() ?? '';
    if (k === '.') {
      if (decimals === 0 || lastNum.includes('.')) return;
      return onChange(value + (lastNum ? '.' : '0.'));
    }
    if (lastNum.includes('.') && lastNum.split('.')[1].length >= decimals) return;
    if (lastNum === '0' && k !== '.') return onChange(value.slice(0, -1) + k);
    if (value.length > 18) return;
    onChange(value + k);
  };

  const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '.', '0', 'del', '+'];
  return (
    <div className="grid grid-cols-4 gap-2 select-none" dir="ltr">
      {keys.map((k) => {
        const op = '+-×÷'.includes(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            onContextMenu={(e) => { if (k === 'del') { e.preventDefault(); press('C'); } }}
            className={`m-tile h-14 text-xl font-semibold transition duration-100 active:scale-90 active:bg-brand/20 ${op ? '!bg-brand/10 text-brand' : 'text-ink hover:bg-ink/10'}`}
            aria-label={k === 'del' ? 'Backspace' : k}
          >
            {k === 'del' ? <Delete className="mx-auto" size={22} /> : k === '.' ? settings.decimalSep : k === '-' ? '−' : /\d/.test(k) ? toDigits(k, settings.digitStyle) : k}
          </button>
        );
      })}
    </div>
  );
}
