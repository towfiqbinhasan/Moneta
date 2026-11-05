import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors so the app shell loads fast and caches well.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          data: ['dexie', 'dexie-react-hooks', 'date-fns'],
          supabase: ['@supabase/supabase-js'],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'favicon-64.png', 'apple-touch-icon.png', 'brand/*.webp'],
      manifest: {
        name: 'Moneta — Expense & Budget Tracker',
        short_name: 'Moneta',
        description: 'Daily expense, budget and savings tracker for any currency.',
        theme_color: '#0b1240',
        background_color: '#0b1240',
        categories: ['finance', 'productivity'],
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,jpg,woff2}'],
        // Large source artwork is for README/social only — don't precache it.
        globIgnores: ['**/*-original.png', '**/brand/moneta-banner.png', '**/og-image.jpg'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/open\.er-api\.com\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'rates', expiration: { maxEntries: 5, maxAgeSeconds: 7 * 86400 } },
          },
        ],
      },
    }),
  ],
});
