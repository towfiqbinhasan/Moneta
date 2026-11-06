import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, CornerDownRight, Plus } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, Field, IconTile, Input, PageHeader, Segmented, Select } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { ColorPicker, IconPicker } from '@/components/pickers';
import { useToast } from '@/components/Toast';
import { Icon } from '@/lib/icons';
import { remove, save, update } from '@/db/repo';
import { db } from '@/db/db';
import type { Category } from '@/db/types';
import { CATEGORY_SETS } from '@/db/defaults';
import { seedCategories } from '@/db/demo';
import { scheduleSync } from '@/lib/sync';

export function CategoriesPage() {
  const { t } = useTranslation();
  const { categories } = useData();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const parents = categories.filter((c) => c.kind === kind && !c.parentId);

  /** Swap order with neighbour (within same parent). */
  const move = async (c: Category, dir: -1 | 1) => {
    const siblings = categories.filter((x) => x.kind === c.kind && x.parentId === c.parentId);
    const i = siblings.indexOf(c);
    const o = siblings[i + dir];
    if (!o) return;
    const cOrder = c.order;
    const oOrder = o.order;
    const newC = cOrder === oOrder ? (dir === 1 ? oOrder + 1 : oOrder - 1) : oOrder;
    const newO = cOrder === oOrder ? oOrder : cOrder;
    await update<Category>('categories', c.id, { order: newC });
    await update<Category>('categories', o.id, { order: newO });
  };

  const Row = ({ c, sub, idx, count }: { c: Category; sub?: boolean; idx: number; count: number }) => (
    <div className={`flex items-center gap-3 py-2 ${sub ? 'ps-8' : ''}`}>
      <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => setEdit(c)}>
        {sub && <CornerDownRight size={14} className="text-muted rtl:-scale-x-100" />}
        <IconTile color={c.color} size={sub ? 32 : 40}><Icon name={c.icon} size={sub ? 16 : 20} /></IconTile>
        <span className="truncate font-medium">{c.name}</span>
      </button>
      {!sub && <button onClick={() => setEdit({ kind, parentId: c.id, color: c.color, icon: c.icon })} className="rounded-lg p-1.5 text-muted hover:bg-ink/5" aria-label={t('cat.addSub')}><Plus size={16} /></button>}
      <div className="flex flex-col">
        <button disabled={idx === 0} onClick={() => move(c, -1)} className="text-muted disabled:opacity-20" aria-label="up"><ArrowUp size={14} /></button>
        <button disabled={idx === count - 1} onClick={() => move(c, 1)} className="text-muted disabled:opacity-20" aria-label="down"><ArrowDown size={14} /></button>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader back title={t('nav.categories')} action={<Button size="sm" onClick={() => setEdit({ kind })}><Plus size={16} /> {t('common.add')}</Button>} />
      <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: t('tx.expense') }, { value: 'income', label: t('tx.income') }]} className="mb-3" />
      <Card className="divide-y divide-line !py-1">
        {parents.map((p, i) => {
          const subs = categories.filter((c) => c.parentId === p.id);
          return (
            <div key={p.id}>
              <Row c={p} idx={i} count={parents.length} />
              {subs.map((s, j) => <Row key={s.id} c={s} sub idx={j} count={subs.length} />)}
            </div>
          );
        })}
      </Card>
      <Button variant="soft" block className="mt-4" onClick={() => setPresetOpen(true)}>{t('cat.loadPreset')}</Button>
      {edit && <CategoryForm initial={edit} onClose={() => setEdit(null)} />}
      {presetOpen && <PresetSheet onClose={() => setPresetOpen(false)} />}
    </div>
  );
}

function CategoryForm({ initial, onClose }: { initial: Partial<Category>; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { categories, transactions } = useData();
  const [c, setC] = useState<Partial<Category>>({ name: '', kind: 'expense', icon: 'circle-ellipsis', color: '#2a78d6', ...initial });
  const set = <K extends keyof Category>(k: K, v: Category[K]) => setC((p) => ({ ...p, [k]: v }));
  const parents = categories.filter((x) => x.kind === c.kind && !x.parentId && x.id !== c.id);
  const hasSubs = !!initial.id && categories.some((x) => x.parentId === initial.id);

  const submit = async () => {
    if (!c.name?.trim()) return;
    const order = c.order ?? Math.max(0, ...categories.map((x) => x.order)) + 1;
    await save<Category>('categories', { ...(c as Category), name: c.name.trim(), parentId: c.parentId || undefined, order });
    onClose();
  };

  const del = async () => {
    if (!initial.id) return;
    const ids = [initial.id, ...categories.filter((x) => x.parentId === initial.id).map((x) => x.id)];
    const used = transactions.filter((x) => x.categoryId && ids.includes(x.categoryId));
    if (used.length && !confirm(t('cat.deleteConfirm', { count: used.length }))) return;
    // Transactions keep existing but become "uncategorised" (or move to parent if a subcategory is deleted).
    const fallback = initial.parentId;
    await db.transaction('rw', db.transactions, async () => {
      for (const x of used) {
        const rec = await db.transactions.get(x.id);
        if (rec) {
          if (fallback) rec.categoryId = fallback;
          else delete rec.categoryId;
          rec.updatedAt = Date.now();
          await db.transactions.put(rec);
        }
      }
    });
    if (used.length) scheduleSync();
    const undo = await remove('categories', ids);
    toast(t('common.deleted'), async () => {
      await undo();
      await db.transaction('rw', db.transactions, async () => {
        for (const x of used) {
          const rec = await db.transactions.get(x.id);
          if (rec) {
            rec.categoryId = x.categoryId;
            rec.updatedAt = Date.now();
            await db.transactions.put(rec);
          }
        }
      });
      if (used.length) scheduleSync();
    });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={initial.id ? t('cat.edit') : t('cat.add')} tall
      footer={<div className="flex gap-2">{initial.id && <Button variant="danger" onClick={del}>{t('common.delete')}</Button>}<Button block disabled={!c.name?.trim()} onClick={submit}>{t('common.save')}</Button></div>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <IconTile color={c.color!} size={52}><Icon name={c.icon!} size={26} /></IconTile>
          <Input value={c.name} onChange={(e) => set('name', e.target.value)} placeholder={t('cat.name')} autoFocus />
        </div>
        {!hasSubs && (
          <Field label={t('cat.parent')}>
            <Select value={c.parentId ?? ''} onChange={(e) => set('parentId', e.target.value || undefined)}>
              <option value="">{t('cat.noParent')}</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('common.color')}><ColorPicker value={c.color!} onChange={(v) => set('color', v)} /></Field>
        <Field label={t('common.icon')}><IconPicker value={c.icon!} onChange={(v) => set('icon', v)} color={c.color!} /></Field>
      </div>
    </Sheet>
  );
}

function PresetSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [preset, setPreset] = useState('standard');
  const [replace, setReplace] = useState(false);
  const apply = async () => {
    if (replace) {
      const ids = (await db.categories.toCollection().primaryKeys()) as string[];
      await remove('categories', ids);
    }
    await seedCategories(preset, t);
    toast(t('cat.presetLoaded'));
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={t('cat.loadPreset')} footer={<Button block onClick={apply}>{t('common.apply')}</Button>}>
      <div className="space-y-2">
        {Object.keys(CATEGORY_SETS).map((k) => (
          <button key={k} onClick={() => setPreset(k)} className={`w-full rounded-2xl border p-3 text-start ${preset === k ? 'border-brand bg-brand/5' : 'border-line'}`}>
            <div className="font-semibold">{t(`preset.${k}`)}</div>
            <div className="text-xs text-muted">{CATEGORY_SETS[k].expense.slice(0, 6).map((x) => t(`cat.${x.key}`)).join(', ')}…</div>
          </button>
        ))}
        <label className="flex items-center gap-2 pt-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
          {t('cat.replaceExisting')}
        </label>
      </div>
    </Sheet>
  );
}
