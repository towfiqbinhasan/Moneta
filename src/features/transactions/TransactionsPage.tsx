import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsDesktop } from '@/hooks/useMedia';
import { TxTable } from './TxTable';
import { useTranslation } from 'react-i18next';
import { Receipt } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import { EMPTY_FILTER, FilterBar, useFiltered, type TxFilter } from './Filters';
import { TxGroupedList } from './TxList';
import { useQuickAdd } from '../AppShell';
import { totals } from '@/lib/stats';

const PAGE = 60;

export function TransactionsPage() {
  const { t } = useTranslation();
  const { transactions, ctx, money } = useData();
  const openAdd = useQuickAdd();
  const [params] = useSearchParams();
  const desktop = useIsDesktop();
  // Deep links from the command palette: /transactions?category=…, ?account=…, ?q=…
  const [filter, setFilter] = useState<TxFilter>({ ...EMPTY_FILTER, q: params.get('q') ?? '', categoryId: params.get('category') ?? '', accountId: params.get('account') ?? '' });
  const [limit, setLimit] = useState(PAGE);
  const list = useFiltered(transactions, filter);
  const tt = totals(list, ctx);

  return (
    <div>
      <PageHeader title={t('nav.transactions')} subtitle={t('tx.count', { count: list.length })} />
      <FilterBar value={filter} onChange={(f) => { setFilter(f); setLimit(PAGE); }} />
      {list.length > 0 && (
        <div className="my-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div className="m-card p-3 "><div className="text-xs text-muted">{t('tx.income')}</div><div className="font-semibold tabular text-emerald-600 dark:text-emerald-400">{money(tt.income)}</div></div>
          <div className="m-card p-3 "><div className="text-xs text-muted">{t('tx.expense')}</div><div className="font-semibold tabular">{money(tt.expense)}</div></div>
          <div className="m-card hidden p-3 md:block"><div className="text-xs text-muted">{t('report.net')}</div><div className={`font-semibold tabular ${tt.net < 0 ? 'text-red-500' : ''}`}>{money(tt.net, undefined, { sign: true })}</div></div>
          <div className="m-card hidden p-3 md:block"><div className="text-xs text-muted">{t('table.hint')}</div><div className="truncate text-xs text-muted">{t('table.hintText')}</div></div>
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState
          icon={<Receipt size={36} />}
          title={transactions.length ? t('empty.noMatch') : t('empty.noTx')}
          text={transactions.length ? undefined : t('empty.noTxText')}
          action={!transactions.length && <Button onClick={() => openAdd()}>{t('tx.add')}</Button>}
        />
      ) : (
        <>
          {desktop ? <TxTable txs={list.slice(0, limit)} /> : <TxGroupedList txs={list.slice(0, limit)} />}
          {list.length > limit && (
            <Button variant="soft" block className="mt-4" onClick={() => setLimit(limit + PAGE)}>{t('common.loadMore')}</Button>
          )}
        </>
      )}
    </div>
  );
}
