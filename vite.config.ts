import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { ort } from './scripts/vite-ort';

export default defineConfig({
  // The app sits at the root of copista.org; BASE_PATH serves it under a folder instead.
  base: process.env['BASE_PATH'] ?? '/',
  // The dev server also hosts the browser test harness (playwright.config.ts).
  server: { port: 5175, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  plugins: [
    svelte(),
    ort(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Copista',
        short_name: 'Copista',
        description: 'Convert documents and read books in the browser. Nothing leaves your device.',
        lang: 'en',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f6f4ef',
        theme_color: '#a3241c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // The link preview picture is for other sites, not for the app offline.
        // onnxruntime-web is for the voice only: cached when first used, with the voice.
        globIgnores: ['og-image.png', 'ort/**'],
        navigateFallback: 'index.html',
        // Isolates the page once the voice is set up, so the voice can use several threads.
        importScripts: ['coi.js'],
        runtimeCaching: [
          {
            urlPattern: /\/ort\/\d+\.\d+\.\d+\//,
            handler: 'CacheFirst',
            options: { cacheName: 'copista-voice-v1', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
});
