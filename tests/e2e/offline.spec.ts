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
  await page.getByLabel('Choose a file').setInputFiles('tests/fixtures/generated/long-book.epub');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Word', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('Long Book.docx');

  // The .docx reader is a separate chunk, so this checks it was cached too.
  await page.getByLabel('Choose a file').setInputFiles('tests/fixtures/generated/basic.docx');
  const epub = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EPUB', exact: true }).click();
  expect((await epub).suggestedFilename()).toMatch(/\.epub$/);
});
