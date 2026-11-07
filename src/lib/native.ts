import { Capacitor } from '@capacitor/core';

/**
 * Bridge to the native Android / iOS shell (Capacitor). Every function is a
 * no-op on the web, and native plugins are imported lazily so the web bundle
 * never pays for them.
 */

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform() as 'web' | 'android' | 'ios';

/** Deep-link scheme used to return from Google sign-in in the system browser. */
export const AUTH_SCHEME = 'app.moneta.tracker';
export const AUTH_CALLBACK = `${AUTH_SCHEME}://auth-callback`;

/** Public web address (Vercel) for links inside e-mails; the app itself lives at https://localhost. */
export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) || (isNative ? '' : location.origin)).replace(/\/$/, '');

/* ------------------------------ Boot ------------------------------ */

let booted = false;

export async function initNative(onAuthUrl: (url: string) => void) {
  if (!isNative || booted) return;
  booted = true;
  document.documentElement.classList.add('native', `native-${platform}`);

  const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]);

  // Status bar follows the active theme (light icons on dark themes).
  const paint = () => {
    const dark = (document.documentElement.dataset.theme ?? '').endsWith('-dark');
    const bg = getComputedStyle(document.body).backgroundColor;
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
    if (platform === 'android') {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      const hex = toHex(bg);
      if (hex) StatusBar.setBackgroundColor({ color: hex }).catch(() => {});
    }
  };
  paint();
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Android back button: close an open sheet/dialog first, then go back, then leave.
  App.addListener('backButton', ({ canGoBack }) => {
    const open = document.querySelector('[role="dialog"], [role="menu"]');
    if (open) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    if (canGoBack && location.pathname !== '/') history.back();
    else App.minimizeApp().catch(() => App.exitApp());
  });

  // Return from the system browser after Google sign-in.
  const handleUrl = (url?: string) => {
    if (url?.startsWith(AUTH_SCHEME + '://')) {
      onAuthUrl(url);
      import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => {});
    }
  };
  App.addListener('appUrlOpen', ({ url }) => handleUrl(url));
  // If Android killed the app while the browser was open, the link arrives as the launch URL instead.
  App.getLaunchUrl().then((r) => handleUrl(r?.url)).catch(() => {});

  requestAnimationFrame(() => setTimeout(() => SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {}), 150));
}

function toHex(rgb: string) {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  return '#' + m.slice(0, 3).map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('');
}

/* ------------------------------ Files ------------------------------ */

/** Save a file to the app cache and open the native share sheet (Drive, WhatsApp, Files …). */
export async function shareFile(blob: Blob, filename: string) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  await Share.share({ title: filename, files: [uri], dialogTitle: filename });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Open a URL in the in-app system browser (OAuth). */
export async function openBrowser(url: string) {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url, presentationStyle: 'popover' });
}

/* --------------------------- Haptics ------------------------------ */

export function nativeHaptic(ms: number) {
  import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ms >= 20 ? ImpactStyle.Medium : ImpactStyle.Light }))
    .catch(() => {});
}

/* ------------------------- Notifications -------------------------- */

const DAILY_ID = 1001;

export async function nativeNotifyPermission() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const p = await LocalNotifications.checkPermissions();
  if (p.display === 'granted') return true;
  return (await LocalNotifications.requestPermissions()).display === 'granted';
}

/** Real OS reminder that fires every day even when the app is closed. */
export async function nativeDailyReminder(enabled: boolean, time: string, title: string, body: string) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: DAILY_ID }] }).catch(() => {});
  if (!enabled) return;
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
  const [hour, minute] = time.split(':').map(Number);
  await LocalNotifications.schedule({
    notifications: [{ id: DAILY_ID, title, body, schedule: { on: { hour, minute }, allowWhileIdle: true } }],
  });
}

export async function nativeNotify(title: string, body: string) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Math.random() * 1e6) + 2000, title, body }] });
}
