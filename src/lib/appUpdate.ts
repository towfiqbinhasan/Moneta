import { isNative, platform } from './native';

/**
 * Android APK updates without the Play Store. CI publishes every build as a GitHub
 * Release tagged `android-<build>` whose versionCode is that same build number, so
 * the installed app compares its own versionCode with the latest tag.
 */

const REPO = 'towfiqbinhasan/Moneta';
/** Always points at the newest release's APK. */
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/Moneta.apk`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Android phone browser (not the app itself): worth offering the app download. */
export const isAndroidBrowser = !isNative && /Android/i.test(navigator.userAgent);

export interface ApkUpdate { build: number; url: string }

const CHECK_KEY = 'moneta.apkCheck';
const CHECK_EVERY = 6 * 3600_000; // GitHub allows 60 unauthenticated API calls / hour / IP

/** The installed app's build number (Android versionCode), or 0 on web / if unknown. */
export async function installedBuild(): Promise<number> {
  if (!isNative || platform !== 'android') return 0;
  try {
    const { App } = await import('@capacitor/app');
    return Number((await App.getInfo()).build) || 0;
  } catch {
    return 0;
  }
}

/**
 * Returns the newer release if there is one. Cached for a few hours unless `force`
 * (the "Check for updates" button). Never throws — offline simply means "no update".
 */
export async function checkApkUpdate(force = false): Promise<ApkUpdate | null> {
  const current = await installedBuild();
  if (!current) return null;
  let latest: ApkUpdate | null = null;
  try {
    const cached = JSON.parse(localStorage.getItem(CHECK_KEY) ?? 'null') as { at: number; latest: ApkUpdate | null } | null;
    if (!force && cached && Date.now() - cached.at < CHECK_EVERY) latest = cached.latest;
    else throw new Error('stale');
  } catch {
    try {
      const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) return null;
      const rel = (await res.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string }[] };
      const build = Number(/^android-(\d+)$/.exec(rel.tag_name ?? '')?.[1]);
      const asset = rel.assets?.find((a) => a.name.endsWith('.apk'));
      latest = build ? { build, url: asset?.browser_download_url ?? APK_URL } : null;
      try { localStorage.setItem(CHECK_KEY, JSON.stringify({ at: Date.now(), latest })); } catch { /* ignore */ }
    } catch {
      return null;
    }
  }
  return latest && latest.build > current ? latest : null;
}

/** Download the APK: the system browser handles it, then Android offers to install it over the old one. */
export async function downloadApk(url = APK_URL) {
  if (isNative) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    location.href = url;
  }
}

/* "Later" remembers which build (or the web banner) the user dismissed. */
const DISMISS_KEY = 'moneta.apkDismissed';
export function isDismissed(id: string) {
  try { return localStorage.getItem(DISMISS_KEY) === id; } catch { return false; }
}
export function dismiss(id: string) {
  try { localStorage.setItem(DISMISS_KEY, id); } catch { /* ignore */ }
}
