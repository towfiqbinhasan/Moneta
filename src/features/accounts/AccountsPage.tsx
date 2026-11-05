import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowLeftRight, ArrowUp, Plus, Wallet } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, EmptyState, Field, IconTile, Input, PageHeader, Select, Toggle } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { ColorPicker, CurrencyPicker, IconPicker } from '@/components/pickers';
import { useToast } from '@/components/Toast';
import { Icon } from '@/lib/icons';
import { accountBalance, netWorth } from '@/lib/stats';
import { remove, save, update } from '@/db/repo';
import { db } from '@/db/db';
import type { Account, AccountKind } from '@/db/types';
import { WALLET_SUGGESTIONS } from '@/db/defaults';
import { parseAmount } from '@/lib/format';
import { useQuickAdd } from '../AppShell';

const KIND_ICON: Record<AccountKind, string> = { cash: 'banknote', bank: 'landmark', card: 'credit-card', wallet: 'smartphone', other: 'wallet' };

export function AccountsPage() {
  const { t } = useTranslation();
  const { accounts, transactions, ctx, money } = useData();
  const openAdd = useQuickAdd();
  const [edit, setEdit] = useState<Partial<Account> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const list = accounts.filter((a) => showArchived || !a.archived);

  const move = async (a: Account, dir: -1 | 1) => {
    const i = accounts.indexOf(a);
    const other = accounts[i + dir];
    if (!other) return;
    await update<Account>('accounts', a.id, { order: other.order });
    await update<Account>('accounts', other.id, { order: a.order });
  };

  return (
    <div>
      <PageHeader back title={t('nav.accounts')} action={<Button size="sm" onClick={() => setEdit({})}><Plus size={16} /> {t('common.add')}</Button>} />
      <Card className="mb-3 bg-gradient-to-br from-brand to-brand/70 text-white ring-0">
        <div className="text-sm opacity-90">{t('dash.netWorth')}</div>
        <div className="text-3xl font-bold tabular">{money(netWorth(accounts, transactions, ctx))}</div>
        <Button variant="ghost" size="sm" className="mt-2 bg-white/15 text-white hover:bg-white/25" onClick={() => openAdd({ type: 'transfer' })}>
          <ArrowLeftRight size={14} /> {t('tx.transfer')}
        </Button>
      </Card>
      {!list.length && <EmptyState icon={<Wallet size={36} />} title={t('empty.noAccounts')} text={t('empty.noAccountsText')} />}
      <div className="space-y-2">
        {list.map((a, i) => (
          <Card key={a.id} className="flex items-center gap-3 !p-3">
            <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => setEdit(a)}>
              <IconTile color={a.color} size={44}><Icon name={a.icon} size={22} /></IconTile>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{a.name} {a.archived && <span className="text-xs text-muted">({t('acc.archived')})</span>}</span>
                <span className="block text-xs text-muted">{t(`acc.kind.${a.kind}`)} · {a.currency}{!a.includeInTotal && ` · ${t('acc.excluded')}`}</span>
              </span>
              <span className="font-bold tabular">{money(accountBalance(a, transactions), a.currency)}</span>
            </button>
            <div className="flex flex-col">
              <button aria-label="up" disabled={i === 0} onClick={() => move(a, -1)} className="text-muted disabled:opacity-20"><ArrowUp size={16} /></button>
              <button aria-label="down" disabled={i === list.length - 1} onClick={() => move(a, 1)} className="text-muted disabled:opacity-20"><ArrowDown size={16} /></button>
            </div>
          </Card>
        ))}
      </div>
      {accounts.some((a) => a.archived) && (
        <button className="mt-4 text-sm font-medium text-brand" onClick={() => setShowArchived(!showArchived)}>{showArchived ? t('acc.hideArchived') : t('acc.showArchived')}</button>
      )}
      {edit && <AccountForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

export function AccountForm({ initial, onClose }: { initial: Partial<Account>; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings, accounts, transactions } = useData();
  const [a, setA] = useState<Partial<Account>>({
    name: '', kind: 'cash', currency: settings.baseCurrency, openingBalance: 0, icon: 'banknote', color: '#1baf7a',
    archived: false, includeInTotal: true, ...initial,
  });
  const [opening, setOpening] = useState(String(initial.openingBalance ?? ''));
  const set = <K extends keyof Account>(k: K, v: Account[K]) => setA((p) => ({ ...p, [k]: v }));
  const used = initial.id ? transactions.some((x) => x.accountId === initial.id || x.toAccountId === initial.id) : false;

  const submit = async () => {
    if (!a.name?.trim()) return;
    await save<Account>('accounts', { ...(a as Account), name: a.name.trim(), openingBalance: parseAmount(opening), order: a.order ?? accounts.length });
    onClose();
  };

  const del = async () => {
    if (!initial.id) return;
    if (used && !confirm(t('acc.deleteConfirm'))) return;
    const txIds = (await db.transactions.filter((x) => x.accountId === initial.id || x.toAccountId === initial.id).primaryKeys()) as string[];
    const u1 = await remove('transactions', txIds);
    const u2 = await remove('accounts', initial.id);
    toast(t('common.deleted'), async () => { await u2(); await u1(); });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={initial.id ? t('acc.edit') : t('acc.add')} tall
      footer={<div className="flex gap-2">{initial.id && <Button variant="danger" onClick={del}>{t('common.delete')}</Button>}<Button block disabled={!a.name?.trim()} onClick={submit}>{t('common.save')}</Button></div>}>
      <div className="space-y-4">
        <Field label={t('acc.name')}>
          <Input value={a.name} onChange={(e) => set('name', e.target.value)} placeholder="bKash, PayPal, …" list="wallet-names" autoFocus />
          <datalist id="wallet-names">{WALLET_SUGGESTIONS.map((w) => <option key={w} value={w} />)}</datalist>
        </Field>
        <Field label={t('acc.type')}>
          <Select value={a.kind} onChange={(e) => { const k = e.target.value as AccountKind; setA((p) => ({ ...p, kind: k, icon: KIND_ICON[k] })); }}>
            {(['cash', 'bank', 'card', 'wallet', 'other'] as const).map((k) => <option key={k} value={k}>{t(`acc.kind.${k}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('common.currency')} hint={used ? t('acc.currencyHint') : undefined}>
          <CurrencyPicker value={a.currency!} onChange={(c) => set('currency', c)} />
        </Field>
        <Field label={t('acc.opening')} hint={a.kind === 'card' ? t('acc.cardHint') : undefined}>
          <Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
        </Field>
        <Field label={t('common.color')}><ColorPicker value={a.color!} onChange={(c) => set('color', c)} /></Field>
        <Field label={t('common.icon')}><IconPicker value={a.icon!} onChange={(c) => set('icon', c)} color={a.color!} /></Field>
        <Toggle checked={!!a.includeInTotal} onChange={(v) => set('includeInTotal', v)} label={t('acc.include')} />
        {initial.id && <Toggle checked={!!a.archived} onChange={(v) => set('archived', v)} label={t('acc.archive')} desc={t('acc.archiveDesc')} />}
      </div>
    </Sheet>
  );
}
