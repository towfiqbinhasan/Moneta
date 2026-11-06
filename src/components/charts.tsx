import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useData } from '@/hooks/useData';

/**
 * Charts. Colour rules: a category always wears its own colour (colour follows
 * the entity, not rank); income/expense use fixed categorical slots 1 and 2;
 * text uses ink tokens, never the series colour.
 */

export const SERIES = { income: '#2a78d6', expense: '#eb6834' };

function TipBox({ label, rows }: { label?: string; rows: { name: string; value: string; color: string }[] }) {
  return (
    <div className="rounded-xl bg-card px-3 py-2 text-xs shadow-lg ring-1 ring-line">
      {label && <div className="mb-1 font-semibold text-ink">{label}</div>}
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 text-ink">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
          <span className="text-muted">{r.name}</span>
          <span className="ms-auto font-semibold tabular">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function CategoryDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const { money } = useData();
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="relative h-44 w-44 shrink-0">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={data.length > 1 ? 1.5 : 0} stroke="rgb(var(--card))" strokeWidth={2} isAnimationActive>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip content={({ payload }) => payload?.[0] ? <TipBox rows={[{ name: String(payload[0].name), value: `${money(Number(payload[0].value))} · ${total > 0 ? Math.round((Number(payload[0].value) / total) * 100) : 0}%`, color: (payload[0].payload as { color: string }).color }]} /> : null} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <span className="text-sm font-bold tabular text-ink">{money(total, undefined, { compact: true })}</span>
      </div>
    </div>
  );
}

export function DailyBars({ data, height = 160 }: { data: { label: string; value: number; tip: string }[]; height?: number }) {
  const { money } = useData();
  const { t } = useTranslation();
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
          <YAxis hide />
          <Tooltip cursor={{ fill: 'rgb(var(--ink) / 0.05)' }} content={({ payload }) => payload?.[0] ? <TipBox label={(payload[0].payload as { tip: string }).tip} rows={[{ name: t('tx.expense'), value: money(Number(payload[0].value)), color: SERIES.expense }]} /> : null} />
          <Bar dataKey="value" fill={SERIES.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IncomeExpenseLines({ data, height = 180 }: { data: { label: string; income: number; expense: number }[]; height?: number }) {
  const { money } = useData();
  const { t } = useTranslation();
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip
            cursor={{ stroke: 'rgb(var(--muted))', strokeDasharray: '3 3' }}
            content={({ payload, label }) => payload?.length ? (
              <TipBox label={String(label)} rows={[
                { name: t('tx.income'), value: money(Number(payload.find((p) => p.dataKey === 'income')?.value ?? 0)), color: SERIES.income },
                { name: t('tx.expense'), value: money(Number(payload.find((p) => p.dataKey === 'expense')?.value ?? 0)), color: SERIES.expense },
              ]} />
            ) : null}
          />
          <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted">{t(`tx.${v}`)}</span>} />
          <Line type="monotone" dataKey="income" stroke={SERIES.income} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--card))' }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="expense" stroke={SERIES.expense} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--card))' }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
