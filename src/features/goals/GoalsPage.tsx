import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, Target } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, EmptyState, Field, ImagePicker, Input, PageHeader, Segmented } from '@/components/ui';
import { stagger } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { ColorPicker, CurrencyPicker, IconPicker } from '@/components/pickers';
import { ProgressRing } from '@/components/Progress';
import { useToast } from '@/components/Toast';
import { goalStatus } from '@/lib/stats';
import { Icon } from '@/lib/icons';
import { parseAmount } from '@/lib/format';
import { celebrate, MILESTONES } from '@/lib/confetti';
import { isoDay } from '@/lib/period';
import { create, remove, save, update } from '@/db/repo';
import { db } from '@/db/db';
import type { Goal, GoalEntry } from '@/db/types';

export function GoalsPage() {
  const { t } = useTranslation();
  const { goals, goalEntries, money, date, num } = useData();
  const [edit, setEdit] = useState<Partial<Goal> | null>(null);
  const [fund, setFund] = useState<Goal | null>(null);

  return (
    <div>
      <PageHeader back title={t('nav.goals')} action={<Button size="sm" onClick={() => setEdit({})}><Plus size={16} /> {t('common.add')}</Button>} />
      {!goals.length && <EmptyState icon={<Target size={36} />} title={t('empty.noGoals')} text={t('empty.noGoalsText')} action={<Button onClick={() => setEdit({})}>{t('goal.add')}</Button>} />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {goals.map((g, i) => {
          const s = goalStatus(g, goalEntries);
          return (
            <Card key={g.id} className="animate-rise overflow-hidden" style={stagger(i)}>
              {g.image && (
                <button onClick={() => setEdit(g)} className="relative -mx-4 -mt-4 mb-4 block h-36 w-[calc(100%+2rem)] overflow-hidden">
                  <img src={g.image} alt="" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-3 start-4 end-4 flex items-end justify-between text-white">
                    <span className="text-lg font-bold drop-shadow">{g.name}</span>
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-bold backdrop-blur">{num(Math.round(s.pct * 100))}%</span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><div className="h-full transition-all duration-1000" style={{ width: `${s.pct * 100}%`, background: g.color }} /></div>
                </button>
              )}
              <button className="flex w-full items-center gap-4 text-start" onClick={() => setEdit(g)}>
                <ProgressRing pct={s.pct} color={g.color} size={84} stroke={9}>
                  <div className="flex flex-col items-center"><Icon name={g.icon} size={20} style={{ color: g.color }} /><span>{num(Math.round(s.pct * 100))}%</span></div>
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-semibold">{g.name}</div>
                  <div className="tabular"><span className="font-bold">{money(s.saved, g.currency)}</span> <span className="text-sm text-muted">/ {money(g.target, g.currency)}</span></div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted">
                    {s.remaining <= 0 ? <div className="font-semibold text-emerald-600">🎉 {t('goal.reached')}</div> : (
                      <>
                        {s.perDayNeeded !== undefined && s.daysToDeadline !== undefined && (
                          s.daysToDeadline > 0
                            ? <div>{t('goal.perDay', { amount: money(s.perDayNeeded, g.currency), date: date(g.deadline!) })}</div>
                            : <div className="text-red-500">{t('goal.deadlinePassed')}</div>
                        )}
                        {s.eta && <div>{t('goal.eta', { date: date(isoDay(s.eta)) })}</div>}
                      </>
                    )}
                  </div>
                </div>
              </button>
              <div className="mt-3 flex gap-2">
                <Button variant="soft" block onClick={() => setFund(g)}><Plus size={16} />{t('goal.addMoney')}</Button>
              </div>
            </Card>
          );
        })}
      </div>
      {edit && <GoalForm initial={edit} onClose={() => setEdit(null)} />}
      {fund && <FundSheet goal={fund} onClose={() => setFund(null)} />}
    </div>
  );
}

function FundSheet({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { goalEntries, money, date } = useData();
  const [mode, setMode] = useState<'add' | 'withdraw'>('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const s = goalStatus(goal, goalEntries);

  const submit = async () => {
    const v = parseAmount(amount);
    if (!v) return;
    const before = s.pct * 100;
    await create<GoalEntry>('goalEntries', { goalId: goal.id, amount: mode === 'add' ? v : -v, date: isoDay(new Date()), note });
    const after = ((s.saved + (mode === 'add' ? v : -v)) / goal.target) * 100;
    // Celebrate each newly-crossed milestone once.
    const crossed = MILESTONES.filter((m) => before < m && after >= m && !goal.milestones.includes(m));
    if (crossed.length) {
      celebrate(Math.max(...crossed));
      await update<Goal>('goals', goal.id, { milestones: [...goal.milestones, ...crossed] });
      toast(t('goal.milestone', { pct: Math.max(...crossed) }));
    }
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={goal.name} footer={<Button block disabled={!parseAmount(amount)} onClick={submit}>{t('common.save')}</Button>}>
      <div className="space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'add', label: <span className="inline-flex items-center gap-1"><Plus size={14} />{t('goal.deposit')}</span> }, { value: 'withdraw', label: <span className="inline-flex items-center gap-1"><Minus size={14} />{t('goal.withdraw')}</span> }]} />
        <Field label={`${t('budget.amount')} (${goal.currency})`}><Input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={t('tx.note')}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {s.entries.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted">{t('goal.history')}</div>
            <ul className="divide-y divide-line text-sm">
              {[...s.entries].reverse().map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <span>{date(e.date)} {e.note && <span className="text-muted">· {e.note}</span>}</span>
                  <span className="flex items-center gap-2">
                    <span className={`tabular font-medium ${e.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{money(e.amount, goal.currency, { sign: true })}</span>
                    <button className="text-xs text-muted hover:text-red-500" onClick={async () => { const u = await remove('goalEntries', e.id); toast(t('common.deleted'), u); }}>✕</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function GoalForm({ initial, onClose }: { initial: Partial<Goal>; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings } = useData();
  const [g, setG] = useState<Partial<Goal>>({ name: '', currency: settings.baseCurrency, icon: 'target', color: '#1baf7a', milestones: [], ...initial });
  const [target, setTarget] = useState(initial.target ? String(initial.target) : '');
  const set = <K extends keyof Goal>(k: K, v: Goal[K]) => setG((p) => ({ ...p, [k]: v }));
  const valid = !!g.name?.trim() && parseAmount(target) > 0;

  const submit = async () => {
    if (!valid) return;
    await save<Goal>('goals', { ...(g as Goal), name: g.name!.trim(), target: parseAmount(target), deadline: g.deadline || undefined });
    onClose();
  };
  const del = async () => {
    const entryIds = (await db.goalEntries.where('goalId').equals(initial.id!).primaryKeys()) as string[];
    const u1 = await remove('goalEntries', entryIds);
    const u2 = await remove('goals', initial.id!);
    toast(t('common.deleted'), async () => { await u2(); await u1(); });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={initial.id ? t('goal.edit') : t('goal.add')} tall
      footer={<div className="flex gap-2">{initial.id && <Button variant="danger" onClick={del}>{t('common.delete')}</Button>}<Button block disabled={!valid} onClick={submit}>{t('common.save')}</Button></div>}>
      <div className="space-y-4">
        <Field label={t('goal.name')}><Input value={g.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder={t('goal.namePh')} /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label={t('goal.target')}><Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
          <Field label={t('common.currency')}><CurrencyPicker compact value={g.currency!} onChange={(c) => set('currency', c)} /></Field>
        </div>
        <Field label={t('goal.deadline')}><Input type="date" value={g.deadline ?? ''} onChange={(e) => set('deadline', e.target.value)} /></Field>
        <div>
          <span className="m-label mb-1.5 block">{t('goal.picture')}</span>
          <ImagePicker value={g.image} onChange={(v) => set('image', v)} maxSide={1000} />
        </div>
        <Field label={t('common.color')}><ColorPicker value={g.color!} onChange={(v) => set('color', v)} /></Field>
        <Field label={t('common.icon')}><IconPicker value={g.icon!} onChange={(v) => set('icon', v)} color={g.color!} /></Field>
      </div>
    </Sheet>
  );
}
