import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { epubZip, nav, opf, xhtml } from '../fixtures/epub-builder';

const LONG_BOOK = 'tests/fixtures/generated/long-book.epub';
const BASIC_DOCX = 'tests/fixtures/generated/basic.docx';

/**
 * The name a download is offered under. Playwright's WebKit on Linux turns the
 * spaces of a suggested name into underscores, though the page asked for
 * spaces, so there the same name is expected with them.
 */
function offeredAs(name: string): string {
  const webkitOnLinux = test.info().project.name === 'webkit' && process.platform === 'linux';
  return webkitOnLinux ? name.replaceAll(' ', '_') : name;
}

/** Every request the page makes outside its own origin. */
function watchForeignRequests(page: Page, origin: string): string[] {
  const foreign: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:')) {
      foreign.push(url);
    }
  });
  return foreign;
}

/** The room tabs are named for what each room does. */
const TAB = {
  Bibliotheca: 'Keep your books',
  Lectorium: 'Read a book',
  Scriptorium: 'Convert a file',
  Archivum: 'Manage your data',
} as const;

type Room = keyof typeof TAB;

async function openRoom(page: Page, room: Room): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Rooms' })
    .getByRole('link', { name: TAB[room] })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: room })).toBeVisible();
}

async function addBook(page: Page, path = LONG_BOOK): Promise<void> {
  await page.goto('/#/bibliotheca');
  await page.getByLabel('Add EPUB books').setInputFiles(path);
  await expect(page.getByRole('status')).toContainText('Added “Long Book”.');
}

async function openReader(page: Page): Promise<void> {
  await addBook(page);
  await page.getByRole('button', { name: 'Read Long Book' }).click();
  await expect(page.locator('.where')).toContainText(/Page 1 of \d+/);
}

test('adds a book to the library and keeps it after a reload', async ({ page }) => {
  await addBook(page);
  await expect(page.getByRole('heading', { name: 'Long Book', level: 2 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Long Book', level: 2 })).toBeVisible();
});

test('puts a book dropped on the Lectorium shelf there, ready to open', async ({ page }) => {
  await page.goto('/#/lectorium');
  await expect(page.getByText('No books yet.')).toBeVisible();
  const bytes = readFileSync(LONG_BOOK).toString('base64');
  await page.evaluate((base64) => {
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([data], 'long-book.epub', { type: 'application/epub+zip' }));
    document.dispatchEvent(
      new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
  }, bytes);
  await expect(page.getByRole('status')).toContainText('Added “Long Book”.');
  await expect(page.getByRole('heading', { level: 1, name: 'Lectorium' })).toBeVisible();
  await page.getByRole('link', { name: 'Long Book' }).click();
  await expect(page.locator('.where')).toContainText(/Page 1 of \d+/);
});

test('says a book is already in the library', async ({ page }) => {
  await addBook(page);
  await page.getByLabel('Add EPUB books').setInputFiles(LONG_BOOK);
  await expect(page.getByRole('status')).toContainText('“Long Book” is already in the library.');
  await expect(page.locator('.card')).toHaveCount(1);
});

test('turns a page and resumes there after a reload', async ({ page }) => {
  await openReader(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.where')).toContainText(/Page 2 of \d+/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.where')).toContainText(/Page 3 of \d+/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.where')).toContainText(/Page 2 of \d+/);
  await page.reload();
  await expect(page.locator('.where')).toContainText(/Page 2 of \d+/);
});

test('keeps its words up to date on a page the browser translates', async ({ page }) => {
  // As Google Translate does: each word of the app, once shown, is swapped for a translation
  // in <font> elements of its own, and the words it took away are never seen again.
  await page.addInitScript(() => {
    const swap = (root: Node): void => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const found: Text[] = root.nodeType === Node.TEXT_NODE ? [root as Text] : [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) found.push(n as Text);
      for (const text of found) {
        const parent = text.parentElement;
        if (!text.data.trim() || !parent || parent.closest('script,style,font,[translate="no"]'))
          continue;
        const font = document.createElement('font');
        font.textContent = text.data;
        text.replaceWith(font);
      }
    };
    addEventListener('DOMContentLoaded', () =>
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) if (n.isConnected) swap(n);
      }).observe(document.body, { childList: true, subtree: true }),
    );
  });
  await openReader(page);
  await expect(page.locator('.where font').first()).toBeAttached();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.where')).toContainText(/Page 2 of \d+/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.where')).toContainText(/Page 3 of \d+/);
  await expect(page.getByRole('heading', { level: 1, name: 'Long Book' })).toBeVisible();
});

test('turns one page for each turn of the wheel or swipe of two fingers', async ({ page }) => {
  await openReader(page);
  const box = (await page.locator('.pages').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // A touchpad sends many small moves for one swipe, and more while it glides.
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 15);
  await expect(page.locator('.where')).toContainText(/Page 2 of \d+/);
  await page.waitForTimeout(400);
  expect(await page.locator('.where').textContent()).toMatch(/Page 2 of \d+/);
  await page.mouse.wheel(60, 0);
  await expect(page.locator('.where')).toContainText(/Page 3 of \d+/);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, -100);
  await expect(page.locator('.where')).toContainText(/Page 2 of \d+/);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('gives the page most of the window and names the chapter', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openReader(page);
  await expect(page.locator('.where')).toContainText('% · Part 1');
  const box = await page.locator('.pages').boundingBox();
  expect(box!.height).toBeGreaterThan(800 * 0.6);
});

test('goes to a chapter from the contents', async ({ page }) => {
  await openReader(page);
  await page.getByRole('button', { name: 'Part 3' }).click();
  await expect(page.locator('.where')).toContainText('chapter 3 of 3');
});

test('adds, follows and deletes a bookmark', async ({ page }) => {
  await openReader(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.where')).toContainText(/Page 2 of/);
  await page.getByRole('button', { name: 'Bookmark this page' }).click();
  // The panel turns to the bookmarks, and its tab counts them.
  const bookmarksTab = page.getByRole('tab', { name: 'Bookmarks' });
  await expect(bookmarksTab).toHaveAttribute('aria-selected', 'true');
  await expect(bookmarksTab).toHaveText('Bookmarks1');
  const marks = page.locator('.marks li');
  await expect(marks).toHaveCount(1);
  await expect(marks).toContainText('Part 1');

  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(marks).toBeHidden();
  await page.getByRole('button', { name: 'Part 2' }).click();
  await expect(page.locator('.where')).toContainText('chapter 2 of 3');
  await bookmarksTab.click();
  await marks.getByRole('button', { name: /Part 1/ }).click();
  await expect(page.locator('.where')).toContainText(/Page 2 of .* chapter 1 of 3/);

  await page.reload();
  // The arrow keys move along the tabs without turning the page.
  await expect(page.locator('.where')).toContainText(/Page \d+ of/);
  const before = await page.locator('.where').textContent();
  await page.getByRole('tab', { name: 'Contents' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(bookmarksTab).toBeFocused();
  await expect(bookmarksTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.where')).toHaveText(before!);
  await expect(marks).toHaveCount(1);
  await marks.getByRole('button', { name: 'Delete bookmark' }).click();
  await expect(marks).toHaveCount(0);
});

test('goes back to the shelf from a book in one click', async ({ page }) => {
  await openReader(page);
  await page.getByRole('link', { name: 'All books' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Choose a book' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Long Book' })).toBeVisible();
});

test('puts books on the shelf from its own button', async ({ page }) => {
  await page.goto('/#/lectorium');
  await page.getByLabel('Add EPUB books').setInputFiles(LONG_BOOK);
  await expect(page.getByRole('status')).toContainText('Added “Long Book”.');
  await expect(page.getByRole('heading', { level: 1, name: 'Lectorium' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Long Book' })).toBeVisible();
});

/** A one-chapter EPUB to put on the shelf; i keeps each book's identifier apart. */
function tinyBook(i: number, title: string, creators: string[] = []) {
  return {
    name: `shelf-${i}.epub`,
    mimeType: 'application/epub+zip',
    buffer: Buffer.from(
      epubZip({
        'OEBPS/content.opf': opf({
          title,
          creators,
          identifier: `urn:uuid:00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          items: [
            { id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml', properties: 'nav' },
            { id: 'c1', href: 'c1.xhtml', mediaType: 'application/xhtml+xml' },
          ],
          spine: ['c1'],
        }),
        'OEBPS/nav.xhtml': nav([{ label: 'One', href: 'c1.xhtml' }]),
        'OEBPS/c1.xhtml': xhtml('One', `<p>Book ${i}.</p>`),
      }),
    ),
  };
}

test('lets only the newest books fall onto the shelf after a large import', async ({ page }) => {
  const files = Array.from({ length: 15 }, (_, i) => tinyBook(i, `Shelf Book ${i}`));
  await page.goto('/#/lectorium');
  await page.getByLabel('Add EPUB books').setInputFiles(files);
  // Read the shelf the moment the books are on it, before the first one has finished falling.
  const shelf = await page.waitForFunction(() => {
    const books = [...document.querySelectorAll('.bookcase li')];
    if (books.length < 15) return undefined;
    const falling = (title: string): boolean =>
      books.some((li) => li.textContent?.includes(title) && li.classList.contains('landing'));
    return {
      falling: books.filter((li) => li.classList.contains('landing')).length,
      oldest: falling('Shelf Book 0'),
      newest: falling('Shelf Book 14'),
    };
  });
  expect(await shelf.jsonValue()).toEqual({ falling: 12, oldest: false, newest: true });
});

test('finds a book on a large shelf and keeps the order chosen', async ({ page }) => {
  await page.goto('/#/bibliotheca');
  await page
    .getByLabel('Add EPUB books')
    .setInputFiles([
      tinyBook(1, 'The Raven', ['Edgar Allan Poe']),
      tinyBook(2, 'Emma', ['Jane Austen']),
      tinyBook(3, 'Le città invisibili', ['Italo Calvino']),
    ]);
  const books = page.getByRole('list', { name: 'Books' }).getByRole('heading', { level: 2 });
  await expect(books).toHaveCount(3);
  await expect(page.getByText('3 books')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Find a book' }).fill('citta');
  await expect(books).toHaveText(['Le città invisibili']);
  await expect(page.getByText('1 of 3 books')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Find a book' }).fill('tolstoy');
  await expect(page.getByText('No book on your shelf matches “tolstoy”.')).toBeVisible();
  await page.getByRole('button', { name: 'Show all books' }).click();
  await expect(books).toHaveCount(3);

  await page.getByLabel('Order').selectOption('author');
  await expect(books).toHaveText(['Emma', 'Le città invisibili', 'The Raven']);
  await page.reload();
  await expect(page.getByLabel('Order')).toHaveValue('author');
  await expect(books).toHaveText(['Emma', 'Le città invisibili', 'The Raven']);
});

test('opens the file picker from every button and from the empty shelves', async ({ page }) => {
  async function picks(target: ReturnType<Page['locator']>, multiple: boolean): Promise<void> {
    const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
    await target.click();
    expect((await chooser).isMultiple()).toBe(multiple);
  }
  const main = page.getByRole('main');

  await page.goto('/');
  await picks(main.locator('label', { hasText: 'Choose files to convert' }), true);
  await picks(main.locator('label', { hasText: 'Add EPUB books' }), true);

  await page.goto('/#/bibliotheca');
  await picks(main.locator('label', { hasText: 'Add EPUB books' }), true);
  await picks(main.locator('.drop-zone'), true);

  await page.goto('/#/lectorium');
  await picks(main.locator('label', { hasText: 'Add EPUB books' }), true);
  await picks(main.locator('.pick-area'), true);

  await page.goto('/#/scriptorium');
  await picks(main.locator('label', { hasText: 'Choose files' }), true);
});

test('takes a click on a room while the screen is still changing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: TAB.Bibliotheca }).click();
  // Click as soon as the room is there, while the move into it is still playing.
  await expect(page.getByRole('heading', { level: 1, name: 'Bibliotheca' })).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.dataset.nav)).toBe('in');
  const button = page.getByRole('main').locator('label', { hasText: 'Add EPUB books' });
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await chooser;
});

test('opens a room at its top, however far down the hall was', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^Open the Bibliotheca/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bibliotheca' })).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('changes rooms as fast as the keys are pressed, without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
  for (const key of ['1', '2', '3', '4', '5', '0', '3']) await page.keyboard.press(key);
  await expect(page.getByRole('heading', { level: 1, name: 'Scriptorium' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-nav');
  expect(errors).toEqual([]);
});

test('pins a note to a page and keeps it after a reload', async ({ page }) => {
  await openReader(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.where')).toContainText(/Page 2 of/);
  await page.getByRole('button', { name: 'Add note' }).click();
  const note = page.getByRole('textbox', { name: 'Note on this page' });
  await expect(note).toBeFocused();
  await note.fill('Compare with the opening.');
  await page.keyboard.press('Tab');
  const listed = page.locator('.notes-list li');
  await expect(listed).toContainText('Compare with the opening.');

  // The note belongs to its page: it is gone on the next one and back on its own.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(note).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(note).toHaveValue('Compare with the opening.');

  await page.reload();
  await expect(note).toHaveValue('Compare with the opening.');
  await page.locator('.page-note').getByRole('button', { name: 'Delete note' }).click();
  await expect(note).toHaveCount(0);
  await expect(listed).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.where')).toContainText(/Page 2 of/);
  await expect(note).toHaveCount(0);
});

test('takes an empty note off the page', async ({ page }) => {
  await openReader(page);
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByRole('textbox', { name: 'Note on this page' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('.page-note')).toHaveCount(0);
});

test('fits the page to the window and gives the chrome back', async ({ page }) => {
  await openReader(page);
  const bar = page.locator('.reading-bar');
  await page.keyboard.press('f');
  await expect(bar).toBeHidden();
  const box = await page.locator('.pages').boundingBox();
  const view = page.viewportSize()!;
  expect(box!.width).toBeGreaterThan(view.width * 0.9);
  await page.keyboard.press('Escape');
  await expect(bar).toBeVisible();

  // A tap in the middle of the page does the same, and so does the bar left in full page.
  await page.locator('.pages').click();
  await expect(bar).toBeHidden();
  await page.getByRole('button', { name: 'Exit full page' }).click();
  await expect(bar).toBeVisible();
  await expect(page.locator('.where')).toContainText(/Page 1 of/);
});

test('two taps in the middle fill the whole screen, and two more give it back', async ({
  page,
  browserName,
}) => {
  await openReader(page);
  const bar = page.locator('.reading-bar');
  const full = () => page.evaluate(() => document.fullscreenElement !== null);
  await page.locator('.pages').dblclick();
  await expect(bar).toBeHidden();
  // Playwright's WebKit grants no full screen; the full page is what it gets.
  if (browserName === 'chromium') await expect.poll(full).toBe(true);
  await page.locator('.pages').dblclick();
  await expect(bar).toBeVisible();
  await expect.poll(full).toBe(false);
  await expect(page.locator('.where')).toContainText(/Page 1 of/);
});

test('a mouse fills the screen with a double click slower than a finger', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', "Playwright's WebKit grants no full screen");
  await openReader(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-nav');
  const full = () => page.evaluate(() => document.fullscreenElement !== null);
  const box = (await page.locator('.pages').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.mouse.down({ clickCount: 2 });
  await page.mouse.up({ clickCount: 2 });
  await expect.poll(full).toBe(true);
  await page.locator('.pages').dblclick();
  await expect.poll(full).toBe(false);
  await expect(page.locator('.reading-bar')).toBeVisible();
});

test('turns the page with a tap on its sides or a swipe', async ({ page }) => {
  await openReader(page);
  // Raw mouse events skip Playwright's hit check: wait until the screen has stopped moving.
  await expect(page.locator('html')).not.toHaveAttribute('data-nav');
  const box = (await page.locator('.pages').boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.click(box.x + box.width * 0.9, y);
  await expect(page.locator('.where')).toContainText(/Page 2 of/);
  await page.mouse.click(box.x + box.width * 0.1, y);
  await expect(page.locator('.where')).toContainText(/Page 1 of/);

  // A drag to the left is a swipe to the next page, not a tap in the middle.
  await page.mouse.move(box.x + box.width * 0.6, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y + 5, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.where')).toContainText(/Page 2 of/);
  await expect(page.locator('.reading-bar')).toBeVisible();
});

test('changes the text size and keeps it', async ({ page }) => {
  await openReader(page);
  const toggle = page.getByRole('button', { name: 'Look', exact: true });
  await toggle.click();
  await page.getByRole('button', { name: 'Larger text' }).click();
  await expect(page.locator('.size')).toHaveText('110%');
  await page.getByRole('button', { name: 'Sepia' }).click();
  await expect(page.getByRole('button', { name: 'Sepia' })).toHaveAttribute('aria-pressed', 'true');
  // Escape puts the settings away and gives the focus back to their button.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Larger text' })).toBeHidden();
  await expect(toggle).toBeFocused();
  // The reader's own "Text size" group is still on screen until the room changes.
  await openRoom(page, 'Archivum');
  await expect(page.getByLabel('Text size')).toHaveValue('110');
});

test('shows the page colours as squares and colours the page with the one chosen', async ({
  page,
}) => {
  await openReader(page);
  await page.getByRole('button', { name: 'Look', exact: true }).click();
  const sepia = page.getByRole('button', { name: 'Sepia' });
  await expect(sepia).toHaveText('');
  const box = (await sepia.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(1);
  await sepia.click();
  await expect(sepia).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Light' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.frameLocator('.pages iframe').locator('html')).toHaveCSS(
    'background-color',
    'rgb(244, 236, 216)',
  );
});

test('removes a book', async ({ page }) => {
  await addBook(page);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Remove Long Book' }).click();
  await expect(page.getByText('No books yet.')).toBeVisible();
});

test('shows a message for a file that is not an EPUB', async ({ page }) => {
  await page.goto('/#/bibliotheca');
  await page.getByLabel('Add EPUB books').setInputFiles({
    name: 'notes.epub',
    mimeType: 'application/epub+zip',
    buffer: Buffer.from('not a zip'),
  });
  await expect(page.locator('.notices .error')).toContainText('notes.epub:');
});

test('reports an unknown book in the reader', async ({ page }) => {
  await page.goto('/#/read/nothing-here');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The book did not open');
  await expect(page.getByRole('link', { name: 'Back to the library' })).toBeVisible();
  // The room's tab does not lead back to a book that is not there.
  await page.getByRole('link', { name: 'Back to the library' }).click();
  await openRoom(page, 'Lectorium');
  await expect(page).toHaveURL(/#\/lectorium$/);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test.describe('Scriptorium', () => {
  test.beforeEach(async ({ page }) => {
    // The print dialog cannot be driven; record that it was asked for instead.
    await page.addInitScript(() => {
      window.print = () => {
        (window.top as Window & { printed?: number }).printed =
          ((window.top as Window & { printed?: number }).printed ?? 0) + 1;
      };
    });
    await page.goto('/#/scriptorium');
  });

  for (const [label, extension] of [
    ['Word', '.docx'],
    ['Markdown', '.md'],
    ['Text', '.txt'],
    ['Web page', '.html'],
  ] as const) {
    test(`converts an EPUB to ${label}`, async ({ page }) => {
      await page.getByLabel('Choose files').setInputFiles(LONG_BOOK);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: label, exact: true }).click();
      expect((await download).suggestedFilename()).toBe(offeredAs(`Long Book${extension}`));
      await expect(page.getByRole('status')).toContainText(`Saved “Long Book${extension}”.`);
      const check = page.getByRole('region', { name: 'Checked against the original' });
      await expect(check.getByRole('definition').first()).toContainText(/^\s*All [\d,]+/);
    });
  }

  test('opens the print preview for PDF and prints from it', async ({ page }) => {
    await page.getByLabel('Choose files').setInputFiles(LONG_BOOK);
    await page.getByRole('button', { name: 'PDF (print)' }).click();
    const preview = page.getByRole('dialog', { name: 'Save as PDF' });
    await expect(preview).toBeVisible();
    await expect(preview.getByText('Laying out the pages…')).toHaveCount(0);
    // Number keys open the rooms, but not while the preview is open.
    await page.keyboard.press('1');
    await expect(preview).toBeVisible();
    await preview.getByRole('button', { name: 'Save as PDF' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { printed?: number }).printed))
      .toBe(1);
    await expect(preview).toBeVisible();
    await preview.getByRole('button', { name: 'Close the preview' }).click();
    await expect(preview).toHaveCount(0);
    await expect(page.locator('.done [role="status"]')).toContainText('Save as PDF');
    await page.getByRole('button', { name: 'Open the preview again' }).click();
    await expect(page.getByRole('dialog', { name: 'Save as PDF' })).toBeVisible();
  });

  test('lays out the preview with the options chosen', async ({ page }) => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.getByLabel('Choose files').setInputFiles({
      name: 'plates.epub',
      mimeType: 'application/epub+zip',
      buffer: Buffer.from(
        epubZip({
          'OEBPS/content.opf': opf({
            title: 'Plates',
            items: [
              {
                id: 'nav',
                href: 'nav.xhtml',
                mediaType: 'application/xhtml+xml',
                properties: 'nav',
              },
              { id: 'c1', href: 'c1.xhtml', mediaType: 'application/xhtml+xml' },
              { id: 'p1', href: 'p1.png', mediaType: 'image/png' },
            ],
            spine: ['c1'],
          }),
          'OEBPS/nav.xhtml': nav([{ label: 'One', href: 'c1.xhtml' }]),
          'OEBPS/c1.xhtml': xhtml('One', '<p>A plate.</p><p><img src="p1.png" alt="Plate"/></p>'),
          'OEBPS/p1.png': new Uint8Array(pixel),
        }),
      ),
    });
    await page.getByRole('button', { name: 'PDF (print)' }).click();
    const preview = page.getByRole('dialog', { name: 'Save as PDF' });
    const pages = page.frameLocator('iframe[title="Preview of the pages"]');
    // The rules of a style element are not shown text: read them as they are written.
    const pageRules = () => pages.locator('#print-options').evaluate((style) => style.textContent);
    await expect(pages.getByRole('img', { name: 'Plate' })).toBeVisible();

    await preview.getByRole('combobox', { name: /^Page/ }).selectOption('a5');
    await expect.poll(pageRules).toContain('size: A5');
    await preview.getByRole('checkbox', { name: 'Table of contents' }).uncheck();
    await expect(pages.getByRole('navigation')).toBeHidden();

    await preview.getByRole('checkbox', { name: 'Pictures' }).uncheck();
    await expect(pages.getByText('A plate.')).toBeVisible();
    await expect(pages.locator('img')).toHaveCount(0);
    // A new copy keeps the options already chosen.
    await expect.poll(pageRules).toContain('size: A5');

    await preview.getByRole('button', { name: 'Save as PDF' }).click();
    await preview.getByRole('button', { name: 'Close the preview' }).click();
    const check = page.getByRole('region', { name: 'Checked against the original' });
    await expect(check).toContainText('Left out, as you chose.');
  });

  test('opens a new EPUB in the reader', async ({ page }) => {
    await page.getByLabel('Choose files').setInputFiles({
      name: 'notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# One\n\nSome *text* to read here.\n'),
    });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'EPUB', exact: true }).click();
    await download;
    await page.getByRole('button', { name: 'Read it here' }).click();
    await expect(page).toHaveURL(/#\/read\//);
    await expect(
      page.frameLocator('.pages iframe').getByText('Some text to read here.'),
    ).toBeVisible();
  });

  test('opens the book of a copy in another format in the reader', async ({ page }) => {
    await page.getByLabel('Choose files').setInputFiles({
      name: 'notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# One\n\nSome *text* to read here.\n'),
    });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Word', exact: true }).click();
    await download;
    await page.getByRole('button', { name: 'Read it here' }).click();
    await expect(page).toHaveURL(/#\/read\//);
    await expect(
      page.frameLocator('.pages iframe').getByText('Some text to read here.'),
    ).toBeVisible();
  });

  test('converts Markdown to EPUB with the title typed in', async ({ page }) => {
    await page.getByLabel('Choose files').setInputFiles({
      name: 'notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# One\n\nSome *text*.\n\n# Two\n\nMore.\n'),
    });
    await page.getByLabel('Title').fill('My Notes');
    await page.getByLabel('Author').fill('A. Writer');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'EPUB', exact: true }).click();
    expect((await download).suggestedFilename()).toBe(offeredAs('My Notes.epub'));
  });

  test('converts plain text to EPUB without a title', async ({ page }) => {
    await page.getByLabel('Choose files').setInputFiles({
      name: 'diary.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('First day.\n\nSecond day.\n'),
    });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'EPUB', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('diary.epub');
  });

  test('converts Word to EPUB', async ({ page }) => {
    await page.getByLabel('Choose files').setInputFiles(BASIC_DOCX);
    await expect(page.getByLabel('Title')).toHaveCount(0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'EPUB', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.epub$/);
  });

  test('removes a chosen file with the cross next to its name', async ({ page }) => {
    await page.getByLabel('Choose files').setInputFiles(BASIC_DOCX);
    await expect(page.getByRole('button', { name: 'EPUB', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Remove basic\.docx/ }).click();
    await expect(page.locator('.picked')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'EPUB', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Choose files')).toBeFocused();
  });

  test('refuses a file it cannot read', async ({ page }) => {
    await page.getByLabel('Choose files').setInputFiles({
      name: 'scan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n'),
    });
    await expect(page.locator('.notices .error')).toContainText('scan.pdf:');
  });

  test('takes the pictures a Markdown file shows when they are chosen with it', async ({
    page,
  }) => {
    const choose = page.getByLabel('Choose files');
    await choose.setInputFiles(text('notes.md', '# Notes\n\n![A drawing](img/drawing.png)\n'));
    const note = page.getByText('Your Markdown file shows “drawing.png”.');
    await expect(note).toBeVisible();
    await choose.setInputFiles({
      name: 'drawing.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await expect(page.getByRole('list', { name: 'Pictures' }).getByRole('listitem')).toHaveCount(1);
    await expect(note).toHaveCount(0);
    await expect(page.locator('.picked')).toHaveCount(2);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Web page', exact: true }).click();
    const html = readFileSync((await (await download).path())!, 'utf8');
    expect(html).toMatch(/<img [^>]*src="data:image\/png;base64,/);
  });

  test('asks for a Markdown file’s pictures with a chooser of their own', async ({ page }) => {
    // On Android a chooser that names a picture type opens the photo gallery and nothing else.
    expect(await page.getByLabel('Choose files').getAttribute('accept')).not.toMatch(
      /image\/|\.png|\.jpe?g/,
    );
    await expect(page.getByLabel('Choose pictures')).toHaveCount(0);
    await page
      .getByLabel('Choose files')
      .setInputFiles(text('notes.md', '# Notes\n\n![A drawing](img/drawing.png)\n'));
    const pictures = page.getByLabel('Choose pictures');
    expect(await pictures.getAttribute('accept')).toMatch(/image\/png/);
    await pictures.setInputFiles({
      name: 'drawing.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await expect(page.getByRole('list', { name: 'Pictures' }).getByRole('listitem')).toHaveCount(1);
    await expect(pictures).toHaveCount(0);
  });

  const text = (name: string, body: string) => ({
    name,
    mimeType: name.endsWith('.md') ? 'text/markdown' : 'text/plain',
    buffer: Buffer.from(body),
  });

  test('converts several files together and zips the copies', async ({ page }) => {
    await page
      .getByLabel('Choose files')
      .setInputFiles([
        text('a.md', '# One\n\nFirst.\n'),
        text('b.txt', 'Second.\n'),
        text('c.txt', 'Third.\n'),
      ]);
    await expect(page.locator('.picked')).toHaveCount(3);
    await expect(page.getByLabel('Title')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'PDF (print)' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Word', exact: true }).click();

    const rows = page.getByRole('list', { name: 'Files' }).getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(page.locator('.done [role="status"]')).toContainText('All 3 files copied.');
    await expect(rows.getByRole('button', { name: /^Download/ })).toHaveCount(3);
    await expect(rows.locator('details summary')).toHaveCount(3);

    const one = page.waitForEvent('download');
    await rows.getByRole('button', { name: 'Download b.docx' }).click();
    expect((await one).suggestedFilename()).toBe('b.docx');

    const all = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download all (.zip)' }).click();
    const zip = await all;
    expect(zip.suggestedFilename()).toBe(offeredAs('Copista copies (Word).zip'));
    const entries = unzipSync(new Uint8Array(readFileSync((await zip.path())!)));
    // The Markdown file takes its title from its only top heading.
    expect(Object.keys(entries).sort()).toEqual(['One.docx', 'b.docx', 'c.docx']);
  });

  test('goes on with the other files when one fails', async ({ page }) => {
    await page.getByLabel('Choose files').setInputFiles([
      {
        name: 'broken.epub',
        mimeType: 'application/epub+zip',
        buffer: Buffer.from(epubZip({})),
      },
      text('fine.md', '# Fine\n\nStill here.\n'),
    ]);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    const rows = page.getByRole('list', { name: 'Files' }).getByRole('listitem');
    await expect(page.locator('.done [role="status"]')).toContainText('1 of 2 files copied.');
    await expect(rows.first().locator('.error')).toBeVisible();
    await expect(rows.last().getByRole('button', { name: 'Download fine.txt' })).toBeVisible();
  });

  test('puts several new EPUBs on the shelf at once', async ({ page }) => {
    await page
      .getByLabel('Choose files')
      .setInputFiles([text('alpha.md', 'First.\n'), text('beta.md', 'Second.\n')]);
    await page.getByRole('button', { name: 'EPUB', exact: true }).click();
    await page.getByRole('button', { name: 'Put them all on the shelf' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Lectorium' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^alpha/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^beta/ })).toBeVisible();
  });

  test('adds files chosen later to those already chosen', async ({ page }) => {
    await page.getByLabel('Choose files').setInputFiles(text('a.txt', 'One.\n'));
    await expect(page.getByLabel('Title')).toBeVisible();
    await page.getByLabel('Choose files').setInputFiles(text('b.txt', 'Two.\n'));
    await expect(page.locator('.picked')).toHaveCount(2);
    await expect(page.getByLabel('Title')).toHaveCount(0);
    await page.getByRole('button', { name: /^Remove a\.txt/ }).click();
    await expect(page.locator('.picked')).toHaveCount(1);
    await expect(page.getByLabel('Title')).toBeVisible();
  });

  test('keeps the files chosen and the last job on coming back from another room', async ({
    page,
  }) => {
    await page.getByLabel('Choose files').setInputFiles(text('diary.txt', 'First day.\n'));
    await page.getByLabel('Title').fill('Days');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Web page', exact: true }).click();
    await download;
    await openRoom(page, 'Bibliotheca');
    await openRoom(page, 'Scriptorium');
    await expect(page.locator('.picked')).toHaveText(/diary\.txt/);
    await expect(page.getByLabel('Title')).toHaveValue('Days');
    await expect(page.locator('.done [role="status"]')).toContainText('Saved “Days.html”.');
    await expect(page.getByRole('region', { name: 'Checked against the original' })).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test('brings the outcome into view once the copy is made', async ({ page }) => {
      await page.getByLabel('Choose files').setInputFiles(text('diary.txt', 'First day.\n'));
      const done = page.getByRole('heading', { name: 'Done' });
      await expect(done).not.toBeInViewport();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'EPUB', exact: true }).click();
      await download;
      await expect(done).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Read it here' })).toBeInViewport();
    });
  });

  test('converts a book from the library', async ({ page }) => {
    await addBook(page);
    await openRoom(page, 'Scriptorium');
    const book = await page.getByRole('option', { name: /^Long Book/ }).getAttribute('value');
    await page.getByLabel('Or a book from your library').selectOption(book!);
    await expect(page.getByRole('button', { name: 'EPUB', exact: true })).toHaveCount(0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    expect((await download).suggestedFilename()).toBe(offeredAs('Long Book.txt'));
    // The copy is read from the book already on the shelf, not a second one.
    await page.getByRole('button', { name: 'Read it here' }).click();
    await expect(page).toHaveURL(`/#/read/${encodeURIComponent(book!)}`);
    await openRoom(page, 'Bibliotheca');
    await expect(page.getByRole('button', { name: 'Read Long Book' })).toHaveCount(1);
  });
});

test('deletes all data from the Archivum', async ({ page }) => {
  await addBook(page);
  await openRoom(page, 'Archivum');
  await expect(page.getByText('Sent anywhere')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete all my data' }).click();
  await expect(page.getByRole('status')).toContainText('has been deleted');
  await openRoom(page, 'Bibliotheca');
  await expect(page.getByText('No books yet.')).toBeVisible();
});

test('makes no request outside its own site', async ({ page, baseURL }) => {
  const foreign = watchForeignRequests(page, baseURL!);
  await openReader(page);
  await page.getByRole('button', { name: 'Next' }).click();
  for (const room of ['Scriptorium', 'Archivum', 'Bibliotheca'] as const) {
    await openRoom(page, room);
  }
  await page.getByRole('link', { name: 'Copista, all rooms' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
  expect(foreign).toEqual([]);
});

test('links to free libraries and searches them for what is typed', async ({ page }) => {
  await page.goto('/#/bibliotheca');
  const free = page.getByRole('region', { name: 'Find free books' });
  const visit = free.getByRole('link', { name: 'Visit Project Gutenberg' });
  await expect(visit).toHaveAttribute('href', 'https://www.gutenberg.org/');
  await expect(visit).toHaveAttribute('target', '_blank');
  await expect(visit).toHaveAttribute('rel', 'noopener noreferrer');

  await free.getByRole('searchbox', { name: 'Title or author to search for' }).fill('Dante');
  await expect(free.getByRole('link', { name: 'Search Project Gutenberg' })).toHaveAttribute(
    'href',
    'https://www.gutenberg.org/ebooks/search/?query=Dante',
  );
  await expect(free.getByRole('link', { name: 'Find Canti at Liber Liber' })).toHaveAttribute(
    'href',
    'https://liberliber.it/autori/autori-l/giacomo-leopardi/canti/',
  );
});

test.describe('Listen', () => {
  /** Sets up the fake voice, and counts the pieces the page starts playing. */
  async function withVoice(page: Page): Promise<void> {
    await page.addInitScript(() => {
      localStorage.setItem('copista-test-voice', 'installed');
      const played: string[] = [];
      const players: HTMLMediaElement[] = [];
      Object.assign(window, { played, players });
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        played.push(this.src);
        if (!players.includes(this)) players.push(this);
        return play.call(this);
      };
    });
  }

  /** The sound the voice plays through last: how far it has played, whether it plays, how fast. */
  const sound = (page: Page): Promise<{ at: number; playing: boolean; rate: number }> =>
    page.evaluate(() => {
      const players = (window as unknown as { players: HTMLMediaElement[] }).players;
      const last = players.at(-1);
      return {
        at: last?.currentTime ?? 0,
        playing: players.some((p) => !p.paused),
        rate: last?.playbackRate ?? 1,
      };
    });

  /** Leaves the fake voice to be set up, and counts the pieces the page starts playing. */
  async function withoutVoice(page: Page): Promise<void> {
    await page.addInitScript(() => {
      if (localStorage.getItem('copista-test-voice') === null) {
        localStorage.setItem('copista-test-voice', 'absent');
      }
    });
  }

  async function startDownload(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    const sheet = page.locator('#voice-sheet');
    await sheet.getByLabel('I accept the licence and its use restrictions').check();
    await sheet.getByRole('button', { name: 'Download the voice' }).click();
    await expect(sheet.getByRole('progressbar')).toBeVisible();
  }

  test('opens the voice sheet when the voice is not set up', async ({ page }) => {
    await withoutVoice(page);
    await openReader(page);
    const listen = page.getByRole('button', { name: 'Listen', exact: true });
    await expect(listen).toHaveAttribute('aria-expanded', 'false');
    await listen.click();
    await expect(listen).toHaveAttribute('aria-expanded', 'true');
    const sheet = page.locator('#voice-sheet');
    await expect(sheet.getByRole('heading', { name: /^The Lector/ })).toContainText('Beta');
    await expect(sheet.getByText('It may stumble over a name or a number')).toBeVisible();
    await expect(sheet.locator('audio')).toHaveCount(2);
    for (const lang of ['it', 'en']) {
      for (const name of ['lector', 'lectrix']) {
        for (const extension of ['webm', 'm4a']) {
          const sample = await page.request.get(`/voice/${lang}/${name}.${extension}`);
          expect(sample.status()).toBe(200);
        }
      }
    }
    for (const file of ['openrail-m.txt', 'notices.txt']) {
      expect((await page.request.get(`/licences/${file}`)).status()).toBe(200);
    }
    await expect(sheet.getByText('Works best on recent phones and computers.')).toBeVisible();
    const download = sheet.getByRole('button', { name: 'Download the voice' });
    await expect(download).toBeDisabled();
    await sheet.getByLabel('I accept the licence and its use restrictions').check();
    await expect(download).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(listen).toBeFocused();
  });

  test('plays the samples in the language of the book, and in the other on a press', async ({
    page,
  }) => {
    await withoutVoice(page);
    const sources = (lang: string): string[] =>
      ['lector', 'lectrix'].flatMap((name) => [`${lang}/${name}.webm`, `${lang}/${name}.m4a`]);
    const heard = async (): Promise<string[]> =>
      (await page
        .locator('#voice-sheet audio source')
        .evaluateAll((all) =>
          all.map((s) => (s as HTMLSourceElement).src.replace(/.*\/voice\//, '')),
        )) as string[];
    const sheetIn = async (): Promise<void> => {
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      await expect(page.locator('#voice-sheet')).toBeVisible();
    };
    const group = page.getByRole('group', { name: 'Language of the samples' });
    const italiano = group.getByRole('button', { name: 'Italiano' });
    const english = group.getByRole('button', { name: 'English' });

    // An English book: the samples are heard in English first.
    await openReader(page);
    await sheetIn();
    await expect(english).toHaveAttribute('aria-pressed', 'true');
    await expect(italiano).toHaveAttribute('aria-pressed', 'false');
    expect(await heard()).toEqual(sources('en'));
    await italiano.click();
    await expect(italiano).toHaveAttribute('aria-pressed', 'true');
    expect(await heard()).toEqual(sources('it'));

    // An Italian book: in Italian first, the language the voice reads it in.
    await page.goto('/#/lectorium');
    await page.getByLabel('Add EPUB books').setInputFiles({
      name: 'libro.epub',
      mimeType: 'application/epub+zip',
      buffer: Buffer.from(
        epubZip({
          'OEBPS/content.opf': opf({
            title: 'Libro',
            language: 'it',
            items: [
              {
                id: 'nav',
                href: 'nav.xhtml',
                mediaType: 'application/xhtml+xml',
                properties: 'nav',
              },
              { id: 'c1', href: 'c1.xhtml', mediaType: 'application/xhtml+xml' },
            ],
            spine: ['c1'],
          }),
          'OEBPS/nav.xhtml': nav([{ label: 'Uno', href: 'c1.xhtml' }]),
          'OEBPS/c1.xhtml': xhtml('Uno', '<p>C’era una volta un pezzo di legno.</p>'),
        }),
      ),
    });
    await page.getByRole('link', { name: 'Libro' }).click();
    await sheetIn();
    await expect(italiano).toHaveAttribute('aria-pressed', 'true');
    expect(await heard()).toEqual(sources('it'));
    await english.click();
    expect(await heard()).toEqual(sources('en'));
  });

  test('closes the voice sheet on a press outside it, and with its close button', async ({
    page,
  }) => {
    await withoutVoice(page);
    await openReader(page);
    const sheet = page.locator('#voice-sheet');
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await expect(sheet).toBeVisible();
    await page.locator('.where').click();
    await expect(sheet).toBeHidden();
    // The sheet and the Look card never show together.
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await page.getByRole('button', { name: 'Look' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('#reader-look')).toBeVisible();
  });

  test('sets the voice up from the sheet and reads from here', async ({ page, browserName }) => {
    // Playwright's WebKit on Windows plays no audio at all: play() fails as not supported.
    test.skip(browserName === 'webkit', 'this WebKit build has no audio');
    await withoutVoice(page);
    await openReader(page);
    await startDownload(page);
    const sheet = page.locator('#voice-sheet');
    await expect(sheet.getByRole('status')).toContainText('The voice is ready.');
    await sheet.getByRole('button', { name: 'Listen from here' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'Listen', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('keeps downloading with the sheet closed', async ({ page }) => {
    await withoutVoice(page);
    await openReader(page);
    await startDownload(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#voice-sheet')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('copista-test-voice')))
      .toBe('installed');
    // With the voice in, Listen stops opening the sheet and reads.
    const listen = page.getByRole('button', { name: 'Listen', exact: true });
    await expect(listen).toHaveAttribute('aria-pressed', 'false');
    await expect(listen).not.toHaveAttribute('aria-expanded');
    await expect(page.locator('#voice-sheet')).toBeHidden();
  });

  test('tests the device after the download, and keeps Listen off where it fails', async ({
    page,
  }) => {
    await withoutVoice(page);
    await page.addInitScript(() => localStorage.setItem('copista-test-voice-unfit', 'stalled'));
    await openReader(page);
    await startDownload(page);
    const sheet = page.locator('#voice-sheet');
    await expect(sheet.getByRole('status')).toContainText('This device is not fast enough');
    await expect(sheet.getByRole('button', { name: 'Listen from here' })).toBeHidden();
    await expect(sheet.getByRole('button', { name: 'Remove the voice' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Test again' })).toBeVisible();
    await page.keyboard.press('Escape');
    // Listen opens the sheet again instead of reading.
    const listen = page.getByRole('button', { name: 'Listen', exact: true });
    await listen.click();
    await expect(sheet).toBeVisible();
    await expect(listen).not.toHaveAttribute('aria-pressed');

    // A device that passes when tested again reads.
    await page.evaluate(() => localStorage.removeItem('copista-test-voice-unfit'));
    await sheet.getByRole('button', { name: 'Test again' }).click();
    await expect(sheet.getByRole('status')).toContainText('The voice is ready.');
    await expect(sheet.getByRole('button', { name: 'Listen from here' })).toBeVisible();
  });

  test('stops a download when asked', async ({ page }) => {
    await withoutVoice(page);
    await openReader(page);
    await startDownload(page);
    const sheet = page.locator('#voice-sheet');
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet.getByRole('status')).toContainText('Download stopped.');
    await expect(sheet.getByRole('button', { name: 'Download the voice' })).toBeVisible();
  });

  test('chooses who reads, and removes the voice, from the sheet', async ({ page }) => {
    await withoutVoice(page);
    await openReader(page);
    await startDownload(page);
    const sheet = page.locator('#voice-sheet');
    await expect(sheet.getByRole('status')).toContainText('The voice is ready.');
    await expect(sheet.getByText('Space used')).toBeVisible();

    await sheet.getByRole('radio', { name: 'The Lectrix' }).check();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise((resolve) => {
              indexedDB.open('copista').onsuccess = ({ target }) => {
                const db = (target as IDBOpenDBRequest).result;
                const get = db.transaction('settings').objectStore('settings').get('reader');
                get.onsuccess = () => {
                  db.close();
                  resolve(get.result?.value?.voice);
                };
              };
            }),
        ),
      )
      .toBe('F1');

    await sheet.getByRole('button', { name: 'Remove the voice' }).click();
    await expect(sheet.getByRole('status')).toContainText('has been removed');
    await expect(sheet.getByRole('button', { name: 'Download the voice' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Listen from here' })).toHaveCount(0);
  });

  test('cancels the download on leaving the Lectorium', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await withoutVoice(page);
    await openReader(page);
    await startDownload(page);
    await page.evaluate(() => (location.hash = '#/bibliotheca'));
    await expect(page.getByRole('heading', { level: 1, name: 'Bibliotheca' })).toBeVisible();
    // The fake takes a second to download; give it longer, to be sure it stopped.
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => localStorage.getItem('copista-test-voice'))).toBe('absent');
    await page.goBack();
    await expect(page.locator('.where')).toContainText(/Page 1 of \d+/);
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await expect(
      page.locator('#voice-sheet').getByRole('button', { name: 'Download the voice' }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('reads aloud from the page on screen until pressed again', async ({ page, browserName }) => {
    // Playwright's WebKit on Windows plays no audio at all: play() fails as not supported.
    test.skip(browserName === 'webkit', 'this WebKit build has no audio');
    await withVoice(page);
    await openReader(page);
    const button = page.getByRole('button', { name: 'Listen', exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await sound(page)).at).toBeGreaterThan(0.2);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    // Nothing plays on, not even the silence between the pieces.
    for (let i = 0; i < 6; i++) {
      expect((await sound(page)).playing).toBe(false);
      await page.waitForTimeout(250);
    }
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('reads piece after piece on one sound that never changes, as a locked phone needs', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'WebKit has no Media Source and plays piece by piece');
    await withVoice(page);
    await openReader(page);
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    // Three pieces in a row, each one marked after the one before was heard.
    const seen = new Set<string>();
    await expect
      .poll(async () => {
        const mark = await marked(page);
        if (mark) seen.add(mark.text);
        return seen.size;
      })
      .toBeGreaterThanOrEqual(3);
    const played = await page.evaluate(() => (window as unknown as { played: string[] }).played);
    expect(new Set(played).size).toBe(1);
    expect(played[0]).toMatch(/^blob:/);
    expect((await sound(page)).playing).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  /** The stretch marked as being read, and whether it is on screen; null where nothing is marked. */
  const marked = (page: Page): Promise<{ text: string; onScreen: boolean } | null> =>
    page.locator('iframe[title="Book page"]').evaluate((frame: HTMLIFrameElement) => {
      const view = frame.contentWindow as unknown as {
        CSS: { highlights?: Map<string, Set<Range>> };
      };
      const range = [...(view.CSS.highlights?.get('copista-reading') ?? [])][0];
      if (range === undefined) return null;
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      return { text: range.toString(), onScreen: rect.right > 0 && rect.left < frame.clientWidth };
    });

  const listening = (page: Page) => page.getByRole('region', { name: 'Listening' });

  /** Waits for the mark to move on to new pieces, each one marked once the one before was heard. */
  async function movesOn(page: Page, pieces: number): Promise<void> {
    const seen = new Set([(await marked(page))?.text]);
    await expect
      .poll(
        async () => {
          seen.add((await marked(page))?.text);
          return seen.size - 1;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThanOrEqual(pieces);
  }

  test.describe('the listening bar', () => {
    // Playwright's WebKit on Windows plays no audio at all: play() fails as not supported.
    test.skip(({ browserName }) => browserName === 'webkit', 'this WebKit build has no audio');

    test('shows the bar while reading, and Stop listening hides it', async ({ page }) => {
      await withVoice(page);
      await openReader(page);
      const button = page.getByRole('button', { name: 'Listen', exact: true });
      await expect(listening(page)).toHaveCount(0);
      await button.click();
      const bar = listening(page);
      await expect(bar).toBeVisible();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(bar.getByRole('button', { name: /^The Lect/ })).toContainText('Beta');
      await bar.getByRole('button', { name: 'Pause' }).click();
      await expect(bar.getByRole('button', { name: 'Play' })).toBeVisible();
      const paused = await sound(page);
      expect(paused.playing).toBe(false);
      await page.waitForTimeout(1000);
      expect(await sound(page)).toEqual(paused);
      await bar.getByRole('button', { name: 'Play' }).click();
      await expect(bar.getByRole('button', { name: 'Pause' })).toBeVisible();
      await expect(bar.getByRole('button', { name: 'Previous' })).toBeVisible();
      await expect(bar.getByRole('button', { name: 'Next' })).toBeVisible();
      await bar.getByRole('button', { name: 'Stop listening' }).click();
      await expect(listening(page)).toHaveCount(0);
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByRole('alert')).toHaveCount(0);
    });

    test('highlights the piece and turns the page to follow it', async ({ page, browserName }) => {
      await withVoice(page);
      await openReader(page);
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      if (browserName === 'chromium') {
        await expect.poll(() => marked(page)).toMatchObject({ onScreen: true });
      }
      await expect(page.locator('.where')).toContainText(/Page 2 of/, { timeout: 20_000 });
      if (browserName === 'chromium') {
        await expect.poll(() => marked(page)).toMatchObject({ onScreen: true });
      }
    });

    test('turning the page by hand restarts the reading there', async ({ page, browserName }) => {
      await withVoice(page);
      await openReader(page);
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      await expect.poll(async () => (await sound(page)).at).toBeGreaterThan(0.2);
      await page.keyboard.press('ArrowRight');
      const where = page.locator('.where');
      await expect(where).toContainText(/Page 2 of/);
      // The reading under way would turn back to page 1 for its next piece.
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(250);
        await expect(where).not.toContainText(/Page 1 of/);
      }
      if (browserName === 'chromium') {
        await expect.poll(() => marked(page)).toMatchObject({ onScreen: true });
      }
      await expect(listening(page)).toBeVisible();
    });

    test('a new size of the window keeps the piece being read on screen', async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'the mark is read through CSS highlights');
      await withVoice(page);
      await openReader(page);
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      await expect(page.locator('.where')).toContainText(/Page 2 of/, { timeout: 20_000 });
      await page.setViewportSize({ width: 700, height: 600 });
      await expect.poll(() => marked(page)).toMatchObject({ onScreen: true });
      // The reading goes on where it was rather than starting again.
      await movesOn(page, 1);
      await expect(listening(page)).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    });

    test('the reader’s name opens the voice sheet and the focus comes back to it', async ({
      page,
    }) => {
      await withVoice(page);
      await openReader(page);
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      const reader = listening(page).getByRole('button', { name: /^The Lect/ });
      await expect(reader).toHaveAttribute('aria-expanded', 'false');
      await reader.click();
      await expect(page.locator('#voice-sheet')).toBeVisible();
      await expect(reader).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(page.locator('#voice-sheet')).toHaveCount(0);
      await expect(reader).toBeFocused();
      await expect(reader).toHaveAttribute('aria-expanded', 'false');
    });

    test('the bar leaves the page’s last line in view', async ({ page }) => {
      await withVoice(page);
      await openReader(page);
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      const bar = await listening(page).boundingBox();
      const frame = await page.locator('iframe[title="Book page"]').boundingBox();
      expect(bar).not.toBeNull();
      expect(frame).not.toBeNull();
      expect(frame!.y + frame!.height).toBeLessThanOrEqual(bar!.y + 1);
    });

    test('reading continues into the next chapter', async ({ page }) => {
      await withVoice(page);
      await openReader(page);
      // On a wide screen the contents sit beside the page.
      await page.getByRole('button', { name: 'Part 2' }).click();
      const where = page.locator('.where');
      await expect(where).toContainText('chapter 2 of 3');
      await page.keyboard.press('ArrowLeft');
      await expect(where).toContainText('chapter 1 of 3');
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      await expect(where).toContainText('chapter 2 of 3', { timeout: 20_000 });
      await expect(listening(page)).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    });

    test('listening and autoscroll exclude each other', async ({ page }) => {
      await withVoice(page);
      await openReader(page);
      const listen = page.getByRole('button', { name: 'Listen', exact: true });
      const autoscroll = page.getByRole('button', { name: 'Autoscroll' });
      await listen.click();
      await expect(listening(page)).toBeVisible();
      await autoscroll.click();
      await expect(listening(page)).toHaveCount(0);
      await expect(listen).toHaveAttribute('aria-pressed', 'false');
      await expect(
        page.locator('.autoscroll-bar').getByRole('button', { name: 'Pause' }),
      ).toBeVisible();

      await listen.click();
      await expect(listening(page)).toBeVisible();
      // One floating bar at a time: the scrolling stopped and its bar gave way.
      await expect(page.locator('.autoscroll-bar')).toBeHidden();
      await listening(page).getByRole('button', { name: 'Stop listening' }).click();
      await expect(
        page.locator('.autoscroll-bar').getByRole('button', { name: 'Play' }),
      ).toBeVisible();
    });

    test('removing the voice stops the reading', async ({ page }) => {
      await withVoice(page);
      await openReader(page);
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      await listening(page)
        .getByRole('button', { name: /^The Lect/ })
        .click();
      const sheet = page.locator('#voice-sheet');
      await sheet.getByRole('button', { name: 'Remove the voice' }).click();
      await expect(sheet.getByRole('status')).toContainText('has been removed');
      await expect(listening(page)).toHaveCount(0);
      // With no voice left, Listen goes back to setting one up.
      const listen = page.getByRole('button', { name: 'Listen', exact: true });
      await expect(listen).toHaveAttribute('title', /set up the voice/);
      await expect(listen).not.toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('alert')).toHaveCount(0);
    });

    test('a finger held on a paragraph reads from the sentence under it', async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'the mark is read through CSS highlights');
      await withVoice(page);
      await openReader(page);
      const frame = page.locator('iframe[title="Book page"]');
      // The middle of the third paragraph on the page, and the text from its sentence on.
      const target = await frame.evaluate((element: HTMLIFrameElement) => {
        const doc = element.contentDocument!;
        const box = element.getBoundingClientRect();
        const visible = [...doc.querySelectorAll('p')].filter((p) => {
          const r = p.getBoundingClientRect();
          return r.left >= 0 && r.right <= element.clientWidth && r.bottom <= element.clientHeight;
        });
        const p = visible[2]!;
        const r = p.getClientRects()[0]!;
        return {
          x: box.left + r.left + 20,
          y: box.top + r.top + r.height / 2,
          text: p.textContent!,
        };
      });
      // The page takes a press only once the move into the reader has finished.
      await expect
        .poll(() =>
          page.evaluate(
            ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('.pages'),
            [target.x, target.y],
          ),
        )
        .toBe(true);
      await page.mouse.move(target.x, target.y);
      await page.mouse.down();
      await page.waitForTimeout(700);
      await page.mouse.up();
      await expect(listening(page)).toBeVisible();
      await expect.poll(async () => (await marked(page))?.text ?? '').not.toBe('');
      const first = (await marked(page))!.text.replace(/\s+/g, ' ').trim();
      expect(target.text.replace(/\s+/g, ' ')).toContain(first);
      // The press is not a tap: the page stays as it was.
      await expect(page.locator('.reading-bar')).toBeVisible();
      await expect(page.locator('.where')).toContainText(/Page 1 of/);
    });

    test('a ring shows under a press held on the page, and goes when it is let go', async ({
      page,
    }) => {
      await withVoice(page);
      await openReader(page);
      await expect(page.locator('html')).not.toHaveAttribute('data-nav');
      const box = (await page.locator('.pages').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(page.locator('.press-ring')).toBeVisible();
      await page.mouse.up();
      await expect(page.locator('.press-ring')).toHaveCount(0);
    });

    test('a finger held until the phone offers its own menu reads from there', async ({ page }) => {
      await withVoice(page);
      await openReader(page);
      await expect(page.locator('html')).not.toHaveAttribute('data-nav');
      const box = (await page.locator('.pages').boundingBox())!;
      const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 3 };
      const opened = await page.locator('.pages').evaluate((pages, at) => {
        const down = { ...at, bubbles: true, isPrimary: true, pointerType: 'touch', button: 0 };
        pages.dispatchEvent(new PointerEvent('pointerdown', down));
        const menu = new MouseEvent('contextmenu', { ...at, bubbles: true, cancelable: true });
        pages.dispatchEvent(menu);
        return !menu.defaultPrevented;
      }, point);
      expect(opened).toBe(false);
      await expect(listening(page)).toBeVisible();
    });

    test('says the voice is getting ready until it is first heard', async ({ page }) => {
      await withVoice(page);
      // A slower fake, so the wait for the first piece lasts long enough to be seen.
      await page.addInitScript(() => localStorage.setItem('copista-test-voice-ms', '20'));
      await openReader(page);
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      const wait = listening(page).locator('.listen-wait');
      await expect(wait).toBeVisible();
      await expect(wait).toContainText('is getting ready');
      await expect(wait).toContainText('Hold on a sentence to read from there.');
      await expect(listening(page).locator('.play')).toHaveAttribute('aria-busy', 'true');
      await expect.poll(async () => (await sound(page)).at, { timeout: 20_000 }).toBeGreaterThan(0);
      await expect(wait).not.toContainText('is getting ready');
    });

    test('steps the speed of the voice and keeps it for the next time', async ({ page }) => {
      await withVoice(page);
      await openReader(page);
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      const rate = listening(page).getByRole('button', { name: /^Speed/ });
      await expect(rate).toHaveText('1×');
      await rate.click();
      await expect(rate).toHaveText('1.25×');
      await expect.poll(async () => (await sound(page)).rate).toBe(1.25);
      await page.reload();
      await expect(page.locator('.where')).toContainText(/Page 1 of/);
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      await expect(rate).toHaveText('1.25×');
      await expect.poll(async () => (await sound(page)).at, { timeout: 20_000 }).toBeGreaterThan(0);
      expect((await sound(page)).rate).toBe(1.25);
    });

    test.describe('on a phone turned on its side', () => {
      test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

      test('the reading goes on and the bar leaves the last line in view', async ({
        page,
        browserName,
      }) => {
        test.skip(browserName !== 'chromium', 'the mark is read through CSS highlights');
        await withVoice(page);
        await openReader(page);
        await page.getByRole('button', { name: 'Listen', exact: true }).click();
        await movesOn(page, 1);
        await page.setViewportSize({ width: 844, height: 390 });
        await expect.poll(() => marked(page)).toMatchObject({ onScreen: true });
        await movesOn(page, 2);
        await expect(listening(page)).toBeVisible();
        const bar = (await listening(page).boundingBox())!;
        const frame = (await page.locator('iframe[title="Book page"]').boundingBox())!;
        expect(frame.y + frame.height).toBeLessThanOrEqual(bar.y + 1);
        await expect(page.getByRole('alert')).toHaveCount(0);
      });
    });

    // A mouse keeps the buttons small; a finger makes them bigger, so both are tried.
    for (const { width, touch } of [
      { width: 320, touch: false },
      { width: 320, touch: true },
      { width: 360, touch: true },
    ]) {
      test.describe(`on a ${width} px phone${touch ? ' held by a finger' : ''}`, () => {
        test.use({ viewport: { width, height: 640 }, hasTouch: touch, isMobile: touch });

        test(`the bar fits a ${width} px phone in the three looks`, async ({ page }) => {
          await withVoice(page);
          await openReader(page);
          await page.getByRole('button', { name: 'Listen', exact: true }).click();
          await expect(listening(page).getByRole('button', { name: /^The Lect/ })).toBeVisible();
          for (const look of ['Light', 'Sepia', 'Dark']) {
            await page.getByRole('button', { name: 'Look', exact: true }).click();
            await page.getByRole('button', { name: look, exact: true }).click();
            await page.keyboard.press('Escape');
            const bar = listening(page);
            await expect(bar).toBeVisible();
            const box = (await bar.boundingBox())!;
            expect(box.height).toBeLessThanOrEqual(56);
            for (const part of await bar.getByRole('button').all()) {
              const b = (await part.boundingBox())!;
              expect(b.x).toBeGreaterThanOrEqual(0);
              expect(b.x + b.width).toBeLessThanOrEqual(width);
              const clipped = await part.evaluate((e) => e.scrollWidth - e.clientWidth);
              expect(clipped).toBeLessThanOrEqual(0);
            }
          }
        });
      });
    }
  });

  test.describe('on a small phone', () => {
    test.use({ viewport: { width: 360, height: 640 } });

    test('fits all seven reading tools, each with its whole name', async ({ page }) => {
      // Listen shows before the voice is set up, to open the voice sheet.
      await withoutVoice(page);
      await openReader(page);
      const tools = page.locator('.reading-bar .toolbar > button, .reading-bar .look-toggle');
      await expect(tools).toHaveCount(7);
      for (const tool of await tools.all()) {
        const box = (await tool.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(360);
        const clipped = await tool.evaluate((b) => b.scrollWidth - b.clientWidth);
        expect(clipped).toBeLessThanOrEqual(0);
      }
    });
  });
});

test.describe('scroll mode', () => {
  /** Opens the long book and switches the reader to one scrolling column. */
  async function openScrolling(page: Page): Promise<void> {
    await openReader(page);
    await page.getByRole('button', { name: 'Look', exact: true }).click();
    await page.getByRole('button', { name: 'Scroll', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Scroll', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('.where')).toContainText('Chapter 1 of 3');
  }

  const scrollTop = (page: Page): Promise<number> =>
    page.locator('.pages').evaluate((host) => host.scrollTop);

  test('chooses scroll mode in the text panel and keeps it after a reload', async ({ page }) => {
    await openScrolling(page);
    await expect(page.locator('.where')).not.toContainText('Page');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await page.reload();
    await expect(page.locator('.where')).toContainText('Chapter 1 of 3');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(page.locator('.pages')).toHaveAttribute('aria-label', /Scroll to read/);
  });

  test('starts scrolling by itself from the toolbar, from pages too', async ({ page }) => {
    await openReader(page);
    const button = page.getByRole('button', { name: 'Autoscroll' });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('.where')).toContainText('Chapter 1 of 3');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(5);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('plays and pauses with the bar, a tap and Space', async ({ page }) => {
    await openScrolling(page);
    const before = await scrollTop(page);
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(before + 5);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    const stopped = await scrollTop(page);
    await page.waitForTimeout(400);
    expect(await scrollTop(page)).toBe(stopped);

    // A tap on the text starts it, and Space stops it.
    await page.locator('.pages').click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.locator('.pages')).toBeFocused();
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('sets the pace with the buttons and the keys, and keeps it', async ({ page }) => {
    await openScrolling(page);
    const pace = page.locator('.pace');
    await expect(pace).toHaveText('200 words/min');
    await page.getByRole('button', { name: 'Faster' }).click();
    await expect(pace).toHaveText('225 words/min');
    await page.reload();
    await expect(pace).toHaveText('225 words/min');
    await page.locator('.pages').focus();
    await page.keyboard.press('-');
    await expect(pace).toHaveText('200 words/min');
    await page.keyboard.press('+');
    await expect(pace).toHaveText('225 words/min');
    const slower = page.getByRole('button', { name: 'Slower' });
    for (let i = 0; i < 5; i++) await slower.click();
    await expect(pace).toHaveText('100 words/min');
    await expect(slower).toBeDisabled();
  });

  test('keeps the pace and the mode when the text grows', async ({ page }) => {
    await openScrolling(page);
    await page.getByRole('button', { name: 'Faster' }).click();
    await page.getByRole('button', { name: 'Look', exact: true }).click();
    await page.getByRole('button', { name: 'Larger text' }).click();
    await expect(page.locator('.size')).toHaveText('110%');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pace')).toHaveText('225 words/min');
    await expect(page.locator('.where')).toContainText('Chapter 1 of 3');
  });

  test('goes back to pages at the same chapter, with the page counter', async ({ page }) => {
    await openScrolling(page);
    await page.getByRole('button', { name: 'Part 2' }).click();
    await expect(page.locator('.where')).toContainText('Chapter 2 of 3');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    // Opening the text panel stops the text before the mode changes.
    await page.getByRole('button', { name: 'Look', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await page.getByRole('button', { name: 'Pages', exact: true }).click();
    await expect(page.locator('.where')).toContainText(/Page \d+ of \d+ · chapter 2 of 3/);
    await expect(page.locator('.autoscroll-bar')).toBeHidden();
  });

  test('shows the guide line only in scroll mode with its switch on', async ({ page }) => {
    await openReader(page);
    await page.getByRole('button', { name: 'Look', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Guide line' })).toBeHidden();
    await page.getByRole('button', { name: 'Scroll', exact: true }).click();
    const line = page.getByRole('switch', { name: 'Guide line' });
    await expect(line).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.guide-line')).toHaveCount(0);
    await line.click();
    await expect(line).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.guide-line')).toBeVisible();
    await page.getByRole('button', { name: 'Pages', exact: true }).click();
    await expect(page.locator('.guide-line')).toHaveCount(0);
    await expect(line).toBeHidden();
  });

  test.describe('on a small phone', () => {
    test.use({ viewport: { width: 360, height: 640 } });

    test('fits the bar without sideways scrolling, in full page too', async ({ page }) => {
      await openScrolling(page);
      const overflow = (): Promise<number> =>
        page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      for (const name of ['Slower', 'Faster', 'Play']) {
        const box = await page.getByRole('button', { name }).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(360);
      }
      await page.keyboard.press('f');
      const bar = await page.locator('.autoscroll-bar').boundingBox();
      const exit = await page.getByRole('button', { name: 'Exit full page' }).boundingBox();
      expect(bar!.y + bar!.height).toBeLessThanOrEqual(exit!.y);
      expect(await overflow()).toBeLessThanOrEqual(0);
    });

    test('fits all seven reading tools on the screen, each with its whole name', async ({
      page,
    }) => {
      await openReader(page);
      // Listen is there with or without the voice: without it, it opens the voice sheet.
      const tools = page.locator('.reading-bar .toolbar > button, .reading-bar .look-toggle');
      await expect(tools).toHaveCount(7);
      for (const tool of await tools.all()) {
        const box = (await tool.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(360);
        const clipped = await tool.evaluate((b) => b.scrollWidth - b.clientWidth);
        expect(clipped).toBeLessThanOrEqual(0);
      }
    });

    test('stops moving when the contents open', async ({ page }) => {
      await openScrolling(page);
      await page.getByRole('button', { name: 'Play' }).click();
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
      await page.getByRole('button', { name: 'Contents' }).click();
      await expect(page.getByRole('tab', { name: 'Contents' })).toBeVisible();
      await expect(page.locator('.autoscroll-bar')).not.toHaveClass(/playing/);
    });
  });
});

test.describe('on a phone-sized screen', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('fits every room without sideways scrolling', async ({ page }) => {
    await openReader(page);
    const overflow = (): Promise<number> =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Contents' }).click();
    await expect(page.getByRole('button', { name: 'Part 2' })).toBeVisible();
    await page.getByRole('button', { name: 'Part 2' }).click();
    await expect(page.locator('.where')).toContainText('chapter 2 of 3');
    for (const room of ['Bibliotheca', 'Scriptorium', 'Archivum'] as const) {
      await openRoom(page, room);
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
    await page.getByRole('link', { name: 'All rooms', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});

test('has no serious accessibility problems in any room, in either theme', async ({ page }) => {
  await openReader(page);
  const screens: [string, () => Promise<void>][] = [
    ['Lectorium', async () => {}],
    ['Voice sheet', () => page.getByRole('button', { name: 'Listen', exact: true }).click()],
    ['Bibliotheca', () => openRoom(page, 'Bibliotheca')],
    ['Scriptorium', () => openRoom(page, 'Scriptorium')],
    ['Archivum', () => openRoom(page, 'Archivum')],
    [
      'Home',
      async () => {
        await page.getByRole('link', { name: 'All rooms', exact: true }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
      },
    ],
    ['Home, dark', () => page.getByRole('button', { name: 'Switch to dark theme' }).click()],
    ['Archivum, dark', () => openRoom(page, 'Archivum')],
    [
      'Voice sheet, dark',
      async () => {
        await page.getByRole('link', { name: 'Read a book' }).first().click();
        await page.getByRole('button', { name: 'Listen', exact: true }).click();
      },
    ],
  ];
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  for (const [name, open] of screens) {
    await open();
    // Check the colours only once the theme has switched and no transition is on screen.
    const theme = name.endsWith('dark') ? 'dark' : 'light';
    await expect
      .poll(() =>
        page.evaluate(() => [
          document.documentElement.dataset.theme,
          document.documentElement.dataset.nav ?? '',
        ]),
      )
      .toEqual([theme, '']);
    // The page frame holds the book's own markup, which Copista does not write.
    const result = await new AxeBuilder({ page }).exclude('.pages').analyze();
    const serious = result.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${name}: ${v.id} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
    expect(serious).toEqual([]);
  }
});

test.describe('home', () => {
  test('opens each room from its door and comes back', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
    for (const room of ['Scriptorium', 'Lectorium', 'Bibliotheca', 'Archivum'] as const) {
      await page.getByRole('main').getByRole('link', { name: TAB[room] }).click();
      await expect(page.getByRole('heading', { level: 1, name: room })).toBeVisible();
      await expect(page.getByRole('list', { name: 'In this room' })).toBeVisible();
      await page.getByRole('link', { name: 'All rooms', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
    }
  });

  test('leads from the first line to a guide of the four rooms', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'See how it works' }).click();
    const title = page.getByRole('heading', { level: 2, name: 'How it works' });
    await expect(title).toBeFocused();
    await expect(title).toBeInViewport();
    const guide = page.getByRole('region', { name: 'How it works' });
    await expect(guide.getByRole('listitem')).toHaveCount(4);
    await guide.getByRole('link', { name: /Open the Scriptorium/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Scriptorium' })).toBeVisible();
  });

  test('the home page has four doors and says the Lectorium can read aloud', async ({ page }) => {
    await page.goto('/');
    const doors = page.locator('.door');
    await expect(doors).toHaveCount(4);
    await expect(page.locator('a[href="#/auditorium"]')).toHaveCount(0);
    await expect(page.locator('.door-read')).toContainText('Can read aloud · Beta');
  });

  test('opens nothing on the 5 key, now that there are four rooms', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('5');
    await page.keyboard.press('4');
    // 4 opens the Archivum, so 5 had its chance to open something first.
    await expect(page.getByRole('heading', { level: 1, name: 'Archivum' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
  });

  test('fits its five tabs on the narrowest phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/#/archivum');
    await expect(page.getByRole('heading', { level: 1, name: 'Archivum' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const links = page.getByRole('navigation', { name: 'Rooms' }).getByRole('link');
    await expect(links).toHaveCount(5);
    for (const link of await links.all()) {
      const box = (await link.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
  });

  test('offers to continue the last book read', async ({ page }) => {
    await openReader(page);
    await page.getByRole('link', { name: 'Copista, all rooms' }).click();
    await page.getByRole('link', { name: 'Continue reading' }).click();
    await expect(page.locator('.where')).toContainText(/Page 1 of \d+/);
  });

  test('converts a file or adds books from the buttons under the lead', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('main').getByLabel('Choose files to convert').setInputFiles(BASIC_DOCX);
    await expect(page.getByRole('heading', { level: 1, name: 'Scriptorium' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'EPUB', exact: true })).toBeEnabled();

    await page.goto('/');
    await page.getByRole('main').getByLabel('Add EPUB books').setInputFiles(LONG_BOOK);
    await expect(page.getByRole('heading', { level: 1, name: 'Bibliotheca' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Added “Long Book”.');
  });

  test('names no picture type on its convert button, so Android opens its files', async ({
    page,
  }) => {
    // On Android a chooser that names a picture type opens the photo gallery and nothing else.
    await page.goto('/');
    const accept = await page
      .getByRole('main')
      .getByLabel('Choose files to convert')
      .getAttribute('accept');
    expect(accept).toMatch(/\.docx/);
    expect(accept).not.toMatch(/image\/|\.png|\.jpe?g/);
  });

  test('reaches the hall from any room with one click or the 0 key', async ({ page }) => {
    await page.goto('/#/scriptorium');
    const rooms = page.getByRole('navigation', { name: 'Rooms' });
    await rooms.getByRole('link', { name: 'Hall' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
    await openRoom(page, 'Archivum');
    await page.keyboard.press('0');
    await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
    // The rooms stay one click away from the hall itself.
    await openRoom(page, 'Bibliotheca');
  });

  test('links to the project without sending anything', async ({ page, baseURL }) => {
    const elsewhere: string[] = [];
    page.on('request', (request) => {
      const { origin, protocol } = new URL(request.url());
      if (protocol.startsWith('http') && origin !== new URL(baseURL!).origin)
        elsewhere.push(request.url());
    });
    await page.goto('/');
    const star = page.getByRole('link', { name: 'Star on GitHub' });
    await expect(star).toHaveAttribute('href', 'https://github.com/GiuseppeSPk/copista');
    await expect(star).toHaveAttribute('rel', 'noopener noreferrer');
    // An offer is a plain link out: nothing of the giving page loads until it is followed.
    const coffee = page.getByRole('link', { name: 'Buy me a coffee' });
    await expect(coffee).toHaveAttribute('href', /^https:\/\/ko-fi\.com\/\w+$/);
    await expect(coffee).toHaveAttribute('target', '_blank');
    await expect(coffee).toHaveAttribute('rel', 'noopener noreferrer');
    expect(elsewhere).toEqual([]);
  });
});

test('switches the theme and keeps it after a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const theme = (): Promise<string | undefined> =>
    page.evaluate(() => document.documentElement.dataset.theme);
  await expect.poll(theme).toBe('light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect.poll(theme).toBe('dark');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
  await page.reload();
  await expect.poll(theme).toBe('dark');
});

test.describe('the month’s draw', () => {
  const OCTOBER = new Date(2026, 9, 10, 12, 0);

  async function drawCard(page: Page, mood: string, length: string): Promise<string> {
    const draw = page.getByRole('region', { name: 'A book for October' });
    await draw.getByRole('button', { name: mood }).click();
    await draw.getByRole('button', { name: length }).click();
    const cards = draw.getByRole('button', { name: /^Card \d of 3, face down$/ });
    await expect(cards).toHaveCount(3);
    await cards.first().click();
    const title = draw.getByRole('heading', { level: 3 });
    await expect(title).toBeFocused();
    return (await title.textContent())!.trim();
  }

  test('draws a book, keeps it after a reload, and allows one redraw', async ({ page }) => {
    await page.clock.setFixedTime(OCTOBER);
    await page.goto('/');
    const draw = page.getByRole('region', { name: 'A book for October' });
    await expect(draw.getByText('What are you in the mood for?')).toBeVisible();

    const first = await drawCard(page, 'A mystery', 'One evening');
    const get = draw.getByRole('link', { name: /^Get it free/ });
    await expect(get).toHaveAttribute(
      'href',
      /^https:\/\/standardebooks\.org\/ebooks\/[\w-]+\/[\w-]+$/,
    );
    await expect(get).toHaveAttribute('target', '_blank');
    await expect(get).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(draw.getByText('You asked for a mystery, for one evening.')).toBeVisible();
    await expect(draw.getByText('No take-backs. Well, one.')).toBeVisible();

    // A reload finds the same book, with the stamp already pressed.
    await page.reload();
    await expect(draw.getByRole('heading', { level: 3 })).toHaveText(first);
    await expect(draw.locator('.draw.fresh')).toHaveCount(0);

    // Drawing again can be called off, and the book stays.
    await draw.getByRole('button', { name: 'Draw again' }).click();
    await expect(draw.getByText('Again? Very well.')).toBeVisible();
    await draw.getByRole('button', { name: `Keep ${first}` }).click();
    await expect(draw.getByRole('heading', { level: 3 })).toHaveText(first);
    await expect(draw.getByRole('button', { name: 'Draw again' })).toBeVisible();

    // The one redraw never deals the same book back, and spends the month's chance.
    await draw.getByRole('button', { name: 'Draw again' }).click();
    const second = await drawCard(page, 'Surprise me', 'Any length');
    expect(second).not.toBe(first);
    await expect(draw.getByText('Your next draw opens on 1 November.')).toBeVisible();
    await expect(draw.getByRole('button', { name: 'Draw again' })).toHaveCount(0);
    await page.reload();
    await expect(draw.getByRole('heading', { level: 3 })).toHaveText(second);
    await expect(draw.getByRole('button', { name: 'Draw again' })).toHaveCount(0);
  });

  test('starts over within a draw, and afresh in a new month', async ({ page }) => {
    await page.clock.setFixedTime(OCTOBER);
    await page.goto('/');
    const draw = page.getByRole('region', { name: 'A book for October' });
    await draw.getByRole('button', { name: 'A scare' }).click();
    await expect(draw.getByText('And how much time have you got?')).toBeVisible();
    await draw.getByRole('button', { name: 'Start over' }).click();
    // Back to the first question, with the keyboard on its first answer.
    await expect(draw.getByRole('button', { name: 'A mystery' })).toBeFocused();
    await expect(draw.getByText('And how much time have you got?')).toHaveCount(0);

    await drawCard(page, 'A good laugh', 'Any length');
    await page.clock.setFixedTime(new Date(2026, 10, 2, 9, 0));
    await page.reload();
    const november = page.getByRole('region', { name: 'A book for November' });
    await expect(november.getByText('What are you in the mood for?')).toBeVisible();
    await expect(november.getByRole('heading', { level: 3 })).toHaveCount(0);
  });

  test.describe('on a phone, with reduced motion', () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test('fits the screen and has no serious accessibility problems', async ({ page }) => {
      await page.clock.setFixedTime(OCTOBER);
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
      await page.goto('/');
      const draw = page.getByRole('region', { name: 'A book for October' });
      await draw.getByRole('button', { name: 'A love story' }).click();
      await draw.getByRole('button', { name: 'Any length' }).click();
      await expect(draw.getByRole('button', { name: /face down$/ })).toHaveCount(3);
      const overflow = (): Promise<number> =>
        page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);

      await draw
        .getByRole('button', { name: /face down$/ })
        .nth(2)
        .click();
      await expect(draw.getByRole('heading', { level: 3 })).toBeFocused();
      expect(await overflow()).toBeLessThanOrEqual(0);

      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') {
          await page.getByRole('button', { name: 'Switch to dark theme' }).click();
        }
        await expect
          .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
          .toBe(theme);
        const result = await new AxeBuilder({ page }).include('.sortes').analyze();
        const serious = result.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${theme}: ${v.id} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
        expect(serious).toEqual([]);
      }
    });
  });
});

test.describe('the offer to install the app', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(({ browserName }) => {
    test.skip(browserName === 'webkit', 'Only Chromium browsers offer to install a page this way.');
  });

  /** Fires the event Chrome on Android sends when a page can be installed, answered with `outcome`. */
  async function offerInstall(page: Page, outcome: 'accepted' | 'dismissed'): Promise<void> {
    await page.evaluate((outcome) => {
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => {
          (window as unknown as { prompted: boolean }).prompted = true;
        },
        userChoice: Promise.resolve({ outcome }),
      });
      window.dispatchEvent(event);
    }, outcome);
  }

  const offer = (page: Page) => page.getByRole('complementary', { name: 'Install Copista' });

  async function openHall(page: Page): Promise<void> {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
  }

  test('rises after a few seconds above the rooms and opens the browser’s dialog', async ({
    page,
  }) => {
    await page.clock.install();
    await openHall(page);
    await offerInstall(page, 'accepted');
    await expect(offer(page)).toBeHidden();
    await page.clock.runFor(6500);
    await expect(offer(page)).toBeVisible();
    // Measured where it comes to rest, not on its way up.
    await offer(page).evaluate((el) => el.getAnimations().forEach((a) => a.finish()));
    const card = (await offer(page).boundingBox())!;
    const bar = (await page.getByRole('navigation', { name: 'Rooms' }).boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(bar.y);
    await offer(page).getByRole('button', { name: 'Install' }).click();
    await expect(offer(page)).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(
      true,
    );
  });

  test('stays away after “Not now”', async ({ page }) => {
    await page.clock.install();
    await openHall(page);
    await offerInstall(page, 'dismissed');
    await page.clock.runFor(6500);
    await offer(page).getByRole('button', { name: 'Not now' }).click();
    await expect(offer(page)).toBeHidden();
    await openHall(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
    await offerInstall(page, 'dismissed');
    await page.clock.runFor(6500);
    await expect(offer(page)).toBeHidden();
  });

  test('never covers an open book', async ({ page }) => {
    await openReader(page);
    await offerInstall(page, 'accepted');
    await page.waitForTimeout(6500);
    await expect(offer(page)).toBeHidden();
    await openRoom(page, 'Bibliotheca');
    await expect(offer(page)).toBeVisible();
  });

  test('is not offered on a computer', async ({ browser }) => {
    const page = await browser.newPage({ hasTouch: false });
    await page.clock.install();
    await openHall(page);
    await offerInstall(page, 'accepted');
    await page.clock.runFor(6500);
    await expect(offer(page)).toBeHidden();
    await page.close();
  });
});
