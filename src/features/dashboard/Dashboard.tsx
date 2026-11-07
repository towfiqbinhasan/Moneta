import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addMonths } from 'date-fns';
import {
  AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Bell, CalendarDays, ChevronRight, Gauge, Lightbulb, ListOrdered,
  Moon, Palette, PieChart, Plane, Settings2, Sparkles, Sun, Target, TrendingDown, TrendingUp, Wallet, BarChart3, LineChart, Receipt,
} from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Avatar, Button, Card, CardTitle, EmptyState, IconTile } from '@/components/ui';
import { ProgressBar, ProgressRing, StateBadge, STATE_COLOR } from '@/components/Progress';
import { CategoryDonut, DailyBars, IncomeExpenseLines } from '@/components/charts';
import { CountUp, stagger, haptic } from '@/components/motion';
import { Icon } from '@/lib/icons';
import { rangeFor, inRange } from '@/lib/period';
import {
  accountBalance, budgetStatus, debtLeft, byCategory, dailySeries, goalStatus, healthScore, insights, netWorth,
  periodSeries, toBase, totals, txIn, toCur,
} from '@/lib/stats';
import { dueItems } from '@/lib/notify';
import { patchSettings } from '@/db/repo';
import { accent } from '@/theme/accents';
import { isDark, nextStyle } from '@/theme/theme';
import { TxRow } from '../transactions/TxList';
import { useQuickAdd } from '../AppShell';
import type { WidgetId } from '@/db/types';
import { cx } from '@/lib/utils';

/** Widgets that span both columns on wide screens. */
const WIDE = new Set<WidgetId>(['balance', 'quick', 'summary', 'alerts', 'recent']);

export function Dashboard() {
  const { t } = useTranslation();
  const d = useData();
  const { settings } = d;
  const openAdd = useQuickAdd();

  const greeting = (() => {
    const h = new Date().getHours();
    return t(h < 12 ? 'dash.morning' : h < 18 ? 'dash.afternoon' : 'dash.evening');
  })();

  if (!d.accounts.length) {
    return (
      <EmptyState icon={<Wallet size={36} />} title={t('empty.noAccounts')} text={t('empty.noAccountsText')}
        action={<Link to="/accounts"><Button>{t('acc.add')}</Button></Link>} />
    );
  }

  const W: Record<WidgetId, () => JSX.Element | null> = {
    quick: QuickWidget, balance: BalanceWidget, summary: SummaryWidget, alerts: AlertsWidget, trip: TripWidget, budgets: BudgetsWidget,
    pie: PieWidget, trend: TrendWidget, incomeExpense: IncomeExpenseWidget, top5: Top5Widget,
    comparison: ComparisonWidget, goals: GoalsWidget, health: HealthWidget, recent: RecentWidget,
  };
  const dark = isDark(settings.theme);

  return (
    <div className="pt-[max(env(safe-area-inset-top),14px)]">
      <header className="mb-5 mt-1 flex items-center gap-3 animate-rise">
        <Link to="/settings#profile" aria-label={t('profile.title')} className="md:hidden">
          <Avatar name={settings.profile.name} src={settings.profile.avatar} size={46} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{greeting}{settings.profile.name ? `, ${settings.profile.name.split(' ')[0]}` : ''} 👋</p>
          <h1 className="truncate text-xl font-bold tracking-tight">{d.date(new Date(), 'EEE, d MMM')}</h1>
        </div>
        <div className="flex items-center">
          <HeaderBtn label={t('style.switch')} onClick={() => patchSettings({ style: nextStyle(settings.style) })}><Palette size={19} /></HeaderBtn>
          <HeaderBtn label={t('settings.theme')} className="md:hidden" onClick={() => patchSettings({ theme: dark ? 'light' : 'dark' })}>
            <span className="relative block h-[19px] w-[19px]">
              <Sun size={19} className={cx('absolute inset-0 transition-all duration-500', dark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100')} />
              <Moon size={19} className={cx('absolute inset-0 transition-all duration-500', dark ? 'rotate-0 scale-100' : '-rotate-90 scale-0 opacity-0')} />
            </span>
          </HeaderBtn>
          <Link to="/settings#widgets" aria-label={t('dash.customize')} className="grid h-10 w-10 place-items-center rounded-full text-ink/80 transition hover:bg-ink/5 active:scale-90">
            <Settings2 size={19} />
          </Link>
        </div>
      </header>

      {/* Wide widgets take a full row; the ones between them flow as a masonry
          (CSS columns), so short cards never leave holes under them. */}
      <div className="space-y-3.5">
        {segments(settings.widgets.filter((w) => w.visible && W[w.id]).map((w) => w.id)).map((seg, si) =>
          seg.wide ? (
            <Widget key={seg.ids[0]} C={W[seg.ids[0]]} i={seg.start} />
          ) : (
            <div key={'m' + si} className="gap-3.5 lg:columns-2 2xl:columns-3 [&>*]:mb-3.5 [&>*]:break-inside-avoid [&>*:last-child]:mb-0 lg:[&>*:last-child]:mb-3.5 lg:-mb-3.5">
              {seg.ids.map((id, k) => <Widget key={id} C={W[id]} i={seg.start + k} />)}
            </div>
          ),
        )}
      </div>
      {!d.transactions.length && (
        <Card className="mt-3 text-center">
          <p className="mb-3 text-sm text-muted">{t('empty.noTxText')}</p>
          <Button onClick={() => openAdd()}>{t('tx.add')}</Button>
        </Card>
      )}
    </div>
  );
}

function HeaderBtn({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button aria-label={label} title={label} onClick={() => { haptic(6); onClick(); }} className={cx(className, 'grid h-10 w-10 place-items-center rounded-full text-ink/80 transition hover:bg-ink/5 active:scale-90')}>
      {children}
    </button>
  );
}

/* ----------------------------- Widgets ----------------------------- */

function BalanceWidget() {
  const { t } = useTranslation();
  const { accounts, transactions, ctx, money, settings } = useData();
  const nav = useNavigate();
  const total = netWorth(accounts, transactions, ctx);
  const month = totals(txIn(transactions, rangeFor('monthly', new Date(), settings)), ctx);
  return (
    <div
      className="m-hero m-tear relative p-5 text-white"
      style={{ background: 'linear-gradient(135deg, rgb(var(--brand-2)) -15%, rgb(var(--brand)) 42%, rgb(var(--brand-3)) 118%)', borderRadius: 'calc(var(--radius-card) + 4px)', boxShadow: '0 22px 44px -22px rgb(var(--brand) / .8)', ['--tear-color' as string]: 'rgb(var(--brand-3) / .85)' }}
    >
      {/* decorative glow (clipped in its own layer so the torn edge can hang below) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ borderRadius: 'inherit' }}>
        <div className="absolute -end-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-24 -start-10 h-48 w-48 rounded-full bg-black/10 blur-2xl" />
      </div>
      <button onClick={() => nav('/accounts')} className="relative w-full text-start">
        <div className="text-[11px] font-semibold uppercase tracking-[.18em] opacity-80">{t('dash.netWorth')}</div>
        <CountUp value={total} format={(v) => money(v)} className="mt-1 block truncate text-[2rem] font-bold leading-tight tracking-tight tabular" />
      </button>
      <div className="relative mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-white/30 pt-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20"><ArrowDownLeft size={15} /></span>
          <span className="min-w-0"><span className="block truncate text-[10px] uppercase tracking-wider opacity-75">{t('tx.income')}</span><b className="block truncate tabular">{money(month.income, undefined, { compact: month.income >= 1e5 })}</b></span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20"><ArrowUpRight size={15} /></span>
          <span className="min-w-0"><span className="block truncate text-[10px] uppercase tracking-wider opacity-75">{t('tx.expense')}</span><b className="block truncate tabular">{money(month.expense, undefined, { compact: month.expense >= 1e5 })}</b></span>
        </div>
      </div>
      <div className="relative -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar [mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-36px),transparent)]">
        {accounts.filter((a) => !a.archived).map((a) => (
          <div key={a.id} className="min-w-[128px] rounded-2xl bg-white/15 px-3 py-2 ring-1 ring-white/20 backdrop-blur">
            <div className="flex items-center gap-1.5 text-[11px] opacity-90"><Icon name={a.icon} size={13} /> <span className="truncate">{a.name}</span></div>
            <div className="mt-0.5 text-sm font-semibold tabular">{money(accountBalance(a, transactions), a.currency)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickWidget() {
  const { t } = useTranslation();
  const openAdd = useQuickAdd();
  const nav = useNavigate();
  const actions = [
    { label: t('tx.expense'), icon: ArrowUpRight, hue: 'rose', run: () => openAdd({ type: 'expense' }) },
    { label: t('tx.income'), icon: ArrowDownLeft, hue: 'emerald', run: () => openAdd({ type: 'income' }) },
    { label: t('tx.transfer'), icon: ArrowLeftRight, hue: 'sky', run: () => openAdd({ type: 'transfer' }) },
    { label: t('dash.goals'), icon: Target, hue: 'violet', run: () => nav('/goals') },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map((a) => {
        const ac = accent(a.hue);
        return (
          <button key={a.label} onClick={a.run} className="m-card group flex min-w-0 flex-col items-center gap-1.5 px-1 py-3 transition active:scale-95">
            <span className="grid h-11 w-11 place-items-center rounded-2xl text-white transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-[-4deg]" style={{ background: ac.grad, boxShadow: ac.glow }}>
              <a.icon size={20} />
            </span>
            <span className="w-full truncate text-center text-[11px] font-semibold">{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SummaryWidget() {
  const { t } = useTranslation();
  const { transactions, ctx, money, settings } = useData();
  const now = new Date();
  const hues = { daily: 'amber', weekly: 'sky', monthly: 'violet' } as const;
  const cells = (['daily', 'weekly', 'monthly'] as const).map((p) => ({ p, tt: totals(txIn(transactions, rangeFor(p, now, settings)), ctx) }));
  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map(({ p, tt }) => {
        const a = accent(hues[p]);
        return (
          <div key={p} className="m-card relative min-w-0 overflow-hidden px-2 py-3 text-center">
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: a.grad }} />
            <div className="truncate text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: a.text }}>{t(`dash.spent.${p}`)}</div>
            <CountUp value={tt.expense} format={(v) => money(v, undefined, { compact: tt.expense >= 10000, trim: true })} className="mt-1 block truncate text-base font-bold tabular" />
          </div>
        );
      })}
    </div>
  );
}

function AlertsWidget() {
  const { t } = useTranslation();
  const { bills, debts, budgets, transactions, ctx, money } = useData();
  const due = dueItems(bills, debts);
  const budgetAlerts = budgets.map((b) => ({ b, s: budgetStatus(b, transactions, ctx) })).filter((x) => x.s.state !== 'safe');
  if (!due.length && !budgetAlerts.length) return null;
  return (
    <Card>
      <CardTitle icon={<Bell size={15} />} hue="amber">{t('dash.alerts')}</CardTitle>
      <div className="space-y-0.5">
        {budgetAlerts.map(({ b, s }) => (
          <Link key={b.id} to="/budgets" className="flex items-center gap-2 rounded-xl px-1 py-1.5 text-sm transition hover:bg-ink/5">
            <AlertTriangle size={16} style={{ color: STATE_COLOR[s.state] }} />
            <span className="flex-1">{t(s.state === 'over' ? 'alert.budgetOver' : 'alert.budgetNear', { name: b.name, pct: Math.round(s.pct * 100) })}</span>
            <ChevronRight size={16} className="text-muted rtl:rotate-180" />
          </Link>
        ))}
        {due.map((x) => (
          <Link key={x.kind + x.id} to={x.kind === 'bill' ? '/bills' : '/debts'} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 text-sm transition hover:bg-ink/5">
            <span className={cx('h-2 w-2 shrink-0 rounded-full', x.days < 0 ? 'animate-pulse bg-red-500' : 'bg-amber-500')} />
            <span className="flex-1">
              {x.days < 0 ? t('alert.overdue', { name: x.name, days: -x.days }) : x.days === 0 ? t('alert.dueToday', { name: x.name }) : t('alert.dueIn', { name: x.name, days: x.days })}
            </span>
            <span className="font-semibold tabular">{money(x.amount, x.currency, { trim: true })}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function TripWidget() {
  const { trips, settings, transactions, ctx, money } = useData();
  const trip = trips.find((x) => x.id === settings.activeTripId);
  if (!trip) return null;
  const spent = transactions.filter((x) => x.tripId === trip.id && x.type === 'expense').reduce((a, x) => a + toCur(x.amount, x.currency, trip.currency, ctx), 0);
  const pct = trip.budget ? spent / trip.budget : 0;
  const state = pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'safe';
  return (
    <Card>
      <Link to="/trips" className="block">
        <CardTitle icon={<Plane size={15} />} hue="teal">{trip.name}</CardTitle>
        <div className="flex items-baseline justify-between"><span className="text-xl font-bold tabular">{money(spent, trip.currency)}</span><span className="text-sm text-muted">/ {money(trip.budget, trip.currency)}</span></div>
        <ProgressBar pct={pct} state={state} className="mt-2" />
        <div className="mt-2"><StateBadge state={state} /></div>
      </Link>
    </Card>
  );
}

function BudgetsWidget() {
  const { t } = useTranslation();
  const { budgets, transactions, ctx, money, num } = useData();
  if (!budgets.length) {
    return (
      <Card><Link to="/budgets" className="flex items-center gap-3"><IconTile color="#2a78d6"><Sparkles size={20} /></IconTile><span className="flex-1 text-sm">{t('dash.setBudget')}</span><ChevronRight size={18} className="text-muted rtl:rotate-180" /></Link></Card>
    );
  }
  const list = budgets.map((b) => ({ b, s: budgetStatus(b, transactions, ctx) })).sort((a, b) => b.s.pct - a.s.pct).slice(0, 3);
  return (
    <Card>
      <CardTitle icon={<Gauge size={15} />} hue="emerald" action={<Link to="/budgets" aria-label={t('nav.budgets')} className="text-muted"><ChevronRight size={18} className="rtl:rotate-180" /></Link>}>{t('nav.budgets')}</CardTitle>
      <div className="space-y-4">
        {list.map(({ b, s }) => (
          <div key={b.id}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm"><span className="truncate font-semibold">{b.name}</span><span className="shrink-0 text-xs tabular text-muted">{money(s.spent, b.currency, { trim: true })} / {money(s.limit, b.currency, { trim: true })}</span></div>
            <ProgressBar pct={s.pct} state={s.state} />
            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
              <StateBadge state={s.state} />
              {s.state !== 'over' && <span className="truncate text-muted">{t('budget.perDay', { amount: money(s.perDay, b.currency, { trim: true }), days: num(s.daysLeft) })}</span>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function useMonth() {
  const { transactions, settings } = useData();
  return useMemo(() => {
    const r = rangeFor('monthly', new Date(), settings);
    return { r, txs: transactions.filter((x) => inRange(x.date, r)) };
  }, [transactions, settings]);
}

function PieWidget() {
  const { t } = useTranslation();
  const { ctx, money } = useData();
  const { txs } = useMonth();
  const cats = byCategory(txs, ctx);
  if (!cats.length) return null;
  const top = cats.slice(0, 7);
  const rest = cats.slice(7).reduce((a, b) => a + b.value, 0);
  const data = top.map((c) => ({ name: c.category?.name ?? t('cat.uncategorized'), value: c.value, color: c.category?.color ?? '#7a7f87' }));
  if (rest > 0) data.push({ name: t('cat.others'), value: rest, color: '#9ca3af' });
  return (
    <Card>
      <CardTitle icon={<PieChart size={15} />} hue="violet">{t('dash.byCategory')}</CardTitle>
      <div className="flex items-center gap-4">
        <CategoryDonut data={data} />
        <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
          {data.map((x) => (
            <li key={x.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: x.color }} />
              <span className="min-w-0 flex-1 truncate text-ink">{x.name}</span>
              <span className="tabular text-muted">{money(x.value, undefined, { compact: true })}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function TrendWidget() {
  const { t } = useTranslation();
  const { transactions, ctx, date } = useData();
  const series = dailySeries(transactions, ctx, 14).map((x) => ({ label: date(x.date, 'd'), value: x.value, tip: date(x.date, 'EEE, d MMM') }));
  if (!series.some((x) => x.value)) return null;
  return (
    <Card>
      <CardTitle icon={<BarChart3 size={15} />} hue="orange">{t('dash.last14')}</CardTitle>
      <DailyBars data={series} />
    </Card>
  );
}

function IncomeExpenseWidget() {
  const { t } = useTranslation();
  const { transactions, ctx, date } = useData();
  const series = periodSeries(transactions, ctx, 6).map((x) => ({ label: date(x.start, 'MMM'), income: x.income, expense: x.expense }));
  if (!series.some((x) => x.income || x.expense)) return null;
  return (
    <Card>
      <CardTitle icon={<LineChart size={15} />} hue="sky">{t('dash.incomeVsExpense')}</CardTitle>
      <IncomeExpenseLines data={series} />
    </Card>
  );
}

function Top5Widget() {
  const { t } = useTranslation();
  const { ctx, money } = useData();
  const { txs } = useMonth();
  const cats = byCategory(txs, ctx).slice(0, 5);
  if (!cats.length) return null;
  const max = cats[0].value;
  return (
    <Card>
      <CardTitle icon={<ListOrdered size={15} />} hue="fuchsia">{t('dash.top5')}</CardTitle>
      <div className="space-y-3">
        {cats.map((c, i) => (
          <div key={c.id} className="flex items-center gap-3 animate-rise" style={stagger(i, 60)}>
            <IconTile color={c.category?.color ?? '#7a7f87'} size={34}><Icon name={c.category?.icon ?? 'circle-ellipsis'} size={17} /></IconTile>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2 text-sm"><span className="truncate">{c.category?.name ?? t('cat.uncategorized')}</span><span className="tabular font-semibold">{money(c.value, undefined, { trim: true })}</span></div>
              <ProgressBar pct={max > 0 ? c.value / max : 0} color={c.category?.color} className="mt-1 h-1.5" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Widget({ C, i }: { C: () => JSX.Element | null; i: number }) {
  return <div className="min-w-0 animate-rise empty:hidden" style={stagger(i)}><C /></div>;
}

/** Split the widget order into full-width items and runs of normal widgets. */
function segments(ids: WidgetId[]) {
  const out: { wide: boolean; ids: WidgetId[]; start: number }[] = [];
  ids.forEach((id, i) => {
    const wide = WIDE.has(id);
    const last = out[out.length - 1];
    if (!wide && last && !last.wide) last.ids.push(id);
    else out.push({ wide, ids: [id], start: i });
  });
  return out;
}

function ComparisonWidget() {
  const { t } = useTranslation();
  const { transactions, ctx, money, settings } = useData();
  const now = new Date();
  const cur = totals(txIn(transactions, { start: rangeFor('monthly', now, settings).start, end: now }), ctx);
  const prevRange = rangeFor('monthly', addMonths(now, -1), settings);
  const elapsed = now.getTime() - rangeFor('monthly', now, settings).start.getTime();
  const prevEnd = new Date(Math.min(prevRange.end.getTime(), prevRange.start.getTime() + elapsed));
  const prev = totals(txIn(transactions, { start: prevRange.start, end: prevEnd }), ctx);
  const diff = prev.expense ? ((cur.expense - prev.expense) / prev.expense) * 100 : 0;
  const tips = insights(transactions, ctx);
  const up = diff > 0;
  return (
    <Card>
      <CardTitle icon={<CalendarDays size={15} />} hue="indigo">{t('dash.vsLastMonth')}</CardTitle>
      <div className="flex items-center gap-3">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${!prev.expense ? 'bg-indigo-500/10 text-indigo-500' : up ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}>
          {!prev.expense ? <CalendarDays size={22} /> : up ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
        </div>
        <div className="min-w-0">
          {prev.expense ? <div className="text-2xl font-bold tabular">{`${up ? '+' : ''}${Math.round(diff)}%`}</div> : <div className="text-sm font-semibold">{t('dash.noPrevMonth')}</div>}
          <div className="truncate text-xs text-muted">{money(cur.expense, undefined, { trim: true })} {t('dash.vs')} {money(prev.expense, undefined, { trim: true })}</div>
        </div>
      </div>
      {tips.length > 0 && (
        <ul className="m-rule mt-3 space-y-2 pt-3">
          {tips.slice(0, 3).map((x, i) => (
            <li key={i} className="flex gap-2 text-sm"><Lightbulb size={16} className={`mt-0.5 shrink-0 ${x.tone === 'bad' ? 'text-red-500' : x.tone === 'good' ? 'text-emerald-500' : 'text-amber-500'}`} />{t(x.key, x.vars)}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GoalsWidget() {
  const { t } = useTranslation();
  const { goals, goalEntries, money } = useData();
  if (!goals.length) return null;
  return (
    <Card>
      <CardTitle icon={<Target size={15} />} hue="violet" action={<Link to="/goals" aria-label={t('nav.goals')} className="text-muted"><ChevronRight size={18} className="rtl:rotate-180" /></Link>}>{t('nav.goals')}</CardTitle>
      <div className="flex gap-4 overflow-x-auto pb-1 no-scrollbar">
        {goals.map((g) => {
          const s = goalStatus(g, goalEntries);
          return (
            <Link to="/goals" key={g.id} className="flex w-20 shrink-0 flex-col items-center text-center transition active:scale-95">
              <ProgressRing pct={s.pct} color={g.color} size={68} stroke={6}>
                {g.image ? <img src={g.image} alt="" className="h-[50px] w-[50px] rounded-full object-cover" /> : <Icon name={g.icon} size={22} style={{ color: g.color }} />}
              </ProgressRing>
              <span className="mt-1.5 line-clamp-1 text-xs font-semibold">{g.name}</span>
              <span className="text-[11px] text-muted">{Math.round(s.pct * 100)}% · {money(s.saved, g.currency, { compact: true })}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function HealthWidget() {
  const { t } = useTranslation();
  const { transactions, budgets, debts, ctx } = useData();
  const owed = debts.filter((x) => x.direction === 'owe').reduce((a, x) => a + toBase(debtLeft(x).left, x.currency, ctx), 0);
  const h = healthScore(transactions, budgets, owed, ctx);
  const color = h.score >= 70 ? '#16a34a' : h.score >= 45 ? '#eda100' : '#e34948';
  return (
    <Card>
      <CardTitle icon={<Gauge size={15} />} hue="teal">{t('dash.health')}</CardTitle>
      <div className="flex items-center gap-4">
        <ProgressRing pct={h.score / 100} color={color} size={84} stroke={9}><CountUp value={h.score} format={(v) => String(Math.round(v))} className="text-xl" /></ProgressRing>
        <div className="flex-1 space-y-1 text-xs">
          <div className="font-bold" style={{ color }}>{t(h.score >= 70 ? 'health.good' : h.score >= 45 ? 'health.ok' : 'health.poor')}</div>
          {(Object.entries(h.parts) as [string, number][]).map(([k, v]) => (
            <div key={k} className="flex justify-between text-muted"><span>{t(`health.${k}`)}</span><span className="tabular text-ink">{v}/{{ savings: 40, budgets: 30, stability: 15, debt: 15 }[k]}</span></div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function RecentWidget() {
  const { t } = useTranslation();
  const { transactions } = useData();
  if (!transactions.length) return null;
  return (
    <Card className="!p-2.5">
      <div className="px-1.5 pt-1"><CardTitle icon={<Receipt size={15} />} hue="sky" action={<Link to="/transactions" className="text-xs font-semibold text-brand">{t('common.seeAll')}</Link>}>{t('dash.recent')}</CardTitle></div>
      {transactions.slice(0, 6).map((x, i) => <div key={x.id} className="animate-rise" style={stagger(i, 40)}><TxRow tx={x} /></div>)}
    </Card>
  );
}
