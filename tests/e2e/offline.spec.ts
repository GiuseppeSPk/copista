import { expect, test } from '@playwright/test';

test('works without a network after the first visit', async ({ page, context }) => {
  await page.goto('/#/bibliotheca');
  // Wait until the service worker has installed and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await page.getByLabel('Add EPUB books').setInputFiles('tests/fixtures/generated/long-book.epub');
  await expect(page.getByRole('status')).toContainText('Added “Long Book”.');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Long Book', level: 2 })).toBeVisible();

  await page.getByRole('button', { name: 'Read Long Book' }).click();
  await expect(page.locator('.where')).toContainText(/Page 1 of \d+/);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.where')).toContainText(/Page 2 of \d+/);

  await page.getByRole('link', { name: 'Convert a file' }).click();
  await page.getByLabel('Choose files').setInputFiles('tests/fixtures/generated/long-book.epub');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Word', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('Long Book.docx');

  // The .docx reader is a separate chunk, so this checks it was cached too.
  await page.getByRole('button', { name: /^Remove long-book\.epub/ }).click();
  await page.getByLabel('Choose files').setInputFiles('tests/fixtures/generated/basic.docx');
  const epub = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EPUB', exact: true }).click();
  expect((await epub).suggestedFilename()).toMatch(/\.epub$/);
});

test.describe('cross-origin isolation for the voice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/bibliotheca');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  });

  test('isolates the page only once the voice is set up', async ({ page }) => {
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
    await page.evaluate(() => caches.open('copista-voice-v1'));
    await page.reload();
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    await page.evaluate(() => caches.delete('copista-voice-v1'));
    await page.reload();
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  });

  test('reads and prints a book as before once isolated', async ({ page }) => {
    const blocked: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy|Cross-Origin|COEP/i.test(message.text())) {
        blocked.push(message.text());
      }
    });
    await page.evaluate(() => caches.open('copista-voice-v1'));
    await page.reload();
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

    await page
      .getByLabel('Add EPUB books')
      .setInputFiles('tests/fixtures/generated/epub3-nav.epub');
    await expect(page.getByRole('status')).toContainText('Added “Fixture Three”.');
    const cover = page.getByRole('list', { name: 'Books' }).locator('img').first();
    await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);

    await page.getByRole('button', { name: 'Read Fixture Three' }).click();
    await expect(page.locator('.where')).toContainText(/Page 1 of \d+/);

    await page.addInitScript(() => {
      window.print = () => {};
    });
    await page.goto('/#/scriptorium');
    await page.getByLabel('Choose files').setInputFiles('tests/fixtures/generated/epub3-nav.epub');
    await page.getByRole('button', { name: 'PDF (print)' }).click();
    const preview = page.getByRole('dialog', { name: 'Save as PDF' });
    await expect(preview).toBeVisible();
    await expect(preview.getByText('Laying out the pages…')).toHaveCount(0);
    expect(blocked).toEqual([]);
  });
});
