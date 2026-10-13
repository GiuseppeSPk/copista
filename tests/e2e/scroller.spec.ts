import { expect, test, type Page } from '@playwright/test';

async function openHarness(page: Page): Promise<void> {
  await page.goto('/tests/harness/scroller.html');
  await page.waitForFunction(() => 'scroller' in window);
}

for (const viewport of [
  { width: 800, height: 600 },
  { width: 360, height: 640 },
]) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => openHarness(page));

    test('shows a whole chapter as one column that scrolls', async ({ page }) => {
      const info = await page.evaluate(() =>
        window.scroller.open('longChapter', 0, { fraction: 0 }),
      );
      expect(info.frameHeight).toBeGreaterThan(3 * info.clientHeight);
      expect(info.scrollHeight).toBeGreaterThanOrEqual(info.frameHeight);
      expect(info.pageCount).toBe(Math.ceil(info.frameHeight / info.clientHeight));
      expect(info.page).toBe(0);
      const overflow = await page.evaluate(() => {
        const host = window.scroller.host();
        const doc = window.scroller.frame().contentDocument!;
        return {
          host: host.scrollWidth - host.clientWidth,
          frame: doc.documentElement.scrollWidth - doc.documentElement.clientWidth,
        };
      });
      expect(overflow).toEqual({ host: 0, frame: 0 });
    });

    test('opens at a fraction and reports it back', async ({ page }) => {
      const info = await page.evaluate(() =>
        window.scroller.open('longChapter', 0, { fraction: 0.5 }),
      );
      expect(info.fraction).toBe(0.5);
      expect(info.page).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scroller.topParagraph())).not.toBe('1');
    });

    test('opens at a fragment', async ({ page }) => {
      const info = await page.evaluate(() =>
        window.scroller.open('longChapter', 0, { fragment: 'end' }),
      );
      expect(info.fraction).toBeGreaterThan(0.8);
      expect(info.scrollTop + info.clientHeight).toBeGreaterThanOrEqual(info.scrollHeight - 1);
    });

    test('scrolls one screen less two lines and stops at both ends', async ({ page }) => {
      const steps = await page.evaluate(async () => {
        const first = await window.scroller.open('longChapter', 0, { fraction: 0 });
        const atTop = window.scroller.prev();
        const moves: number[] = [];
        let last = first.scrollTop;
        while (window.scroller.next()) {
          const now = window.scroller.info().scrollTop;
          moves.push(now - last);
          last = now;
          if (moves.length > 100) break;
        }
        const end = window.scroller.info();
        let back = 0;
        while (window.scroller.prev()) back++;
        return { first, atTop, moves, end, back, top: window.scroller.info() };
      });
      const step = steps.first.clientHeight - 2 * steps.first.lineHeight;
      expect(steps.atTop).toBe(false);
      expect(steps.moves.length).toBeGreaterThan(2);
      for (const move of steps.moves.slice(0, -1)) expect(Math.abs(move - step)).toBeLessThan(2);
      expect(steps.end.scrollTop + steps.end.clientHeight).toBeGreaterThanOrEqual(
        steps.end.scrollHeight - 1,
      );
      expect(steps.back).toBeGreaterThanOrEqual(steps.moves.length);
      expect(steps.top.fraction).toBe(0);
    });

    test('comes back to the same place when the viewport narrows and widens again', async ({
      page,
    }) => {
      const before = await page.evaluate(async () => {
        await window.scroller.open('longChapter', 0, { fraction: 0.4 });
        return window.scroller.topParagraph();
      });
      const height = await page.evaluate(() => window.scroller.info().frameHeight);
      for (let round = 0; round < 3; round++) {
        await page.setViewportSize({
          width: Math.round(viewport.width * 0.55),
          height: viewport.height,
        });
        await expect
          .poll(() => page.evaluate(() => window.scroller.info().frameHeight))
          .not.toBe(height);
        await page.setViewportSize(viewport);
        await expect
          .poll(() => page.evaluate(() => window.scroller.info().frameHeight))
          .toBe(height);
      }
      expect(await page.evaluate(() => window.scroller.topParagraph())).toBe(before);
    });

    test('hands link clicks deep in the chapter to the reader', async ({ page }) => {
      await page.evaluate(() => window.scroller.open('longBook', 1, { fragment: 's21' }));
      const box = await page
        .frameLocator('iframe')
        .getByText('next', { exact: true })
        .boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeLessThan(viewport.height);
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      expect(await page.evaluate(() => window.scroller.lastLink)).toBe('OEBPS/text/ch3.xhtml#end');
    });

    test('reports a scroll by the reader but not its own moves', async ({ page }) => {
      await page.evaluate(async () => {
        await window.scroller.open('longChapter', 0, { fraction: 0 });
        window.scroller.advance(50);
        window.scroller.advance(0.3);
        window.scroller.next();
      });
      // Scroll events arrive a frame later; give them time before counting.
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
      expect(await page.evaluate(() => window.scroller.handScrolls)).toBe(0);
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.mouse.wheel(0, 300);
      await expect.poll(() => page.evaluate(() => window.scroller.handScrolls)).toBeGreaterThan(0);
    });

    test('advances by fractions of a pixel and stops at the bottom', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const start = await window.scroller.open('longChapter', 0, { fraction: 0 });
        for (let i = 0; i < 10; i++) window.scroller.advance(0.25);
        const slow = window.scroller.info().scrollTop - start.scrollTop;
        let steps = 0;
        while (window.scroller.advance(200) && steps < 1000) steps++;
        return { slow, end: window.scroller.info(), again: window.scroller.advance(10) };
      });
      expect(result.slow).toBeGreaterThanOrEqual(2);
      expect(result.slow).toBeLessThanOrEqual(3);
      expect(result.end.scrollTop + result.end.clientHeight).toBeGreaterThanOrEqual(
        result.end.scrollHeight - 1,
      );
      expect(result.again).toBe(false);
    });

    test('sets a speed from the pace and the size of the text', async ({ page }) => {
      const speeds = await page.evaluate(async () => {
        await window.scroller.open('longChapter', 0, { fraction: 0 });
        const normal = [window.scroller.speedFor(100), window.scroller.speedFor(200)];
        await window.scroller.open('longChapter', 0, { fraction: 0 }, { fontSizePercent: 150 });
        return { normal, large: window.scroller.speedFor(200) };
      });
      expect(speeds.normal[1]).toBeCloseTo(2 * speeds.normal[0]!, 5);
      expect(speeds.large).toBeGreaterThan(speeds.normal[1]!);
    });

    test('shows buttons to the chapters around and hands their clicks to the reader', async ({
      page,
    }) => {
      await page.evaluate(async () => {
        await window.scroller.open('longBook', 1, { fraction: 0 });
        window.scroller.setEdges(true, true);
      });
      const previous = page.getByRole('button', { name: 'Previous chapter' });
      // The chapter opens at its first line, with the button just above the screen.
      await expect(previous).not.toBeInViewport();
      expect(await page.evaluate(() => window.scroller.prev())).toBe(false);
      await page.evaluate(() => (window.scroller.host().scrollTop = 0));
      await expect(previous).toBeInViewport();
      await previous.click();
      await page.evaluate(() => {
        while (window.scroller.next());
      });
      const next = page.getByRole('button', { name: 'Next chapter' });
      await expect(next).toBeInViewport();
      await next.click();
      expect(await page.evaluate(() => window.scroller.edges)).toEqual(['prev', 'next']);

      await page.evaluate(() => window.scroller.setEdges(false, false));
      await expect(page.getByRole('button', { name: 'Previous chapter' })).toBeHidden();
      await expect(page.getByRole('button', { name: 'End of the book' })).toBeDisabled();
    });

    test('gives the host back as it found it', async ({ page }) => {
      const after = await page.evaluate(async () => {
        await window.scroller.open('longChapter', 0, { fraction: 0.5 });
        window.scroller.destroy();
        const host = window.scroller.host();
        return {
          children: host.children.length,
          overflow: host.style.overflowY,
          top: host.scrollTop,
        };
      });
      expect(after).toEqual({ children: 0, overflow: '', top: 0 });
    });
  });
}
