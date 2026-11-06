import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, FileText, Lightbulb } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, IconTile, Input, PageHeader, Segmented, Field } from '@/components/ui';
import { CategoryDonut, DailyBars } from '@/components/charts';
import { ProgressBar } from '@/components/Progress';
import { Icon } from '@/lib/icons';
import { inRange, isoDay, rangeFor, shiftRange, type Range } from '@/lib/period';
import { byCategory, insights, toBase, totals } from '@/lib/stats';
import { exportCSV, exportPDF, exportXLSX } from '@/lib/export';
import { toDigits } from '@/lib/format';
import { cx } from '@/lib/utils';
import type { Period } from '@/db/types';
import { TxGroupedList } from '../transactions/TxList';
import { EMPTY_FILTER, FilterBar, useFiltered } from '../transactions/Filters';

type Mode = Period | 'custom';

export function ReportsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'overview' | 'calendar'>('overview');
  return (
    <div>
      <PageHeader title={t('nav.reports')} />
      <Segmented value={tab} onChange={setTab} className="mb-3" options={[{ value: 'overview', label: t('report.overview') }, { value: 'calendar', label: t('report.calendar') }]} />
      {tab === 'overview' ? <Overview /> : <CalendarView />}
    </div>
  );
}

function Overview() {
  const { t } = useTranslation();
  const d = useData();
  const { settings, transactions, ctx, money, date } = d;
  const [mode, setMode] = useState<Mode>('monthly');
  const [ref, setRef] = useState(new Date());
  const [from, setFrom] = useState(isoDay(addDays(new Date(), -30)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [catSel, setCatSel] = useState<string>('');

  const range: Range = useMemo(() => {
    if (mode !== 'custom') return rangeFor(mode, ref, settings);
    const d1 = from ? new Date(from + 'T00:00') : new Date();
    const d2 = to ? new Date(to + 'T23:59:59') : new Date();
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return rangeFor('monthly', ref, settings);
    return d1 <= d2 ? { start: d1, end: d2 } : { start: new Date(to + 'T00:00'), end: new Date(from + 'T23:59:59') };
  }, [mode, ref, settings, from, to]);
  const inPeriod = useMemo(() => transactions.filter((x) => inRange(x.date, range)), [transactions, range.start.getTime(), range.end.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useFiltered(inPeriod, { ...filter, categoryId: catSel || filter.categoryId });
  const tt = totals(filtered, ctx);
  const cats = byCategory(filtered, ctx);
  const incomeCats = byCategory(filtered, ctx, 'income');

  // Trend: per day for ≤ 62 days, otherwise per month.
  const days = differenceInCalendarDays(range.end, range.start) + 1;
  const trend = useMemo(() => {
    if (days <= 62) {
      return eachDayOfInterval({ start: range.start, end: range.end }).map((day) => {
        const k = isoDay(day);
        const v = filtered.filter((x) => x.type === 'expense' && x.date.startsWith(k)).reduce((a, x) => a + toBase(x.amount, x.currency, ctx), 0);
        return { label: date(day, 'd'), value: v, tip: date(day, 'EEE, d MMM') };
      });
    }
    const out: { label: string; value: number; tip: string }[] = [];
    for (let m = startOfMonth(range.start); m <= range.end; m = addMonths(m, 1)) {
      const k = isoDay(m).slice(0, 7);
      const v = filtered.filter((x) => x.type === 'expense' && x.date.startsWith(k)).reduce((a, x) => a + toBase(x.amount, x.currency, ctx), 0);
      out.push({ label: date(m, 'MMM'), value: v, tip: date(m, 'MMMM yyyy') });
    }
    return out;
  }, [filtered, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = `${date(range.start)} – ${date(range.end)}`;
  const exp = { settings, accounts: d.accounts, categories: d.categories, t };
  const tips = mode === 'monthly' && isoDay(ref) === isoDay(new Date()) ? insights(transactions, ctx) : [];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {(['daily', 'weekly', 'monthly', 'yearly', 'custom'] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setRef(new Date()); }} className={cx('h-9 shrink-0 rounded-full px-4 text-sm font-medium', mode === m ? 'bg-ink text-surface' : 'bg-ink/5')}>{t(`period.${m}`)}</button>
        ))}
      </div>
      {mode === 'custom' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('filter.from')}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label={t('filter.to')}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      ) : (
        <div className="flex items-center justify-between m-card px-2 py-1 ">
          <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" onClick={() => setRef(shiftRange(mode, ref, -1))} aria-label="prev"><ChevronLeft className="rtl:rotate-180" /></button>
          <span className="text-sm font-semibold">{title}</span>
          <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" onClick={() => setRef(shiftRange(mode, ref, 1))} aria-label="next"><ChevronRight className="rtl:rotate-180" /></button>
        </div>
      )}

      <FilterBar value={filter} onChange={setFilter} />

      <div className="grid grid-cols-3 gap-2">
        {([['income', tt.income, 'text-emerald-600 dark:text-emerald-400'], ['expense', tt.expense, ''], ['net', tt.net, tt.net < 0 ? 'text-red-500' : '']] as const).map(([k, v, c]) => (
          <Card key={k} className="!p-3 text-center">
            <div className="text-xs text-muted">{t(`report.${k}`)}</div>
            <div className={cx('truncate font-bold tabular', c)}>{money(v, undefined, { compact: Math.abs(v) >= 1e6 })}</div>
          </Card>
        ))}
      </div>

      {tips.length > 0 && (
        <Card>
          <div className="mb-2 text-sm font-semibold">{t('report.insights')}</div>
          <ul className="space-y-1.5">{tips.map((x, i) => <li key={i} className="flex gap-2 text-sm"><Lightbulb size={16} className={`mt-0.5 shrink-0 ${x.tone === 'bad' ? 'text-red-500' : x.tone === 'good' ? 'text-emerald-500' : 'text-amber-500'}`} />{t(x.key, x.vars)}</li>)}</ul>
        </Card>
      )}

      {trend.some((x) => x.value) && <Card><div className="mb-1 text-sm font-semibold">{t('report.trend')}</div><DailyBars data={trend} height={180} /></Card>}

      {cats.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between text-sm font-semibold">
            {t('dash.byCategory')}
            {catSel && <button className="text-xs text-brand" onClick={() => setCatSel('')}>{t('filter.clear')}</button>}
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <CategoryDonut data={cats.map((c) => ({ name: c.category?.name ?? t('cat.uncategorized'), value: c.value, color: c.category?.color ?? '#7a7f87' }))} />
            <div className="w-full flex-1 space-y-2">
              {cats.map((c) => (
                <button key={c.id} onClick={() => setCatSel(catSel === c.id ? '' : c.id)} className={cx('flex w-full items-center gap-3 rounded-xl p-1 text-start', catSel === c.id && 'bg-ink/5')}>
                  <IconTile color={c.category?.color ?? '#7a7f87'} size={32}><Icon name={c.category?.icon ?? 'circle-ellipsis'} size={16} /></IconTile>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm"><span className="truncate">{c.category?.name ?? t('cat.uncategorized')}</span><span className="tabular">{money(c.value)} <span className="text-xs text-muted">{tt.expense > 0 ? Math.round((c.value / tt.expense) * 100) : 0}%</span></span></div>
                    <ProgressBar pct={cats[0]?.value ? c.value / cats[0].value : 0} color={c.category?.color} className="mt-1 h-1.5" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {incomeCats.length > 0 && (
        <Card>
          <div className="mb-2 text-sm font-semibold">{t('report.incomeSources')}</div>
          {incomeCats.map((c) => (
            <div key={c.id} className="flex justify-between py-1 text-sm"><span>{c.category?.name ?? t('cat.uncategorized')}</span><span className="tabular text-emerald-600 dark:text-emerald-400">{money(c.value)}</span></div>
          ))}
        </Card>
      )}

      <Card>
        <div className="mb-2 text-sm font-semibold">{t('report.export')}</div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="soft" onClick={() => exportPDF(filtered, exp, `Moneta · ${title}`, [[t('report.income'), money(tt.income)], [t('report.expense'), money(tt.expense)], [t('report.net'), money(tt.net)]])}><FileText size={16} />PDF</Button>
          <Button variant="soft" onClick={() => exportXLSX(filtered, exp)}><FileSpreadsheet size={16} />Excel</Button>
          <Button variant="soft" onClick={() => exportCSV(filtered, exp)}><FileDown size={16} />CSV</Button>
        </div>
      </Card>

      {filtered.length > 0 && <TxGroupedList txs={filtered.slice(0, 200)} />}
    </div>
  );
}

function CalendarView() {
  const { t } = useTranslation();
  const { transactions, ctx, settings, date, money } = useData();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [sel, setSel] = useState(isoDay(new Date()));
  const start = startOfWeek(month, { weekStartsOn: settings.weekStartsOn });
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end: addDays(start, Math.ceil((differenceInCalendarDays(end, start) + 1) / 7) * 7 - 1) });

  const perDay = useMemo(() => {
    const m = new Map<string, { exp: number; inc: number }>();
    for (const x of transactions) {
      const k = x.date.slice(0, 10);
      const e = m.get(k) ?? { exp: 0, inc: 0 };
      if (x.type === 'expense') e.exp += toBase(x.amount, x.currency, ctx);
      if (x.type === 'income') e.inc += toBase(x.amount, x.currency, ctx);
      m.set(k, e);
    }
    return m;
  }, [transactions, ctx]);
  const maxExp = Math.max(1, ...days.map((d) => perDay.get(isoDay(d))?.exp ?? 0));
  const selTx = transactions.filter((x) => x.date.startsWith(sel));

  return (
    <div className="space-y-3">
      <Card className="!p-3">
        <div className="mb-2 flex items-center justify-between">
          <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" onClick={() => setMonth(addMonths(month, -1))} aria-label="prev"><ChevronLeft className="rtl:rotate-180" /></button>
          <span className="font-semibold">{date(month, 'MMMM yyyy')}</span>
          <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" onClick={() => setMonth(addMonths(month, 1))} aria-label="next"><ChevronRight className="rtl:rotate-180" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
          {days.slice(0, 7).map((d) => <div key={d.toISOString()}>{date(d, 'EEEEEE')}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const k = isoDay(d);
            const v = perDay.get(k);
            const inMonth = d.getMonth() === month.getMonth();
            const intensity = v?.exp ? 0.1 + 0.5 * (v.exp / maxExp) : 0;
            return (
              <button
                key={k}
                onClick={() => setSel(k)}
                className={cx('flex aspect-square flex-col items-center justify-center rounded-xl text-xs transition', !inMonth && 'opacity-30', sel === k && 'ring-2 ring-brand', k === isoDay(new Date()) && 'font-bold')}
                style={{ backgroundColor: intensity ? `rgba(235,104,52,${intensity})` : undefined }}
              >
                <span>{toDigits(String(d.getDate()), settings.digitStyle)}</span>
                {v?.inc ? <span className="mt-0.5 h-1 w-1 rounded-full bg-emerald-500" /> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">{t('report.calendarHint')}</p>
      </Card>
      <div className="flex items-center justify-between px-1 text-sm">
        <span className="font-semibold">{date(sel, 'EEEE, d MMMM')}</span>
        <span className="tabular text-muted">{money(perDay.get(sel)?.exp ?? 0)}</span>
      </div>
      {selTx.length ? <TxGroupedList txs={selTx} /> : <p className="py-6 text-center text-sm text-muted">{t('report.noTxDay')}</p>}
    </div>
  );
}
