import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Bell, Plus } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, EmptyState, Field, IconTile, Input, PageHeader, Select } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { CurrencyPicker } from '@/components/pickers';
import { useToast } from '@/components/Toast';
import { Icon } from '@/lib/icons';
import { parseAmount } from '@/lib/format';
import { isoDateTime, isoDay } from '@/lib/period';
import { nextOccurrence } from '@/lib/recurring';
import { create, remove, save, update } from '@/db/repo';
import type { Bill, Repeat, Transaction } from '@/db/types';

export function BillsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { bills, categories, accounts, money, date } = useData();
  const [edit, setEdit] = useState<Partial<Bill> | null>(null);

  /** Mark paid: records the expense and moves the due date forward. */
  const pay = async (b: Bill) => {
    const accountId = accounts.find((a) => a.id === b.accountId && !a.archived)?.id ?? accounts.find((a) => !a.archived)?.id ?? accounts[0]?.id;
    if (!accountId) return;
    const tx = await create<Transaction>('transactions', { type: 'expense', amount: b.amount, currency: b.currency, accountId, categoryId: b.categoryId, date: isoDateTime(new Date()), note: b.name, tags: ['bill'] });
    let undoAction: () => Promise<void>;
    if (b.repeat === 'none') {
      undoAction = await remove('bills', b.id);
    } else {
      undoAction = await update<Bill>('bills', b.id, { lastPaid: isoDay(new Date()), dueDate: nextOccurrence(b.dueDate, b.repeat) });
    }
    toast(t('bill.paid', { name: b.name }), async () => { await undoAction(); await remove('transactions', tx.id); });
  };

  return (
    <div>
      <PageHeader back title={t('nav.bills')} action={<Button size="sm" onClick={() => setEdit({})}><Plus size={16} /> {t('common.add')}</Button>} />
      {!bills.length && <EmptyState icon={<Bell size={36} />} title={t('empty.noBills')} text={t('empty.noBillsText')} action={<Button onClick={() => setEdit({})}>{t('bill.add')}</Button>} />}
      <div className="space-y-2">
        {bills.map((b) => {
          const days = differenceInCalendarDays(parseISO(b.dueDate), new Date());
          const cat = categories.find((c) => c.id === b.categoryId);
          return (
            <Card key={b.id} className="flex items-center gap-3 !p-3">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => setEdit(b)}>
                <IconTile color={cat?.color ?? '#eda100'}><Icon name={cat?.icon ?? 'receipt'} size={20} /></IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{b.name}</span>
                  <span className={`block text-xs ${days < 0 ? 'text-red-500' : days <= b.remindDaysBefore ? 'text-amber-600' : 'text-muted'}`}>
                    {days < 0 ? t('alert.overdueShort', { days: -days }) : days === 0 ? t('bill.today') : t('bill.inDays', { days })} · {date(b.dueDate)} {b.repeat !== 'none' && `· ${t(`repeat.${b.repeat}`)}`}
                  </span>
                </span>
                <span className="font-bold tabular">{money(b.amount, b.currency)}</span>
              </button>
              <Button size="sm" variant="soft" onClick={() => pay(b)}>{t('bill.markPaid')}</Button>
            </Card>
          );
        })}
      </div>
      {edit && <BillForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function BillForm({ initial, onClose }: { initial: Partial<Bill>; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings, categories, accounts } = useData();
  const [b, setB] = useState<Partial<Bill>>({ name: '', currency: settings.baseCurrency, dueDate: isoDay(new Date()), repeat: 'monthly', remindDaysBefore: 3, accountId: accounts[0]?.id, ...initial });
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '');
  const set = <K extends keyof Bill>(k: K, v: Bill[K]) => setB((p) => ({ ...p, [k]: v }));
  const valid = !!b.name?.trim() && parseAmount(amount) > 0 && !!b.dueDate;
  const submit = async () => { if (!valid) return; await save<Bill>('bills', { ...(b as Bill), name: b.name!.trim(), amount: parseAmount(amount) }); onClose(); };
  const del = async () => { const u = await remove('bills', initial.id!); toast(t('common.deleted'), u); onClose(); };
  return (
    <Sheet open onClose={onClose} title={initial.id ? t('bill.edit') : t('bill.add')} tall
      footer={<div className="flex gap-2">{initial.id && <Button variant="danger" onClick={del}>{t('common.delete')}</Button>}<Button block disabled={!valid} onClick={submit}>{t('common.save')}</Button></div>}>
      <div className="space-y-4">
        <Field label={t('bill.name')}><Input value={b.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder={t('bill.namePh')} /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label={t('budget.amount')}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={t('common.currency')}><CurrencyPicker compact value={b.currency!} onChange={(c) => set('currency', c)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('bill.dueDate')}><Input type="date" value={b.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
          <Field label={t('bill.repeat')}>
            <Select value={b.repeat} onChange={(e) => set('repeat', e.target.value as Repeat)}>
              {(['none', 'weekly', 'monthly', 'yearly'] as const).map((r) => <option key={r} value={r}>{t(`repeat.${r}`)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('filter.category')}>
          <Select value={b.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || undefined)}>
            <option value="">—</option>
            {categories.filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t('filter.account')}>
          <Select value={b.accountId ?? ''} onChange={(e) => set('accountId', e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label={t('bill.remindBefore')}>
          <Input type="number" min={0} max={30} value={b.remindDaysBefore} onChange={(e) => set('remindDaysBefore', +e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
