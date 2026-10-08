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
  test.info().annotations.push({ type: 'open-ms', description: result.ms.toFixed(0) });
  expect(result.chapters).toBeGreaterThan(0);
  expect(result.ms).toBeLessThan(5000);
});

for (const target of ['docx', 'md', 'txt', 'html'] as const) {
  test(`converts an EPUB to ${target}`, async ({ page }) => {
    const outcome = await page.evaluate(
      (t) =>
        window.engine.convertOutcome(
          { url: '/tests/fixtures/generated/epub3-nav.epub' },
          'b.epub',
          t,
        ),
      target,
    );
    expect(outcome.kind).toBe('file');
    expect(outcome.fileName).toBe(`Fixture Three.${target}`);
    expect(outcome.size).toBeGreaterThan(0);
  });
}

test('prepares an EPUB for printing to PDF', async ({ page }) => {
  const outcome = await page.evaluate(() =>
    window.engine.convertOutcome(
      { url: '/tests/fixtures/generated/epub3-nav.epub' },
      'b.epub',
      'pdf',
    ),
  );
  expect(outcome).toMatchObject({ kind: 'print', printable: true });
  expect(outcome.size).toBeGreaterThan(0);
});

const TO_EPUB = {
  'a Word document': {
    source: { url: '/tests/fixtures/generated/basic.docx' },
    name: 'basic.docx',
  },
  Markdown: { source: { text: '# One\n\nText.\n\n# Two\n\nMore.' }, name: 'notes.md' },
  'plain text': { source: { text: 'CHAPTER I\n\nHi.\n\nCHAPTER II\n\nBye.' }, name: 'notes.txt' },
};

for (const [label, { source, name }] of Object.entries(TO_EPUB)) {
  test(`converts ${label} to an EPUB that reopens`, async ({ page }) => {
    const outcome = await page.evaluate(([s, n]) => window.engine.convertOutcome(s, n, 'epub'), [
      source,
      name,
    ] as const);
    expect(outcome.kind).toBe('file');
    expect(outcome.size).toBeGreaterThan(0);
    expect(outcome.chapters).toBeGreaterThan(0);
  });
}
