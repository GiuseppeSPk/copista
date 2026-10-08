import { defineConfig } from 'vite';

export default defineConfig({
  // The dev server also hosts the browser test harness (playwright.config.ts).
  server: { port: 5175, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
