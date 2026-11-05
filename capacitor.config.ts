import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native (Android / iOS) shell. The same Vite build in `dist/` runs inside a
 * WebView; `npm run app:sync` rebuilds it and copies it into the native projects.
 */
const config: CapacitorConfig = {
  appId: 'app.moneta.tracker',
  appName: 'Moneta',
  webDir: 'dist',
  backgroundColor: '#0b1240',
  android: { allowMixedContent: false },
  ios: { contentInset: 'never', scheme: 'Moneta' },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: false, // hidden from JS once the app has painted
      backgroundColor: '#0b1240',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false,
    },
    LocalNotifications: { iconColor: '#2563ff' },
  },
};

export default config;
