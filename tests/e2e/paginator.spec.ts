import { expect, test, type Page } from '@playwright/test';
import { pageForFraction } from '../../src/reader/location';

const ORIGIN = 'http://localhost:5175';

async function openHarness(page: Page): Promise<void> {
  await page.goto('/tests/harness/paginator.html');
  await page.waitForFunction(() => 'harness' in window);
}

for (const viewport of [
  { width: 800, height: 600 },
  { width: 375, height: 667 },
]) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => openHarness(page));

    test('opens a long chapter on its first page', async ({ page }) => {
      const info = await page.evaluate(() =>
        window.harness.open('longChapter', 0, { fraction: 0 }),
      );
      expect(info.pageCount).toBeGreaterThan(3);
      expect(info.page).toBe(0);
    });

    test('turns one page at a time and stops at both ends', async ({ page }) => {
      const steps = await page.evaluate(async () => {
        const { pageCount } = await window.harness.open('longChapter', 0, { fraction: 0 });
        const forward: [boolean, number][] = [];
        for (let i = 0; i < pageCount; i++) {
          forward.push([window.harness.next(), window.harness.info().page]);
        }
        const back: [boolean, number][] = [];
        for (let i = 0; i < pageCount; i++) {
          back.push([window.harness.prev(), window.harness.info().page]);
        }
        return { pageCount, forward, back };
      });
      const n = steps.pageCount;
      expect(steps.forward).toEqual(
        Array.from({ length: n }, (_, i) => (i < n - 1 ? [true, i + 1] : [false, n - 1])),
      );
      expect(steps.back).toEqual(
        Array.from({ length: n }, (_, i) => (i < n - 1 ? [true, n - 2 - i] : [false, 0])),
      );
    });

    test('lands on the page of a fraction', async ({ page }) => {
      const info = await page.evaluate(() =>
        window.harness.open('longChapter', 0, { fraction: 0.5 }),
      );
      expect(info.page).toBe(pageForFraction(0.5, info.pageCount));
      expect(info.page).toBeGreaterThan(0);
    });

    test('lands on the page of a fragment', async ({ page }) => {
      const info = await page.evaluate(() =>
        window.harness.open('longChapter', 0, { fragment: 'end' }),
      );
      expect(info.page).toBe(info.pageCount - 1);
    });

    test('keeps the place when the font grows', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const before = await window.harness.open('longChapter', 0, { fraction: 0.5 });
        const bigger = await window.harness.open(
          'longChapter',
          0,
          { fraction: before.fraction },
          { fontSizePercent: 200 },
        );
        const after = await window.harness.relayout();
        return { before, bigger, after };
      });
      expect(result.bigger.pageCount).toBeGreaterThan(result.before.pageCount);
      const n = result.bigger.pageCount;
      expect(Math.abs(result.bigger.fraction - result.before.fraction)).toBeLessThanOrEqual(1 / n);
      expect(Math.abs(result.after.fraction - result.bigger.fraction)).toBeLessThanOrEqual(1 / n);
    });

    test('lays out again when the viewport changes', async ({ page }) => {
      const before = await page.evaluate(() =>
        window.harness.open('longChapter', 0, { fraction: 0.5 }),
      );
      await page.setViewportSize({
        width: Math.round(viewport.width * 0.6),
        height: viewport.height,
      });
      await expect
        .poll(() => page.evaluate(() => window.harness.info().pageCount))
        .not.toBe(before.pageCount);
      const after = await page.evaluate(() => window.harness.info());
      expect(Math.abs(after.fraction - before.fraction)).toBeLessThanOrEqual(1 / after.pageCount);
    });

    test('comes back to the same page when the viewport narrows and widens again', async ({
      page,
    }) => {
      const before = await page.evaluate(async () => {
        await window.harness.open('longChapter', 0, { fraction: 0 });
        for (let i = 0; i < 3; i++) window.harness.next();
        return window.harness.info();
      });
      for (let round = 0; round < 3; round++) {
        await page.setViewportSize({
          width: Math.round(viewport.width * 0.55),
          height: viewport.height,
        });
        await expect
          .poll(() => page.evaluate(() => window.harness.info().pageCount))
          .not.toBe(before.pageCount);
        await page.setViewportSize(viewport);
        await expect
          .poll(() => page.evaluate(() => window.harness.info().pageCount))
          .toBe(before.pageCount);
      }
      const after = await page.evaluate(() => window.harness.info());
      expect(after.page).toBe(before.page);
    });

    test('loads images and stylesheets from blob URLs', async ({ page }) => {
      await page.evaluate(() => window.harness.open('epub3Nav', 1, { fraction: 0 }));
      const loaded = await page.evaluate(() => {
        const doc = window.harness.frame().contentDocument!;
        return {
          imageWidth: doc.querySelector('img')!.naturalWidth,
          // book.css sets `body{font-family:serif}` and declares the font face `P`.
          bodyFont: getComputedStyle(doc.body).fontFamily,
          fontFaces: [...doc.fonts].map((face) => face.family),
        };
      });
      expect(loaded.imageWidth).toBe(2);
      expect(loaded.bodyFont).toBe('serif');
      expect(loaded.fontFaces).toContain('P');
    });

    test('hands link clicks to the reader', async ({ page }) => {
      await page.evaluate(() => {
        const calls: unknown[][] = [];
        (window as unknown as { opened: unknown[][] }).opened = calls;
        window.open = (...args: unknown[]) => {
          calls.push(args);
          return null;
        };
        return window.harness.open('epub3Nav', 1, { fraction: 0 });
      });
      // Click where the link shows on screen, as a reader would; the frame itself runs no script.
      const clickOn = async (text: string) => {
        const box = await page
          .frameLocator('iframe')
          .getByText(text, { exact: true })
          .boundingBox();
        await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      };
      await clickOn('next');
      expect(await page.evaluate(() => window.harness.lastLink)).toBe('OEBPS/text/ch3.xhtml#end');
      await clickOn('ext');
      expect(
        await page.evaluate(() => (window as unknown as { opened: unknown[][] }).opened),
      ).toEqual([['https://example.org/', '_blank', 'noopener,noreferrer']]);
      expect(await page.evaluate(() => window.harness.info().page)).toBe(0);
    });

    test('finds the first paragraph on each page, further on as the pages turn', async ({
      page,
    }) => {
      const firsts = await page.evaluate(async () => {
        const { pageCount } = await window.harness.open('longChapter', 0, { fraction: 0 });
        const found = [window.harness.firstParagraph()];
        for (let i = 1; i < pageCount; i++) {
          window.harness.next();
          found.push(window.harness.firstParagraph());
        }
        return found;
      });
      expect(firsts[0]).toEqual({ index: 0, text: '1' });
      for (let i = 1; i < firsts.length; i++) {
        expect(firsts[i]!.index).toBeGreaterThanOrEqual(firsts[i - 1]!.index);
      }
      expect(firsts.at(-1)!.index).toBeGreaterThan(60);
    });

    test('runs no book script and loads nothing from the network', async ({ page }) => {
      const outside: string[] = [];
      page.on('request', (request) => {
        const url = request.url();
        const local = [ORIGIN, `blob:${ORIGIN}`, 'data:', 'about:'];
        if (!local.some((prefix) => url.startsWith(prefix))) outside.push(url);
      });
      await page.evaluate(() => window.harness.open('malicious', 0, { fraction: 0 }));
      await page.waitForTimeout(500);
      const pwned = await page.evaluate(
        () => (window.harness.frame().contentWindow as unknown as { __pwned?: number }).__pwned,
      );
      expect(pwned).toBeUndefined();
      expect(outside).toEqual([]);
    });

    test('sandboxes the frame without scripts', async ({ page }) => {
      await page.evaluate(() => window.harness.open('epub3Nav', 0, { fraction: 0 }));
      expect(await page.locator('iframe').getAttribute('sandbox')).toBe('allow-same-origin');
      expect(await page.locator('iframe').count()).toBe(1);
    });
  });
}
