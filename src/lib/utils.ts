import { isNative, shareFile } from './native';
/** Generic helpers. */

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const round = (v: number, decimals = 2) => {
  const f = 10 ** decimals;
  return Math.round((v + Number.EPSILON) * f) / f;
};

export function groupBy<T, K extends string>(list: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of list) (out[key(item)] ||= []).push(item);
  return out;
}

export const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);

/** Download a Blob or string as a file. */
export function download(content: Blob | string, filename: string, mime = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  // WebViews can't "download" — save to the app cache and open the share sheet instead.
  if (isNative) {
    shareFile(blob, filename).catch((e) => console.error('share failed', e));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Resize an image file to a JPEG data URL (for receipts). */
export function compressImage(file: File, maxSide = 1024, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Safely evaluate a numpad expression like "120+35.5-10". */
export function evalExpression(expr: string): number {
  const tokens = expr.replace(/×/g, '*').replace(/÷/g, '/').match(/(\d+\.?\d*|\.\d+|[+\-*/])/g);
  if (!tokens) return 0;
  // Two-pass: * and / first, then + and −.
  const nums: number[] = [];
  const ops: string[] = [];
  let expectNum = true;
  for (const t of tokens) {
    if (/[+\-*/]/.test(t)) {
      if (expectNum) continue; // ignore dangling operators
      ops.push(t);
      expectNum = true;
    } else {
      const n = parseFloat(t);
      if (ops.length && (ops[ops.length - 1] === '*' || ops[ops.length - 1] === '/')) {
        const op = ops.pop()!;
        const a = nums.pop()!;
        nums.push(op === '*' ? a * n : n === 0 ? a : a / n);
      } else nums.push(n);
      expectNum = false;
    }
  }
  if (ops.length >= nums.length) ops.pop();
  let total = nums[0] ?? 0;
  for (let i = 0; i < ops.length; i++) total = ops[i] === '+' ? total + nums[i + 1] : total - nums[i + 1];
  return Number.isFinite(total) ? total : 0;
}

/** Default categorical palette (validated colour order — see dataviz notes in PLAN.md). */
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#0e9bb5', '#8a6d3b', '#7a7f87', '#b8459b'];
