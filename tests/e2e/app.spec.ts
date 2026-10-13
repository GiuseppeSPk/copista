import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { epubZip, nav, opf, xhtml } from '../fixtures/epub-builder';

const LONG_BOOK = 'tests/fixtures/generated/long-book.epub';
const BASIC_DOCX = 'tests/fixtures/generated/basic.docx';

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
  const marks = page.locator('.marks li');
  await expect(marks).toHaveCount(1);
  await expect(marks).toContainText('Part 1');

  await page.getByRole('button', { name: 'Part 2' }).click();
  await expect(page.locator('.where')).toContainText('chapter 2 of 3');
  await marks.getByRole('button', { name: /Part 1/ }).click();
  await expect(page.locator('.where')).toContainText(/Page 2 of .* chapter 1 of 3/);

  await page.reload();
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
  for (const key of ['1', '2', '3', '4', '0', '3']) await page.keyboard.press(key);
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
  await page.getByRole('button', { name: 'Larger text' }).click();
  await expect(page.locator('.size')).toHaveText('110%');
  // The reader's own "Text size" group is still on screen until the room changes.
  await openRoom(page, 'Archivum');
  await expect(page.getByLabel('Text size')).toHaveValue('110');
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
  await expect(page.getByRole('link', { name: 'Back to the library' })).toBeVisible();
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
      expect((await download).suggestedFilename()).toBe(`Long Book${extension}`);
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
    expect((await download).suggestedFilename()).toBe('My Notes.epub');
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
    expect(zip.suggestedFilename()).toBe('Copista copies (Word).zip');
    const entries = unzipSync(new Uint8Array(readFileSync((await zip.path())!)));
    expect(Object.keys(entries).sort()).toEqual(['a.docx', 'b.docx', 'c.docx']);
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

  test('converts a book from the library', async ({ page }) => {
    await addBook(page);
    await openRoom(page, 'Scriptorium');
    const book = await page.getByRole('option', { name: /^Long Book/ }).getAttribute('value');
    await page.getByLabel('Or a book from your library').selectOption(book!);
    await expect(page.getByRole('button', { name: 'EPUB', exact: true })).toHaveCount(0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('Long Book.txt');
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

  test('links to the project without sending anything', async ({ page }) => {
    await page.goto('/');
    const star = page.getByRole('link', { name: 'Star on GitHub' });
    await expect(star).toHaveAttribute('href', 'https://github.com/GiuseppeSPk/copista');
    await expect(star).toHaveAttribute('rel', 'noopener noreferrer');
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
