import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, RefreshCw, Smartphone, X } from 'lucide-react';
import { Button } from './ui';
import { useToast } from './Toast';
import { isNative, platform } from '@/lib/native';
import { APK_URL, checkApkUpdate, dismiss, downloadApk, installedBuild, isAndroidBrowser, isDismissed, type ApkUpdate } from '@/lib/appUpdate';

/**
 * Top-of-page banner:
 *  - in the Android app, when a newer APK is released → "Update";
 *  - on the website in an Android phone browser → "Get the Android app".
 */
export function AppUpdateBanner() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<ApkUpdate | null>(null);
  const [webOffer, setWebOffer] = useState(isAndroidBrowser && !isDismissed('web'));

  useEffect(() => {
    if (!isNative) return;
    checkApkUpdate().then((u) => { if (u && !isDismissed(`build-${u.build}`)) setUpdate(u); });
  }, []);

  if (update) {
    return (
      <Banner
        icon={<RefreshCw size={16} />}
        text={t('update.available', { build: update.build })}
        action={t('update.install')}
        onAction={() => downloadApk(update.url)}
        onClose={() => { dismiss(`build-${update.build}`); setUpdate(null); }}
      />
    );
  }
  if (webOffer) {
    return (
      <Banner
        icon={<Smartphone size={16} />}
        text={t('update.getApp')}
        action={t('update.download')}
        onAction={() => downloadApk()}
        onClose={() => { dismiss('web'); setWebOffer(false); }}
      />
    );
  }
  return null;
}

function Banner({ icon, text, action, onAction, onClose }: { icon: React.ReactNode; text: string; action: string; onAction: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="-mx-4 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white animate-fade-in md:mx-0 md:mt-3 md:rounded-full" style={{ background: 'var(--brand-grad)' }}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{text}</span>
      <button onClick={onAction} className="shrink-0 rounded-full bg-white/20 px-3 py-1 font-bold transition hover:bg-white/30 active:scale-95">{action}</button>
      <button onClick={onClose} aria-label={t('update.later')} title={t('update.later')} className="shrink-0 rounded-full p-1 transition hover:bg-white/20"><X size={14} /></button>
    </div>
  );
}

/** Settings → About: "Download Android app" on the web, "Check for updates" in the Android app. */
export function AppUpdateButton() {
  const { t } = useTranslation();
  const toast = useToast();
  const [build, setBuild] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { installedBuild().then(setBuild); }, []);

  if (!isNative) {
    return (
      <Button variant="soft" className="mt-4" onClick={() => downloadApk(APK_URL)}>
        <Download size={16} /> {t('update.downloadAndroid')}
      </Button>
    );
  }
  if (platform !== 'android') return null;
  return (
    <div className="mt-4 flex flex-col items-center gap-1">
      <Button variant="soft" disabled={busy} onClick={async () => {
        setBusy(true);
        const u = await checkApkUpdate(true);
        setBusy(false);
        if (u) { toast(t('update.available', { build: u.build })); downloadApk(u.url); }
        else toast(t('update.upToDate'));
      }}>
        <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> {t('update.check')}
      </Button>
      {!!build && <span className="text-[11px] text-muted">{t('update.build', { build })}</span>}
    </div>
  );
}
