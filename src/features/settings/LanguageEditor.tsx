import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Plus, Search, Upload } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { Button, Card, Field, Input, PageHeader, Segmented, Select, Toggle } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import { patchSettings } from '@/db/repo';
import type { CustomLanguage } from '@/db/types';
import { allLanguages, BUILTIN_STRINGS, EN_KEYS, loadCustomLanguages } from '@/i18n';
import i18n from '@/i18n';
import { download } from '@/lib/utils';

/**
 * In-app language editor:
 *  - create a brand-new language (any code, LTR or RTL), starting from any existing one;
 *  - edit/override any string of a built-in language;
 *  - import/export JSON so translations can be shared.
 * Stored in the `languages` table and merged on top of built-in strings.
 */
export function LanguageEditor() {
  const { t } = useTranslation();
  const toast = useToast();
  const { languages, settings } = useData();
  const all = allLanguages(languages);
  const [code, setCode] = useState(settings.language);
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const custom = languages.find((l) => l.code === code);
  const builtin = BUILTIN_STRINGS[code];
  const info = all.find((l) => l.code === code);
  const value = (k: string) => custom?.strings[k] ?? builtin?.[k] ?? '';

  const keys = useMemo(() => {
    const s = q.trim().toLowerCase();
    return EN_KEYS.filter((k) => {
      if (onlyMissing && value(k)) return false;
      if (!s) return true;
      return k.toLowerCase().includes(s) || BUILTIN_STRINGS.en[k].toLowerCase().includes(s) || value(k).toLowerCase().includes(s);
    });
  }, [q, onlyMissing, code, languages]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = EN_KEYS.filter((k) => value(k)).length;

  const saveKey = async (k: string, v: string) => {
    const base: CustomLanguage = custom ?? { code, name: info?.name ?? code, dir: info?.dir ?? 'ltr', strings: {}, updatedAt: Date.now() };
    const strings = { ...base.strings };
    if (!v.trim() || v === builtin?.[k]) delete strings[k];
    else strings[k] = v;
    const next = { ...base, strings, updatedAt: Date.now() };
    await db.languages.put(next);
    loadCustomLanguages([next]);
    if (i18n.language === code) i18n.changeLanguage(code);
  };

  const setDir = async (rtl: boolean) => {
    const base: CustomLanguage = custom ?? { code, name: info?.name ?? code, dir: 'ltr', strings: {}, updatedAt: Date.now() };
    await db.languages.put({ ...base, dir: rtl ? 'rtl' : 'ltr', updatedAt: Date.now() });
    if (settings.language === code) document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  };

  const exportLang = () => {
    const strings = Object.fromEntries(EN_KEYS.map((k) => [k, value(k)]));
    download(JSON.stringify({ code, name: info?.name, dir: info?.dir, strings }, null, 2), `moneta-${code}.json`, 'application/json');
  };

  const importLang = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!data.code || typeof data.strings !== 'object') throw new Error('Invalid file');
      const lang: CustomLanguage = { code: String(data.code), name: String(data.name ?? data.code), dir: data.dir === 'rtl' ? 'rtl' : 'ltr', strings: data.strings, updatedAt: Date.now() };
      await db.languages.put(lang);
      loadCustomLanguages([lang]);
      setCode(lang.code);
      toast(t('lang.imported', { name: lang.name }));
    } catch (e) {
      toast((e as Error).message, undefined, 'warn');
    }
  };

  const removeLang = async () => {
    if (!custom || !confirm(t(builtin ? 'lang.resetConfirm' : 'lang.deleteConfirm'))) return;
    await db.languages.delete(code);
    if (builtin) {
      i18n.addResourceBundle(code, 'translation', builtin, false, true);
    } else {
      if (settings.language === code) await patchSettings({ language: 'en' });
      setCode('en');
    }
  };

  return (
    <div>
      <PageHeader back title={t('lang.editor')} subtitle={t('lang.progress', { done, total: EN_KEYS.length })} />
      <Card className="mb-3 space-y-3">
        <div className="flex gap-2">
          <Select value={code} onChange={(e) => setCode(e.target.value)} className="flex-1">
            {all.map((l) => <option key={l.code} value={l.code}>{l.name} ({l.code})</option>)}
          </Select>
          <Button className="h-12" onClick={() => setCreating(true)}><Plus size={18} />{t('lang.new')}</Button>
        </div>
        <Toggle checked={info?.dir === 'rtl'} onChange={setDir} label={t('lang.rtl')} desc={t('lang.rtlDesc')} />
        <div className="flex flex-wrap gap-2">
          {settings.language !== code && <Button size="sm" onClick={() => patchSettings({ language: code })}>{t('lang.use')}</Button>}
          <Button size="sm" variant="soft" onClick={exportLang}><Download size={14} />{t('lang.export')}</Button>
          <Button size="sm" variant="soft" onClick={() => fileRef.current?.click()}><Upload size={14} />{t('lang.import')}</Button>
          {custom && <Button size="sm" variant="danger" onClick={removeLang}>{builtin ? t('lang.reset') : t('common.delete')}</Button>}
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importLang(f); e.target.value = ''; }} />
        </div>
      </Card>

      <div className="sticky top-14 z-10 -mx-4 space-y-2 bg-surface/90 px-4 py-2 backdrop-blur">
        <div className="relative">
          <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('lang.search')} className="ps-10" />
        </div>
        <Segmented value={onlyMissing ? 'missing' : 'all'} onChange={(v) => setOnlyMissing(v === 'missing')} options={[{ value: 'all', label: t('filter.all') }, { value: 'missing', label: t('lang.missing') }]} />
      </div>

      <div className="mt-2 space-y-2">
        {keys.slice(0, 300).map((k) => (
          <Card key={code + k} className="!p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <code className="truncate text-[11px] text-muted">{k}</code>
              {custom?.strings[k] && builtin && <span className="text-[10px] font-semibold uppercase text-amber-600">{t('lang.edited')}</span>}
            </div>
            <div className="mb-1.5 text-xs text-muted" dir="ltr">EN: {BUILTIN_STRINGS.en[k]}</div>
            <Input defaultValue={value(k)} dir={info?.dir} onBlur={(e) => e.target.value !== value(k) && saveKey(k, e.target.value)} className="h-10 text-sm" />
          </Card>
        ))}
        {keys.length > 300 && <p className="py-4 text-center text-xs text-muted">{t('lang.narrow', { count: keys.length - 300 })}</p>}
      </div>

      {creating && <NewLanguageSheet onClose={() => setCreating(false)} onCreated={setCode} />}
    </div>
  );
}

function NewLanguageSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (code: string) => void }) {
  const { t } = useTranslation();
  const { languages } = useData();
  const all = allLanguages(languages);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [rtl, setRtl] = useState(false);
  const [from, setFrom] = useState('en');
  const clean = code.trim().toLowerCase().replace(/[^a-z-]/g, '');
  const exists = all.some((l) => l.code === clean);
  const valid = clean.length >= 2 && !!name.trim() && !exists;

  const create = async () => {
    if (!valid) return;
    const src = languages.find((l) => l.code === from);
    const strings = from === 'en' ? {} : { ...(BUILTIN_STRINGS[from] ?? {}), ...(src?.strings ?? {}) };
    const lang: CustomLanguage = { code: clean, name: name.trim(), dir: rtl ? 'rtl' : 'ltr', strings, updatedAt: Date.now() };
    await db.languages.put(lang);
    loadCustomLanguages([lang]);
    onCreated(clean);
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={t('lang.new')} footer={<Button block disabled={!valid} onClick={create}>{t('common.create')}</Button>}>
      <div className="space-y-4">
        <Field label={t('lang.name')}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="العربية, اردو, Français, Svenska…" autoFocus /></Field>
        <Field label={t('lang.code')} hint={exists ? t('lang.exists') : t('lang.codeHint')}><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ar, ur, fr, sv…" /></Field>
        <Field label={t('lang.startFrom')}>
          <Select value={from} onChange={(e) => setFrom(e.target.value)}>
            {all.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </Select>
        </Field>
        <Toggle checked={rtl} onChange={setRtl} label={t('lang.rtl')} desc={t('lang.rtlDesc')} />
      </div>
    </Sheet>
  );
}
