import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Bill, Debt, Settings, Transaction } from '@/db/types';
import { isoDay } from './period';
import { isNative, nativeDailyReminder, nativeNotify, nativeNotifyPermission } from './native';

/**
 * Reminders. Browsers can't wake a closed web app without a push server, so:
 *  - while the app is open (or the PWA is backgrounded), a timer fires the daily reminder;
 *  - due bills/debts are always surfaced as in-app alerts on the dashboard.
 */

export async function requestPermission(): Promise<boolean> {
  if (isNative) return nativeNotifyPermission().catch(() => false);
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

export async function showNotification(title: string, body: string) {
  if (isNative) return void nativeNotify(title, body).catch(() => {});
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' });
    else new Notification(title, { body, icon: '/icon-192.png' });
  } catch { /* ignore */ }
}

let timer: number | undefined;

/** Schedule today's (or tomorrow's) daily reminder while the app is running. */
export function scheduleDailyReminder(s: Settings, title: string, body: string, hasEntryToday: () => Promise<boolean>) {
  window.clearTimeout(timer);
  // On a phone the OS schedules it, so it fires even when the app is closed.
  if (isNative) return void nativeDailyReminder(s.dailyReminder.enabled, s.dailyReminder.time, title, body).catch(() => {});
  if (!s.dailyReminder.enabled) return;
  const [h, m] = s.dailyReminder.time.split(':').map(Number);
  const now = new Date();
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  if (at <= now) at.setDate(at.getDate() + 1);
  timer = window.setTimeout(async () => {
    if (!(await hasEntryToday())) showNotification(title, body);
    scheduleDailyReminder(s, title, body, hasEntryToday);
  }, Math.min(at.getTime() - now.getTime(), 2 ** 31 - 1));
}

export interface DueItem {
  kind: 'bill' | 'debt';
  id: string;
  name: string;
  amount: number;
  currency: string;
  date: string;
  days: number; // negative = overdue
}

export function dueItems(bills: Bill[], debts: Debt[], today = new Date()): DueItem[] {
  const out: DueItem[] = [];
  for (const b of bills) {
    const days = differenceInCalendarDays(parseISO(b.dueDate), today);
    if (days <= b.remindDaysBefore) out.push({ kind: 'bill', id: b.id, name: b.name, amount: b.amount, currency: b.currency, date: b.dueDate, days });
  }
  for (const d of debts) {
    if (!d.remind || !d.dueDate) continue;
    const paid = d.payments.reduce((a, p) => a + p.amount, 0);
    if (paid >= d.amount) continue;
    const days = differenceInCalendarDays(parseISO(d.dueDate), today);
    if (days <= 3) out.push({ kind: 'debt', id: d.id, name: d.person, amount: d.amount - paid, currency: d.currency, date: d.dueDate, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

export const hasEntryOn = (txs: Transaction[], day = new Date()) => txs.some((t) => t.date.startsWith(isoDay(day)));
