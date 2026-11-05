import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plane, Plus } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, EmptyState, Field, Input, PageHeader } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { CurrencyPicker } from '@/components/pickers';
import { ProgressBar, StateBadge } from '@/components/Progress';
import { useToast } from '@/components/Toast';
import { parseAmount } from '@/lib/format';
import { isoDay } from '@/lib/period';
import { byCategory, toCur } from '@/lib/stats';
import { patchSettings, remove, save } from '@/db/repo';
import type { Trip } from '@/db/types';
import { addDays } from 'date-fns';

/**
 * Trip / Event mode: a separate budget in a foreign currency. While a trip is
 * active, new entries default to its currency and are linked to it.
 */
export function TripsPage() {
  const { t } = useTranslation();
  const { trips, settings, transactions, ctx, money, date } = useData();
  const [edit, setEdit] = useState<Partial<Trip> | null>(null);

  const toggle = (trip: Trip) => patchSettings({ activeTripId: settings.activeTripId === trip.id ? undefined : trip.id });

  return (
    <div>
      <PageHeader back title={t('nav.trips')} action={<Button size="sm" onClick={() => setEdit({})}><Plus size={16} /> {t('common.add')}</Button>} />
      {!trips.length && <EmptyState icon={<Plane size={36} />} title={t('empty.noTrips')} text={t('empty.noTripsText')} action={<Button onClick={() => setEdit({})}>{t('trip.add')}</Button>} />}
      <div className="space-y-3">
        {trips.map((trip) => {
          const txs = transactions.filter((x) => x.tripId === trip.id);
          const spent = txs.filter((x) => x.type === 'expense').reduce((a, x) => a + toCur(x.amount, x.currency, trip.currency, ctx), 0);
          const pct = trip.budget ? spent / trip.budget : 0;
          const state = pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'safe';
          const active = settings.activeTripId === trip.id;
          const cats = byCategory(txs, ctx).slice(0, 4);
          return (
            <Card key={trip.id} className={active ? 'ring-2 ring-brand' : ''}>
              <button className="w-full text-start" onClick={() => setEdit(trip)}>
                <div className="flex justify-between">
                  <div><div className="font-semibold">{trip.name}</div><div className="text-xs text-muted">{date(trip.startDate)} – {date(trip.endDate)} · {trip.currency}</div></div>
                  <StateBadge state={state} />
                </div>
                <div className="my-2 flex items-baseline justify-between"><span className="text-xl font-bold tabular">{money(spent, trip.currency)}</span><span className="text-sm text-muted">/ {money(trip.budget, trip.currency)}</span></div>
                <ProgressBar pct={pct} state={state} />
                {spent > 0 && trip.currency !== settings.baseCurrency && <div className="mt-1 text-xs text-muted">≈ {money(toCur(spent, trip.currency, settings.baseCurrency, ctx))}</div>}
                {cats.length > 0 && <div className="mt-2 text-xs text-muted">{cats.map((c) => `${c.category?.name}: ${money(c.value, undefined, { compact: true })}`).join(' · ')}</div>}
              </button>
              <Button variant={active ? 'primary' : 'soft'} block className="mt-3" onClick={() => toggle(trip)}>
                <Plane size={16} /> {active ? t('trip.stop') : t('trip.start')}
              </Button>
            </Card>
          );
        })}
      </div>
      {edit && <TripForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TripForm({ initial, onClose }: { initial: Partial<Trip>; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings } = useData();
  const [trip, setTrip] = useState<Partial<Trip>>({ name: '', currency: settings.baseCurrency, startDate: isoDay(new Date()), endDate: isoDay(addDays(new Date(), 7)), active: false, ...initial });
  const [budget, setBudget] = useState(initial.budget ? String(initial.budget) : '');
  const set = <K extends keyof Trip>(k: K, v: Trip[K]) => setTrip((p) => ({ ...p, [k]: v }));
  const valid = !!trip.name?.trim();
  const submit = async () => { if (!valid) return; await save<Trip>('trips', { ...(trip as Trip), name: trip.name!.trim(), budget: parseAmount(budget) }); onClose(); };
  const del = async () => {
    if (settings.activeTripId === initial.id) await patchSettings({ activeTripId: undefined });
    const u = await remove('trips', initial.id!);
    toast(t('common.deleted'), u);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={initial.id ? t('trip.edit') : t('trip.add')}
      footer={<div className="flex gap-2">{initial.id && <Button variant="danger" onClick={del}>{t('common.delete')}</Button>}<Button block disabled={!valid} onClick={submit}>{t('common.save')}</Button></div>}>
      <div className="space-y-4">
        <Field label={t('trip.name')}><Input value={trip.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder={t('trip.namePh')} /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label={t('trip.budget')}><Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
          <Field label={t('common.currency')}><CurrencyPicker compact value={trip.currency!} onChange={(c) => set('currency', c)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('filter.from')}><Input type="date" value={trip.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label={t('filter.to')}><Input type="date" value={trip.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        </div>
      </div>
    </Sheet>
  );
}
