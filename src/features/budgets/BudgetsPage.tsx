import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PiggyBank, Plus } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, Chip, EmptyState, Field, Input, PageHeader, Segmented, Toggle } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { CurrencyPicker } from '@/components/pickers';
import { ProgressBar, StateBadge } from '@/components/Progress';
import { useToast } from '@/components/Toast';
import { budgetStatus } from '@/lib/stats';
import { Icon } from '@/lib/icons';
import { parseAmount } from '@/lib/format';
import { remove, save } from '@/db/repo';
import type { Budget, Period } from '@/db/types';

export function BudgetsPage() {
  const { t } = useTranslation();
  const { budgets, transactions, ctx, money, num, categories, date } = useData();
  const [edit, setEdit] = useState<Partial<Budget> | null>(null);

  return (
    <div>
      <PageHeader back title={t('nav.budgets')} action={<Button size="sm" onClick={() => setEdit({})}><Plus size={16} /> {t('common.add')}</Button>} />
      {!budgets.length && (
        <EmptyState icon={<PiggyBank size={36} />} title={t('empty.noBudgets')} text={t('empty.noBudgetsText')} action={<Button onClick={() => setEdit({})}>{t('budget.add')}</Button>} />
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {budgets.map((b) => {
          const s = budgetStatus(b, transactions, ctx);
          const cats = b.categoryIds.map((id) => categories.find((c) => c.id === id)).filter(Boolean);
          return (
            <Card key={b.id} onClick={() => setEdit(b)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{b.name}</div>
                  <div className="text-xs text-muted">
                    {t(`period.${b.period}`)} · {date(s.range.start.toISOString(), 'd MMM')} – {date(s.range.end.toISOString(), 'd MMM')}
                  </div>
                </div>
                <StateBadge state={s.state} />
              </div>
              <div className="my-3 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular">{money(s.spent, b.currency)}</span>
                <span className="text-sm text-muted tabular">/ {money(s.limit, b.currency)}</span>
              </div>
              <ProgressBar pct={s.pct} state={s.state} />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted">
                <span>{s.state === 'over' ? t('budget.overBy', { amount: money(s.spent - s.limit, b.currency) }) : t('budget.left', { amount: money(s.limit - s.spent, b.currency) })}</span>
                {s.carry > 0 && <span>{t('budget.carried', { amount: money(s.carry, b.currency) })}</span>}
              </div>
              {s.state !== 'over' && b.period !== 'daily' && (
                <div className="mt-2 rounded-xl bg-brand/5 px-3 py-2 text-sm text-ink">💡 {t('budget.perDay', { amount: money(s.perDay, b.currency), days: num(s.daysLeft) })}</div>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {cats.length ? cats.map((c) => (
                  <span key={c!.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: c!.color + '1f', color: c!.color }}><Icon name={c!.icon} size={11} />{c!.name}</span>
                )) : <span className="text-[11px] text-muted">{t('budget.allCategories')}</span>}
              </div>
            </Card>
          );
        })}
      </div>
      {edit && <BudgetForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function BudgetForm({ initial, onClose }: { initial: Partial<Budget>; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings, categories } = useData();
  const [b, setB] = useState<Partial<Budget>>({ name: '', period: 'monthly', currency: settings.baseCurrency, categoryIds: [], rollover: false, alertPercent: 80, ...initial });
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '');
  const set = <K extends keyof Budget>(k: K, v: Budget[K]) => setB((p) => ({ ...p, [k]: v }));
  const parents = categories.filter((c) => c.kind === 'expense' && !c.parentId);
  const toggleCat = (id: string) => set('categoryIds', b.categoryIds!.includes(id) ? b.categoryIds!.filter((x) => x !== id) : [...b.categoryIds!, id]);

  const autoName = b.categoryIds!.length ? b.categoryIds!.map((id) => categories.find((c) => c.id === id)?.name).join(', ') : t('budget.overall');
  const valid = parseAmount(amount) > 0;

  const submit = async () => {
    if (!valid) return;
    await save<Budget>('budgets', { ...(b as Budget), name: b.name?.trim() || autoName, amount: parseAmount(amount) });
    onClose();
  };
  const del = async () => {
    const undo = await remove('budgets', initial.id!);
    toast(t('common.deleted'), undo);
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={initial.id ? t('budget.edit') : t('budget.add')} tall
      footer={<div className="flex gap-2">{initial.id && <Button variant="danger" onClick={del}>{t('common.delete')}</Button>}<Button block disabled={!valid} onClick={submit}>{t('common.save')}</Button></div>}>
      <div className="space-y-4">
        <Field label={t('budget.period')}>
          <Segmented<Period> value={b.period!} onChange={(v) => set('period', v)} options={(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => ({ value: p, label: t(`period.${p}`) }))} />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label={t('budget.amount')}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
          <Field label={t('common.currency')}><CurrencyPicker compact value={b.currency!} onChange={(c) => set('currency', c)} /></Field>
        </div>
        <Field label={t('budget.categories')} hint={t('budget.categoriesHint')}>
          <div className="flex flex-wrap gap-2">
            {parents.map((c) => (
              <Chip key={c.id} active={b.categoryIds!.includes(c.id)} color={c.color} onClick={() => toggleCat(c.id)}>
                <Icon name={c.icon} size={14} />{c.name}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label={t('budget.name')}><Input value={b.name} onChange={(e) => set('name', e.target.value)} placeholder={autoName} /></Field>
        <Field label={t('budget.alertAt', { pct: b.alertPercent })}>
          <input type="range" min={50} max={100} step={5} value={b.alertPercent} onChange={(e) => set('alertPercent', +e.target.value)} className="w-full accent-[rgb(var(--brand))]" />
        </Field>
        <Toggle checked={!!b.rollover} onChange={(v) => set('rollover', v)} label={t('budget.rollover')} desc={t('budget.rolloverDesc')} />
      </div>
    </Sheet>
  );
}
