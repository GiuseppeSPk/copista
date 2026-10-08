import { expect, test } from '@playwright/test';

// Small enough that the short fixture chapters run over several pages.
test.use({ viewport: { width: 360, height: 260 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/harness/lectorium.html');
  await page.waitForFunction(() => 'lectorium' in window);
});

test('opens a new book on the first page of the first chapter', async ({ page }) => {
  const info = await page.evaluate(() => window.lectorium.start());
  expect(info).toMatchObject({ spineIndex: 0, page: 0, fraction: 0 });
  expect(info.pageCount).toBeGreaterThan(1);
});

test('turns from the last page of a chapter to the first page of the next', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await window.lectorium.start();
    const last = await window.lectorium.goTo({ spineIndex: 0, fraction: 1 });
    const turned = await window.lectorium.next();
    const stored = await window.lectorium.stored();
    return { last, turned, stored, changes: window.lectorium.changes };
  });
  expect(result.last.page).toBe(result.last.pageCount - 1);
  expect(result.turned).toMatchObject({ ok: true, spineIndex: 1, page: 0 });
  expect(result.stored).toEqual({ spineIndex: 1, fraction: 0 });
  const change = result.changes.at(-1)!;
  expect(change).toMatchObject({ spineIndex: 1, fraction: 0 });
  expect(change.percent).toBeGreaterThan(0);
  expect(change.percent).toBeLessThan(100);
});

test('turns back from the first page of a chapter to the last page of the previous', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    await window.lectorium.start();
    await window.lectorium.goTo({ spineIndex: 1, fraction: 0 });
    return window.lectorium.prev();
  });
  expect(result).toMatchObject({ ok: true, spineIndex: 0 });
  expect(result.pageCount).toBeGreaterThan(1);
  expect(result.page).toBe(result.pageCount - 1);
});

test('stops at both ends of the book', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await window.lectorium.start();
    const atStart = await window.lectorium.prev();
    await window.lectorium.goTo({ spineIndex: 2, fraction: 1 });
    const atEnd = await window.lectorium.next();
    return { atStart, atEnd };
  });
  expect(result.atStart).toMatchObject({ ok: false, spineIndex: 0, page: 0 });
  expect(result.atEnd).toMatchObject({ ok: false, spineIndex: 2 });
  expect(result.atEnd.page).toBe(result.atEnd.pageCount - 1);
});

test('goes to the page holding a fragment', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await window.lectorium.start();
    const info = await window.lectorium.goTo({ spineIndex: 1, fragment: 's21' });
    return { info, visible: window.lectorium.onScreen('s21') };
  });
  expect(result.info.spineIndex).toBe(1);
  expect(result.info.page).toBeGreaterThan(0);
  expect(result.visible).toBe(true);
});

test('follows a link into another chapter', async ({ page }) => {
  await page.evaluate(async () => {
    await window.lectorium.start();
    await window.lectorium.goTo({ spineIndex: 1, fragment: 's21' });
  });
  // Click where the link shows on screen; the frame itself runs no script.
  const box = await page.frameLocator('iframe').getByText('next', { exact: true }).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect.poll(() => page.evaluate(() => window.lectorium.info().spineIndex)).toBe(2);
  expect(await page.evaluate(() => window.lectorium.onScreen('end'))).toBe(true);
  expect(await page.evaluate(() => window.lectorium.stored())).toMatchObject({ spineIndex: 2 });
});

test('reopens on the same page after a reload', async ({ page }) => {
  const before = await page.evaluate(async () => {
    await window.lectorium.start();
    await window.lectorium.goTo({ spineIndex: 1, fraction: 0 });
    return window.lectorium.next();
  });
  expect(before).toMatchObject({ ok: true, spineIndex: 1, page: 1 });
  await page.reload();
  await page.waitForFunction(() => 'lectorium' in window);
  const after = await page.evaluate(() => window.lectorium.start(true));
  expect(after).toMatchObject({ spineIndex: 1, page: before.page, pageCount: before.pageCount });
});

test('keeps the place when the look changes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await window.lectorium.start();
    await window.lectorium.goTo({ spineIndex: 1, fraction: 0 });
    const before = await window.lectorium.next();
    const after = await window.lectorium.setLook({ fontSizePercent: 160, theme: 'dark' });
    return { before, after, stored: await window.lectorium.stored() };
  });
  expect(result.after.spineIndex).toBe(1);
  expect(result.after.pageCount).toBeGreaterThan(result.before.pageCount);
  expect(Math.abs(result.after.fraction - result.before.fraction)).toBeLessThanOrEqual(
    1 / result.after.pageCount,
  );
  expect(result.stored).toEqual({ spineIndex: 1, fraction: result.after.fraction });
});

test('removes its frame when closed', async ({ page }) => {
  const frames = await page.evaluate(async () => {
    await window.lectorium.start();
    const open = window.lectorium.frameCount();
    window.lectorium.destroy();
    return { open, closed: window.lectorium.frameCount() };
  });
  expect(frames).toEqual({ open: 1, closed: 0 });
});
