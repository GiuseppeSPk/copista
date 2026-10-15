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
        'src/voice/**/*.ts',
      ],
      // Browser-only: layout needs a real engine, so Playwright covers these.
      exclude: [
        'src/reader/paginator.ts',
        'src/reader/scroller.ts',
        'src/rooms/lectorium/controller.ts',
        // The model runs in a worker, and the audio sink needs a media element.
        'src/voice/worker.ts',
        'src/voice/supertonic.ts',
        'src/voice/audio.ts',
        // The voice lab's page, for development only and tried by ear.
        'src/voice/lab/main.ts',
      ],
      thresholds: { lines: 90, branches: 80 },
    },
  },
});
