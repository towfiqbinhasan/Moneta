import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HandCoins, Plus } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, EmptyState, Field, Input, PageHeader, Segmented, Toggle, Textarea } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { CurrencyPicker } from '@/components/pickers';
import { ProgressBar } from '@/components/Progress';
import { useToast } from '@/components/Toast';
import { parseAmount } from '@/lib/format';
import { isoDay } from '@/lib/period';
import { debtLeft, toBase } from '@/lib/stats';
import { remove, save, update } from '@/db/repo';
import { uid } from '@/lib/utils';
import type { Debt } from '@/db/types';
import { differenceInCalendarDays, parseISO } from 'date-fns';


export function DebtsPage() {
  const { t } = useTranslation();
  const { debts, money, ctx, date } = useData();
  const [dir, setDir] = useState<'owe' | 'owed'>('owed');
  const [edit, setEdit] = useState<Partial<Debt> | null>(null);
  const [pay, setPay] = useState<Debt | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const outstanding = (k: 'owe' | 'owed') => debts.filter((d) => d.direction === k).reduce((a, d) => a + toBase(debtLeft(d).left, d.currency, ctx), 0);
  const list = debts.filter((d) => d.direction === dir && (showSettled || debtLeft(d).left > 0));

  return (
    <div>
      <PageHeader back title={t('nav.debts')} action={<Button size="sm" onClick={() => setEdit({ direction: dir })}><Plus size={16} /> {t('common.add')}</Button>} />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Card className="!p-3"><div className="text-xs text-muted">{t('debt.owedToMe')}</div><div className="font-bold tabular text-emerald-600 dark:text-emerald-400">{money(outstanding('owed'))}</div></Card>
        <Card className="!p-3"><div className="text-xs text-muted">{t('debt.iOwe')}</div><div className="font-bold tabular text-red-500">{money(outstanding('owe'))}</div></Card>
      </div>
      <Segmented value={dir} onChange={setDir} className="mb-3" options={[{ value: 'owed', label: t('debt.owedToMe') }, { value: 'owe', label: t('debt.iOwe') }]} />
      {!list.length && <EmptyState icon={<HandCoins size={36} />} title={t('empty.noDebts')} />}
      <div className="space-y-2">
        {list.map((d) => {
          const { paid, left } = debtLeft(d);
          const days = d.dueDate ? differenceInCalendarDays(parseISO(d.dueDate), new Date()) : undefined;
          return (
            <Card key={d.id}>
              <button className="w-full text-start" onClick={() => setEdit(d)}>
                <div className="flex justify-between">
                  <span className="font-semibold">{d.person}</span>
                  <span className="font-bold tabular">{money(left, d.currency)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>{d.note}</span>
                  {d.dueDate && left > 0 && <span className={days! < 0 ? 'text-red-500' : ''}>{t('debt.due')}: {date(d.dueDate)}</span>}
                </div>
                <ProgressBar pct={d.amount > 0 ? paid / d.amount : 0} color="#1baf7a" className="mt-2 h-1.5" />
                <div className="mt-1 text-[11px] text-muted">{t('debt.paidOf', { paid: money(paid, d.currency), total: money(d.amount, d.currency) })}</div>
              </button>
              {left > 0 && <Button variant="soft" size="sm" className="mt-2" onClick={() => setPay(d)}>{t('debt.recordPayment')}</Button>}
            </Card>
          );
        })}
      </div>
      <button className="mt-4 text-sm font-medium text-brand" onClick={() => setShowSettled(!showSettled)}>{showSettled ? t('debt.hideSettled') : t('debt.showSettled')}</button>
      {edit && <DebtForm initial={edit} onClose={() => setEdit(null)} />}
      {pay && <PaySheet debt={pay} onClose={() => setPay(null)} />}
    </div>
  );
}

function PaySheet({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { t } = useTranslation();
  const { left } = debtLeft(debt);
  const [amount, setAmount] = useState(String(left));
  const submit = async () => {
    const v = parseAmount(amount);
    if (v <= 0) return;
    await update<Debt>('debts', debt.id, { payments: [...(debt.payments ?? []), { id: uid(), amount: v, date: isoDay(new Date()) }] });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={`${t('debt.recordPayment')} · ${debt.person}`} footer={<Button block disabled={parseAmount(amount) <= 0} onClick={submit}>{t('common.save')}</Button>}>
      <Field label={`${t('budget.amount')} (${debt.currency})`}><Input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
    </Sheet>
  );
}

function DebtForm({ initial, onClose }: { initial: Partial<Debt>; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings, money, date } = useData();
  const [d, setD] = useState<Partial<Debt>>({ direction: 'owed', person: '', currency: settings.baseCurrency, note: '', payments: [], remind: true, ...initial });
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '');
  const set = <K extends keyof Debt>(k: K, v: Debt[K]) => setD((p) => ({ ...p, [k]: v }));
  const valid = !!d.person?.trim() && parseAmount(amount) > 0;
  const submit = async () => {
    if (!valid) return;
    await save<Debt>('debts', { ...(d as Debt), person: d.person!.trim(), amount: parseAmount(amount), dueDate: d.dueDate || undefined });
    onClose();
  };
  const del = async () => { const u = await remove('debts', initial.id!); toast(t('common.deleted'), u); onClose(); };
  return (
    <Sheet open onClose={onClose} title={initial.id ? t('debt.edit') : t('debt.add')} tall
      footer={<div className="flex gap-2">{initial.id && <Button variant="danger" onClick={del}>{t('common.delete')}</Button>}<Button block disabled={!valid} onClick={submit}>{t('common.save')}</Button></div>}>
      <div className="space-y-4">
        <Segmented value={d.direction!} onChange={(v) => set('direction', v)} options={[{ value: 'owed', label: t('debt.theyOweMe') }, { value: 'owe', label: t('debt.iOweThem') }]} />
        <Field label={t('debt.person')}><Input value={d.person} onChange={(e) => set('person', e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label={t('budget.amount')}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={t('common.currency')}><CurrencyPicker compact value={d.currency!} onChange={(c) => set('currency', c)} /></Field>
        </div>
        <Field label={t('debt.due')}><Input type="date" value={d.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value)} /></Field>
        <Field label={t('tx.note')}><Textarea value={d.note} onChange={(e) => set('note', e.target.value)} /></Field>
        <Toggle checked={!!d.remind} onChange={(v) => set('remind', v)} label={t('debt.remind')} />
        {!!d.payments?.length && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted">{t('debt.payments')}</div>
            {d.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-1.5 text-sm">
                <span>{date(p.date)}</span>
                <span className="flex items-center gap-2 tabular">{money(p.amount, d.currency!)}
                  <button className="text-muted hover:text-red-500" onClick={() => set('payments', d.payments!.filter((x) => x.id !== p.id))}>✕</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
