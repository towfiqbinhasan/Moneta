import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, Trash2, Users } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, EmptyState, Field, Input, PageHeader, Segmented } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { CurrencyPicker } from '@/components/pickers';
import { useToast } from '@/components/Toast';
import { parseAmount } from '@/lib/format';
import { isoDay } from '@/lib/period';
import { round } from '@/lib/utils';
import { defaultDecimals } from '@/lib/currency';
import { create, remove, save, update } from '@/db/repo';
import type { Debt, Split, SplitParticipant } from '@/db/types';

/** Split a bill with friends (equal or custom shares); optionally turn unpaid shares into debts. */
export function SplitPage() {
  const { t } = useTranslation();
  const { splits, money, date } = useData();
  const [edit, setEdit] = useState<Partial<Split> | null>(null);

  const togglePaid = (s: Split, i: number) =>
    update<Split>('splits', s.id, { participants: s.participants.map((p, j) => (j === i ? { ...p, paid: !p.paid } : p)) });

  return (
    <div>
      <PageHeader back title={t('nav.split')} action={<Button size="sm" onClick={() => setEdit({})}><Plus size={16} /> {t('common.add')}</Button>} />
      {!splits.length && <EmptyState icon={<Users size={36} />} title={t('empty.noSplits')} text={t('empty.noSplitsText')} action={<Button onClick={() => setEdit({})}>{t('split.add')}</Button>} />}
      <div className="space-y-3">
        {splits.map((s) => {
          const unpaid = s.participants.filter((p) => !p.paid).reduce((a, p) => a + p.share, 0);
          return (
            <Card key={s.id}>
              <button className="flex w-full justify-between text-start" onClick={() => setEdit(s)}>
                <div><div className="font-semibold">{s.title}</div><div className="text-xs text-muted">{date(s.date)}</div></div>
                <div className="text-end"><div className="font-bold tabular">{money(s.total, s.currency)}</div>{unpaid > 0 && <div className="text-xs text-amber-600">{t('split.pending', { amount: money(unpaid, s.currency) })}</div>}</div>
              </button>
              <div className="mt-2 divide-y divide-line">
                {s.participants.map((p, i) => (
                  <button key={i} onClick={() => togglePaid(s, i)} className="flex w-full items-center gap-3 py-2 text-sm">
                    <span className={`grid h-6 w-6 place-items-center rounded-full ${p.paid ? 'bg-emerald-500 text-white' : 'border-2 border-line'}`}>{p.paid && <Check size={14} />}</span>
                    <span className="flex-1 text-start">{p.name}</span>
                    <span className="tabular">{money(p.share, s.currency)}</span>
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      {edit && <SplitForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function SplitForm({ initial, onClose }: { initial: Partial<Split>; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings } = useData();
  const [title, setTitle] = useState(initial.title ?? '');
  const [currency, setCurrency] = useState(initial.currency ?? settings.baseCurrency);
  const [total, setTotal] = useState(initial.total ? String(initial.total) : '');
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  const [people, setPeople] = useState<SplitParticipant[]>(initial.participants ?? [{ name: t('split.me'), share: 0, paid: true }, { name: '', share: 0, paid: false }]);
  const [makeDebts, setMakeDebts] = useState(!initial.id);

  const totalV = parseAmount(total);
  const dec = defaultDecimals(currency);
  const shares = mode === 'equal' && people.length
    ? people.map((_, i) => {
        const base = round(totalV / people.length, dec);
        return i === 0 ? round(totalV - base * (people.length - 1), dec) : base; // first person absorbs rounding
      })
    : people.map((p) => p.share);
  const sumShares = round(shares.reduce((a, b) => a + b, 0), dec);
  const valid = !!title.trim() && totalV > 0 && people.every((p) => p.name.trim()) && Math.abs(sumShares - totalV) < 10 ** -dec;

  const setP = (i: number, patch: Partial<SplitParticipant>) => setPeople(people.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const submit = async () => {
    if (!valid) return;
    const participants = people.map((p, i) => ({ ...p, name: p.name.trim(), share: shares[i] }));
    await save<Split>('splits', { ...(initial as Split), title: title.trim(), currency, total: totalV, date: initial.date ?? isoDay(new Date()), participants });
    if (makeDebts) {
      for (const p of participants.slice(1)) {
        if (!p.paid) await create<Debt>('debts', { direction: 'owed', person: p.name, amount: p.share, currency, note: title.trim(), payments: [], remind: true });
      }
    }
    onClose();
  };
  const del = async () => { const u = await remove('splits', initial.id!); toast(t('common.deleted'), u); onClose(); };

  return (
    <Sheet open onClose={onClose} title={initial.id ? t('split.edit') : t('split.add')} tall
      footer={<div className="flex gap-2">{initial.id && <Button variant="danger" onClick={del}>{t('common.delete')}</Button>}<Button block disabled={!valid} onClick={submit}>{t('common.save')}</Button></div>}>
      <div className="space-y-4">
        <Field label={t('split.title')}><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder={t('split.titlePh')} /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label={t('split.total')}><Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
          <Field label={t('common.currency')}><CurrencyPicker compact value={currency} onChange={setCurrency} /></Field>
        </div>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'equal', label: t('split.equal') }, { value: 'custom', label: t('split.custom') }]} />
        <div className="space-y-2">
          {people.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={p.name} onChange={(e) => setP(i, { name: e.target.value })} placeholder={t('split.name')} className="flex-1" />
              {mode === 'custom'
                ? <Input inputMode="decimal" value={p.share || ''} onChange={(e) => setP(i, { share: parseAmount(e.target.value) })} className="w-28" />
                : <span className="w-24 text-end text-sm tabular text-muted">{shares[i]}</span>}
              {people.length > 2 && i > 0 && <button onClick={() => setPeople(people.filter((_, j) => j !== i))} className="p-2 text-muted hover:text-red-500" aria-label="remove"><Trash2 size={16} /></button>}
            </div>
          ))}
          <Button variant="soft" size="sm" onClick={() => setPeople([...people, { name: '', share: 0, paid: false }])}><Plus size={14} />{t('split.addPerson')}</Button>
          {mode === 'custom' && Math.abs(sumShares - totalV) >= 10 ** -dec && <p className="text-xs text-red-500">{t('split.mismatch', { sum: sumShares, total: totalV })}</p>}
        </div>
        {!initial.id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={makeDebts} onChange={(e) => setMakeDebts(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
            {t('split.makeDebts')}
          </label>
        )}
      </div>
    </Sheet>
  );
}
