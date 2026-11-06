import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Repeat, Star, Trash2 } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, EmptyState, Field, IconTile, Input, PageHeader, Segmented, Select } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Icon } from '@/lib/icons';
import { parseAmount } from '@/lib/format';
import { remove, update } from '@/db/repo';
import type { Period, Recurring, Template } from '@/db/types';
import { useQuickAdd } from '../AppShell';

/** Recurring rules and quick-add templates (favourites). */
export function RecurringPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'recurring' | 'templates'>('recurring');
  return (
    <div>
      <PageHeader back title={t('nav.recurring')} />
      <Segmented value={tab} onChange={setTab} className="mb-3" options={[{ value: 'recurring', label: t('rec.recurring') }, { value: 'templates', label: t('rec.templates') }]} />
      {tab === 'recurring' ? <RecurringList /> : <TemplateList />}
    </div>
  );
}

function RecurringList() {
  const { t } = useTranslation();
  const toast = useToast();
  const { recurring, categories, money, date } = useData();
  const [edit, setEdit] = useState<Recurring | null>(null);
  if (!recurring.length) return <EmptyState icon={<Repeat size={36} />} title={t('empty.noRecurring')} text={t('empty.noRecurringText')} />;
  return (
    <div className="space-y-2">
      {recurring.map((r) => {
        const cat = categories.find((c) => c.id === r.categoryId);
        return (
          <Card key={r.id} className={`flex items-center gap-3 !p-3 ${r.active ? '' : 'opacity-60'}`}>
            <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => setEdit(r)}>
              <IconTile color={cat?.color ?? '#2a78d6'}><Icon name={cat?.icon ?? 'receipt'} size={20} /></IconTile>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.note || cat?.name || t(`tx.${r.type}`)}</span>
                <span className="block text-xs text-muted">{t(`period.${r.frequency}`)} · {t('rec.next')}: {date(r.nextDate)}</span>
              </span>
              <span className="font-bold tabular">{money(r.amount, r.currency)}</span>
            </button>
            <button className="p-2 text-muted" aria-label="toggle" onClick={() => update<Recurring>('recurring', r.id, { active: !r.active })}>{r.active ? <Pause size={18} /> : <Play size={18} />}</button>
            <button className="p-2 text-muted hover:text-red-500" aria-label={t('common.delete')} onClick={async () => { const u = await remove('recurring', r.id); toast(t('common.deleted'), u); }}><Trash2 size={18} /></button>
          </Card>
        );
      })}
      {edit && <RecurringForm rule={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RecurringForm({ rule, onClose }: { rule: Recurring; onClose: () => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(String(rule.amount));
  const [freq, setFreq] = useState<Period>(rule.frequency);
  const [interval, setInterval] = useState(rule.interval);
  const [next, setNext] = useState(rule.nextDate);
  const [end, setEnd] = useState(rule.endDate ?? '');
  const [note, setNote] = useState(rule.note);
  const valid = parseAmount(amount) > 0 && !!next;
  const submit = async () => {
    if (!valid) return;
    await update<Recurring>('recurring', rule.id, { amount: parseAmount(amount), frequency: freq, interval: Math.max(1, interval || 1), nextDate: next, endDate: end || undefined, note, active: true });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={t('rec.edit')} footer={<Button block disabled={!valid} onClick={submit}>{t('common.save')}</Button>}>
      <div className="space-y-4">
        <Field label={`${t('budget.amount')} (${rule.currency})`}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={t('tx.note')}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('rec.every')}><Input type="number" min={1} value={interval} onChange={(e) => setInterval(+e.target.value)} /></Field>
          <Field label={t('rec.frequency')}>
            <Select value={freq} onChange={(e) => setFreq(e.target.value as Period)}>
              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => <option key={p} value={p}>{t(`period.${p}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('rec.next')}><Input type="date" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Field label={t('rec.end')}><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
      </div>
    </Sheet>
  );
}

function TemplateList() {
  const { t } = useTranslation();
  const toast = useToast();
  const openAdd = useQuickAdd();
  const { templates, categories, money } = useData();
  if (!templates.length) return <EmptyState icon={<Star size={36} />} title={t('empty.noTemplates')} text={t('empty.noTemplatesText')} />;
  return (
    <div className="space-y-2">
      {templates.map((tp: Template) => {
        const cat = categories.find((c) => c.id === tp.categoryId);
        return (
          <Card key={tp.id} className="flex items-center gap-3 !p-3">
            <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => openAdd({ prefill: tp, type: tp.type })}>
              <IconTile color={cat?.color ?? '#eda100'}><Icon name={cat?.icon ?? 'sparkles'} size={20} /></IconTile>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{tp.name}</span>
                <span className="block text-xs text-muted">{cat?.name} · {t('rec.used', { count: tp.uses })}</span>
              </span>
              <span className="font-bold tabular">{money(tp.amount, tp.currency)}</span>
            </button>
            <button className="p-2 text-muted hover:text-red-500" aria-label={t('common.delete')} onClick={async () => { const u = await remove('templates', tp.id); toast(t('common.deleted'), u); }}><Trash2 size={18} /></button>
          </Card>
        );
      })}
    </div>
  );
}
