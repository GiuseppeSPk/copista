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

test.describe('scroll mode', () => {
  test('switches between pages and scrolling at the same place', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await window.lectorium.start();
      const pages = await window.lectorium.goTo({ spineIndex: 1, fraction: 0.5 });
      const scroll = await window.lectorium.setMode('scroll');
      const back = await window.lectorium.setMode('pages');
      return { pages, scroll, back, frames: window.lectorium.frameCount() };
    });
    expect(result.scroll).toMatchObject({ mode: 'scroll', spineIndex: 1 });
    expect(Math.abs(result.scroll.fraction - result.pages.fraction)).toBeLessThan(0.1);
    expect(result.back).toMatchObject({ mode: 'pages', spineIndex: 1 });
    expect(Math.abs(result.back.fraction - result.pages.fraction)).toBeLessThanOrEqual(
      1 / result.back.pageCount,
    );
    expect(result.frames).toBe(1);
  });

  test('saves the place after the reader scrolls by hand', async ({ page }) => {
    await page.evaluate(() => window.lectorium.start(false, 'scroll'));
    await page.mouse.move(180, 130);
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => page.evaluate(() => window.lectorium.stored().then((p) => p.fraction)), {
        timeout: 3000,
      })
      .toBeGreaterThan(0);
    const stored = await page.evaluate(() => window.lectorium.stored());
    await page.reload();
    await page.waitForFunction(() => 'lectorium' in window);
    const after = await page.evaluate(() => window.lectorium.start(true, 'scroll'));
    expect(after.spineIndex).toBe(0);
    expect(after.fraction).toBe(stored.fraction);
  });

  test('moves the text by itself until paused', async ({ page }) => {
    const start = await page.evaluate(() => window.lectorium.start(false, 'scroll', 400));
    await page.evaluate(() => window.lectorium.play());
    await expect
      .poll(() => page.evaluate(() => window.lectorium.info().scrollTop))
      .toBeGreaterThan(start.scrollTop + 20);
    const paused = await page.evaluate(async () => {
      window.lectorium.pause();
      const at = window.lectorium.info().scrollTop;
      await window.lectorium.wait(500);
      return { at, later: window.lectorium.info() };
    });
    expect(paused.later.scrollTop).toBe(paused.at);
    expect(paused.later.playing).toBe(false);
    expect(await page.evaluate(() => window.lectorium.playStates)).toEqual([true, false]);
  });

  test('carries on into the next chapter and keeps moving', async ({ page }) => {
    await page.evaluate(async () => {
      await window.lectorium.start(false, 'scroll', 400);
      await window.lectorium.goTo({ spineIndex: 0, fraction: 1 });
      window.lectorium.play();
    });
    await expect
      .poll(() => page.evaluate(() => window.lectorium.info().spineIndex), { timeout: 5000 })
      .toBe(1);
    const entered = await page.evaluate(() => window.lectorium.info());
    expect(entered.playing).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.lectorium.info().fraction))
      .toBeGreaterThan(entered.fraction);
    expect(await page.evaluate(() => window.lectorium.stored())).toMatchObject({ spineIndex: 1 });
  });

  test('stops at the end of the book', async ({ page }) => {
    await page.evaluate(async () => {
      await window.lectorium.start(false, 'scroll', 400);
      await window.lectorium.goTo({ spineIndex: 2, fraction: 1 });
      window.lectorium.play();
    });
    await expect
      .poll(() => page.evaluate(() => window.lectorium.info().playing), { timeout: 5000 })
      .toBe(false);
    expect(await page.evaluate(() => window.lectorium.info().spineIndex)).toBe(2);
    await expect(page.getByRole('button', { name: 'End of the book' })).toBeDisabled();
  });

  test('holds still for a moment while the reader scrolls, then moves on', async ({ page }) => {
    await page.evaluate(async () => {
      await window.lectorium.start(false, 'scroll', 400);
      await window.lectorium.goTo({ spineIndex: 1, fraction: 0.2 });
      window.lectorium.play();
    });
    await page.mouse.move(180, 130);
    await page.mouse.wheel(0, 100);
    const held = await page.evaluate(async () => {
      await window.lectorium.wait(300);
      const at = window.lectorium.info().scrollTop;
      await window.lectorium.wait(700);
      return { at, later: window.lectorium.info() };
    });
    expect(held.later.scrollTop).toBe(held.at);
    expect(held.later.playing).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.lectorium.info().scrollTop), { timeout: 4000 })
      .toBeGreaterThan(held.at);
  });

  test('stops moving and gives the host back when closed', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await window.lectorium.start(false, 'scroll', 400);
      window.lectorium.play();
      await window.lectorium.wait(200);
      window.lectorium.destroy();
      return {
        frames: window.lectorium.frameCount(),
        states: window.lectorium.playStates,
        top: window.lectorium.host().scrollTop,
      };
    });
    expect(result).toEqual({ frames: 0, states: [true, false], top: 0 });
  });
});
