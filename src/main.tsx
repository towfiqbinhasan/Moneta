import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';
import './i18n';
import './index.css';
import { Root } from './App';

// Service worker: offline support + automatic updates. The phone app already
// ships its files inside the APK, so it doesn't need one.
if (!Capacitor.isNativePlatform()) registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
