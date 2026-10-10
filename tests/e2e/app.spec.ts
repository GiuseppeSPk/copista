import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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
      await page.getByLabel('Choose a file').setInputFiles(LONG_BOOK);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: label, exact: true }).click();
      expect((await download).suggestedFilename()).toBe(`Long Book${extension}`);
      await expect(page.getByRole('status')).toContainText(`Saved “Long Book${extension}”.`);
    });
  }

  test('opens the print view for PDF', async ({ page }) => {
    await page.getByLabel('Choose a file').setInputFiles(LONG_BOOK);
    await page.getByRole('button', { name: 'PDF (print)' }).click();
    await expect(page.getByRole('status')).toContainText('Save as PDF');
    await expect
      .poll(() => page.evaluate(() => (window as Window & { printed?: number }).printed))
      .toBe(1);
  });

  test('converts Markdown to EPUB with the title typed in', async ({ page }) => {
    await page.getByLabel('Choose a file').setInputFiles({
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
    await page.getByLabel('Choose a file').setInputFiles({
      name: 'diary.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('First day.\n\nSecond day.\n'),
    });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'EPUB', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('diary.epub');
  });

  test('converts Word to EPUB', async ({ page }) => {
    await page.getByLabel('Choose a file').setInputFiles(BASIC_DOCX);
    await expect(page.getByLabel('Title')).toHaveCount(0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'EPUB', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.epub$/);
  });

  test('refuses a file it cannot read', async ({ page }) => {
    await page.getByLabel('Choose a file').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]),
    });
    await expect(page.locator('.notices .error')).toContainText('photo.png:');
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
    'https://liberliber.it/?s=Canti',
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
    ['Archivum, dark', () => page.getByRole('link', { name: /Manage your data/ }).click()],
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
      await page.getByRole('link', { name: TAB[room] }).click();
      await expect(page.getByRole('heading', { level: 1, name: room })).toBeVisible();
      await expect(page.getByRole('list', { name: 'In this room' })).toBeVisible();
      await page.getByRole('link', { name: 'All rooms', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Copista' })).toBeVisible();
    }
  });

  test('offers to continue the last book read', async ({ page }) => {
    await openReader(page);
    await page.getByRole('link', { name: 'Copista, all rooms' }).click();
    await page.getByRole('link', { name: 'Continue reading' }).click();
    await expect(page.locator('.where')).toContainText(/Page 1 of \d+/);
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
