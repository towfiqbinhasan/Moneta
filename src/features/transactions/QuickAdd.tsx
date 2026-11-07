import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ChevronDown, Repeat, Star, Trash2, X } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Numpad } from '@/components/Numpad';
import { AccountChips, CategoryGrid, CurrencyPicker } from '@/components/pickers';
import { Button, Field, Input, Segmented, Toggle, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useData } from '@/hooks/useData';
import { create, patchSettings, remove, save, update } from '@/db/repo';
import type { Period, Recurring, Template, Transaction, TxType } from '@/db/types';
import { defaultDecimals } from '@/lib/currency';
import { isoDateTime } from '@/lib/period';
import { toCur } from '@/lib/stats';
import { compressImage, cx, evalExpression, round } from '@/lib/utils';
import { nextOccurrence } from '@/lib/recurring';
import { parseAmount } from '@/lib/format';
import type { AddOptions } from '../AppShell';
import { haptic } from '@/components/motion';

/**
 * Quick add / edit. Designed for "< 5 seconds": the numpad is ready
 * immediately, the last account is remembered, categories are big tiles, and
 * templates fill everything in one tap. Physical keyboards work too.
 */
export function QuickAdd({ options, onClose }: { options: AddOptions; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings, accounts, categories, templates, trips, ctx, money } = useData();
  const editing = options.tx;
  const trip = trips.find((x) => x.id === settings.activeTripId);
  const liveAccounts = accounts.filter((a) => !a.archived);

  const firstAccount = liveAccounts.find((a) => a.id === settings.lastAccountId) ?? liveAccounts[0];
  const init = editing ?? options.prefill;

  const [type, setType] = useState<TxType>(editing?.type ?? options.type ?? options.prefill?.type ?? 'expense');
  const [expr, setExpr] = useState(init?.amount ? String(init.amount) : '');
  const [accountId, setAccountId] = useState(init?.accountId ?? firstAccount?.id ?? '');
  const account = accounts.find((a) => a.id === accountId);
  const [currency, setCurrency] = useState(init?.currency ?? (trip?.currency || account?.currency || settings.baseCurrency));
  const [categoryId, setCategoryId] = useState<string | undefined>(init?.categoryId);
  const [toAccountId, setToAccountId] = useState(init?.toAccountId ?? liveAccounts.find((a) => a.id !== accountId)?.id ?? '');
  const [toAmountStr, setToAmountStr] = useState(() => {
    const from = accounts.find((a) => a.id === editing?.accountId), to = accounts.find((a) => a.id === editing?.toAccountId);
    return editing?.toAmount && from && to && from.currency !== to.currency ? String(editing.toAmount) : '';
  });
  const [date, setDate] = useState(editing?.date ?? isoDateTime(new Date()));
  const [note, setNote] = useState(init?.note ?? '');
  const [tags, setTags] = useState<string[]>(init?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [receipt, setReceipt] = useState<string | undefined>(editing?.receipt ?? options.receipt);
  const [details, setDetails] = useState(!!options.receipt || (!!editing && !!(editing.note || editing.tags.length || editing.receipt)));
  const [repeat, setRepeat] = useState<Period | ''>('');
  const [asTemplate, setAsTemplate] = useState(false);
  const [shaking, setShaking] = useState(false);
  const saving = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const amount = round(evalExpression(expr), defaultDecimals(currency));
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const crossTransfer = type === 'transfer' && toAccount && account && toAccount.currency !== account.currency;
  const autoToAmount = crossTransfer ? round(toCur(amount, account!.currency, toAccount!.currency, ctx), defaultDecimals(toAccount!.currency)) : amount;

  // Transfers always use the source account's currency.
  useEffect(() => {
    if (type === 'transfer' && account) setCurrency(account.currency);
  }, [type, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When switching account on a fresh entry, follow its currency (unless in trip mode).
  const pickAccount = (id: string) => {
    setAccountId(id);
    const a = accounts.find((x) => x.id === id);
    if (!editing && !trip && a) setCurrency(a.currency);
  };

  // Default category per type.
  useEffect(() => {
    if (type === 'transfer') return;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat || cat.kind !== type) setCategoryId(undefined);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const kindTemplates = useMemo(() => templates.filter((x) => x.type === type).slice(0, 8), [templates, type]);

  const applyTemplate = (tp: Template) => {
    setExpr(String(tp.amount));
    setCurrency(tp.currency);
    setAccountId(tp.accountId);
    setCategoryId(tp.categoryId);
    if (tp.toAccountId) setToAccountId(tp.toAccountId);
    setNote(tp.note);
    setTags(tp.tags);
    update<Template>('templates', tp.id, { uses: tp.uses + 1 });
  };

  const canSave = amount > 0 && !!accountId && !!date.trim() && (type !== 'transfer' || (!!toAccountId && toAccountId !== accountId));

  async function submit() {
    if (saving.current) return;
    if (!canSave) { setShaking(true); setTimeout(() => setShaking(false), 450); haptic([15, 30, 15]); return; }
    saving.current = true;
    try {
    const sameMoney = editing && editing.amount === amount && editing.currency === currency && editing.accountId === accountId;
    const accountAmount = type !== 'transfer' && account && account.currency !== currency
      ? (sameMoney && editing.accountAmount !== undefined ? editing.accountAmount : round(toCur(amount, currency, account.currency, ctx), defaultDecimals(account.currency)))
      : undefined;
    const data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } = {
      id: editing?.id,
      type,
      amount,
      currency,
      accountId,
      accountAmount,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      toAmount: type === 'transfer' ? (crossTransfer && toAmountStr ? parseAmount(toAmountStr) : crossTransfer && sameMoney && editing.toAccountId === toAccountId && editing.toAmount ? editing.toAmount : autoToAmount) : undefined,
      categoryId: type === 'transfer' ? undefined : categoryId,
      date: date.trim() || isoDateTime(new Date()),
      note: note.trim(),
      tags,
      receipt,
      tripId: editing ? editing.tripId : trip?.id,
      recurringId: editing?.recurringId,
    };
    if (editing) {
      const undo = await update<Transaction>('transactions', editing.id, data as Partial<Transaction>);
      toast(t('tx.updated'), undo);
    } else {
      const tx = await create<Transaction>('transactions', data);
      let ruleId: string | undefined;
      if (repeat) {
        const rule = await create<Recurring>('recurring', {
          type, amount, currency, accountId, toAccountId: data.toAccountId, categoryId: data.categoryId, note: data.note, tags,
          frequency: repeat, interval: 1, nextDate: nextOccurrence(date.slice(0, 10), repeat), active: true,
        });
        ruleId = rule.id;
        await update<Transaction>('transactions', tx.id, { recurringId: rule.id });
      }
      if (asTemplate) {
        await save<Template>('templates', {
          name: note.trim() || categories.find((c) => c.id === categoryId)?.name || t(`tx.${type}`),
          type, amount, currency, accountId, toAccountId: data.toAccountId, categoryId: data.categoryId, note: data.note, tags, uses: 1,
        });
      }
      await patchSettings({ lastAccountId: accountId });
      toast(t('tx.saved', { amount: money(amount, currency) }), async () => {
        if (ruleId) await remove('recurring', ruleId);
        await remove('transactions', tx.id);
      });
    }
    onClose();
    } finally { saving.current = false; }
  }

  async function del() {
    if (!editing) return;
    const undo = await remove('transactions', editing.id);
    toast(t('tx.deleted'), undo);
    onClose();
  }

  // Physical keyboard support (when not typing in a text field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return;
      if (/^[0-9.,+\-*/]$/.test(e.key)) {
        e.preventDefault();
        const k = e.key === '*' ? '×' : e.key === '/' ? '÷' : e.key === ',' ? '.' : e.key;
        // One decimal point per number, like the on-screen numpad.
        setExpr((v) => (k === '.' && /\.\d*$/.test(v) ? v : v + k));
      } else if (e.key === 'Backspace') setExpr((v) => v.slice(0, -1));
      else if (e.key === 'Enter' && el.tagName !== 'BUTTON') { e.preventDefault(); submit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addTag = () => {
    const v = tagInput.trim().replace(/^#/, '').replace(/\s+/g, '-');
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput('');
  };

  const color = type === 'income' ? '#16a34a' : type === 'transfer' ? 'rgb(var(--brand))' : 'rgb(var(--ink))';

  return (
    <Sheet
      open
      onClose={onClose}
      tall
      title={editing ? t('tx.edit') : t('tx.add')}
      footer={
        <div className="space-y-3">
          <Numpad value={expr} onChange={setExpr} decimals={defaultDecimals(currency)} />
          <div className="flex gap-2">
            {editing && (
              <Button variant="danger" size="lg" onClick={del} aria-label={t('common.delete')}>
                <Trash2 size={20} />
              </Button>
            )}
            <Button size="lg" block className={canSave ? '' : 'opacity-60'} onClick={submit}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      }
    >
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: t('tx.expense') },
          { value: 'income', label: t('tx.income') },
          { value: 'transfer', label: t('tx.transfer') },
        ]}
      />

      {/* Amount display */}
      <div className="my-4 flex items-center justify-center gap-3">
        {type !== 'transfer' ? <CurrencyPicker compact value={currency} onChange={setCurrency} /> : <span className="rounded-2xl bg-ink/5 px-3 py-1.5 text-sm font-semibold">{currency}</span>}
        <div className="min-w-0 text-end">
          <div key={`${expr.length}-${shaking}`} className={cx('truncate text-[2.6rem] font-bold leading-tight tracking-tight tabular', shaking ? 'animate-shake' : expr && 'animate-pop')} style={{ color }} dir="ltr">
            {expr ? expr.replace(/\./g, settings.decimalSep) : <span className="opacity-30">0</span>}
          </div>
          {/[+\-×÷]/.test(expr) && <div className="text-sm text-muted">= {money(amount, currency)}</div>}
          {currency !== settings.baseCurrency && amount > 0 && (
            <div className="text-xs text-muted">≈ {money(toCur(amount, currency, settings.baseCurrency, ctx), settings.baseCurrency)}</div>
          )}
        </div>
      </div>

      {/* Templates — one tap */}
      {!editing && kindTemplates.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {kindTemplates.map((tp) => (
            <button key={tp.id} onClick={() => applyTemplate(tp)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-3 text-sm font-medium text-amber-700 dark:text-amber-300">
              <Star size={14} /> {tp.name} · {money(tp.amount, tp.currency, { trim: true })}
            </button>
          ))}
        </div>
      )}

      {type === 'transfer' ? (
        <div className="space-y-3">
          <Field label={t('tx.from')}><AccountChips accounts={accounts} value={accountId} onChange={pickAccount} /></Field>
          <Field label={t('tx.to')}><AccountChips accounts={accounts} value={toAccountId} onChange={setToAccountId} exclude={accountId} /></Field>
          {crossTransfer && (
            <Field label={t('tx.received', { currency: toAccount!.currency })} hint={t('tx.rateHint')}>
              <Input inputMode="decimal" value={toAmountStr} placeholder={String(autoToAmount)} onChange={(e) => setToAmountStr(e.target.value)} />
            </Field>
          )}
        </div>
      ) : (
        <>
          <CategoryGrid categories={categories} value={categoryId} onChange={setCategoryId} kind={type} />
          <div className="mt-3">
            <AccountChips accounts={accounts} value={accountId} onChange={pickAccount} />
          </div>
        </>
      )}

      {/* Details */}
      <button onClick={() => setDetails(!details)} className="mt-3 flex w-full items-center gap-2 py-2 text-sm font-medium text-muted">
        <ChevronDown size={16} className={cx('transition', details && 'rotate-180')} /> {t('tx.details')}
        <span className="ms-auto text-xs">{date.replace('T', ' ')}</span>
      </button>
      {details && (
        <div className="space-y-3 animate-fade-in">
          <Field label={t('tx.date')}>
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('tx.note')}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('tx.notePh')} />
          </Field>
          <Field label={t('tx.tags')}>
            <div className="flex flex-wrap gap-2">
              {tags.map((tg) => (
                <span key={tg} className="inline-flex h-8 items-center gap-1 rounded-full bg-brand/10 px-3 text-sm text-brand">
                  #{tg}
                  <button onClick={() => setTags(tags.filter((x) => x !== tg))} aria-label="remove"><X size={14} /></button>
                </span>
              ))}
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); addTag(); } }}
                onBlur={addTag}
                placeholder="#work #family #trip"
                className="h-9 flex-1 min-w-[140px]"
              />
            </div>
          </Field>
          <div className="flex items-center gap-3">
            <Button variant="soft" onClick={() => fileRef.current?.click()}><Camera size={18} /> {t('tx.receipt')}</Button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setReceipt(await compressImage(f)); }} />
            {receipt && (
              <div className="relative">
                <img src={receipt} alt="" className="h-14 w-14 rounded-xl object-cover" />
                <button onClick={() => setReceipt(undefined)} className="absolute -end-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-surface" aria-label="remove"><X size={12} /></button>
              </div>
            )}
          </div>
          {!editing && (
            <>
              <Field label={t('tx.repeat')}>
                <div className="flex items-center gap-2">
                  <Repeat size={18} className="text-muted" />
                  <Select value={repeat} onChange={(e) => setRepeat(e.target.value as Period | '')}>
                    <option value="">{t('tx.noRepeat')}</option>
                    {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => <option key={p} value={p}>{t(`period.${p}`)}</option>)}
                  </Select>
                </div>
              </Field>
              <Toggle checked={asTemplate} onChange={setAsTemplate} label={t('tx.saveTemplate')} />
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
