import { defineConfig } from 'vitest/config';

// Real-world books, downloaded by scripts/fetch-corpus.ts. Kept out of `npm test`
// because the files are not in the repository.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/corpus/**/*.test.ts'],
  },
});
