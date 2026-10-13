import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**/*.ts',
        'src/reader/**/*.ts',
        'src/storage/**/*.ts',
        'src/rooms/**/*.ts',
      ],
      // Browser-only: layout needs a real engine, so Playwright covers these.
      exclude: [
        'src/reader/paginator.ts',
        'src/reader/scroller.ts',
        'src/rooms/lectorium/controller.ts',
      ],
      thresholds: { lines: 90, branches: 80 },
    },
  },
});
