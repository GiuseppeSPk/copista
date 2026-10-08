import { expect, test } from '@playwright/test';
import type { EpubFixture } from '../fixtures/catalog';
import { normalized, READ_EXPECTATIONS } from '../fixtures/expectations';
import { kebab } from '../fixtures/names';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/harness/engine.html');
  await page.waitForFunction(() => 'engine' in window);
});

for (const key of Object.keys(READ_EXPECTATIONS) as EpubFixture[]) {
  test(`reads ${key} like jsdom`, async ({ page }) => {
    const outcome = await page.evaluate(
      (url) => window.engine.readOutcome(url),
      `/tests/fixtures/generated/${kebab(key)}.epub`,
    );
    expect(outcome).toEqual(normalized(READ_EXPECTATIONS[key]));
  });
}

test('writes an EPUB 3 that reads back to the same book', async ({ page }) => {
  const outcome = await page.evaluate(
    (url) => window.engine.rewriteOutcome(url),
    '/tests/fixtures/generated/epub3-nav.epub',
  );
  expect(outcome).toEqual(normalized(READ_EXPECTATIONS.epub3Nav));
});

test('opens the big book in under 5 seconds', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const response = await fetch('/tests/fixtures/generated/big-epub.epub');
    const data = new Uint8Array(await response.arrayBuffer());
    const start = performance.now();
    const book = await window.engine.readEpub(data);
    return { ms: performance.now() - start, chapters: book.chapters.length };
  });
  expect(result.chapters).toBeGreaterThan(0);
  expect(result.ms).toBeLessThan(5000);
});
