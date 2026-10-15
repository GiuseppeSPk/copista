import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEpub } from '../../../src/core/epub/read';
import { BookNotFoundError } from '../../../src/storage/db';
import {
  NOTE_LENGTH,
  addBookmark,
  addNote,
  openSession,
  progressPercent,
  removeBookmark,
  removeNote,
  saveNote,
  savePosition,
} from '../../../src/rooms/lectorium/index';
import { ReadingController } from '../../../src/rooms/lectorium/controller';
import { bookPercent } from '../../../src/reader/location';
import { deleteAllStorage, putBook, putProgress } from '../../../src/storage/db';
import { EPUB } from '../../fixtures/catalog';

const ID = 'three';

/** What the fake page view was asked to do. */
const seen = vi.hoisted(() => ({ calls: [] as string[] }));

// jsdom lays nothing out, so the controller turns the pages of a view that only counts them.
vi.mock('../../../src/reader/paginator', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/reader/paginator')>();
  class Pages {
    page = 0;
    readonly pageCount = 3;
    readonly document = null;
    show(): Promise<void> {
      this.page = 0;
      return Promise.resolve();
    }
    next(): boolean {
      if (this.page >= this.pageCount - 1) return false;
      this.page++;
      return true;
    }
    prev(): boolean {
      if (this.page <= 0) return false;
      this.page--;
      return true;
    }
    fraction(): number {
      return this.page / this.pageCount;
    }
    firstVisible(): number {
      return -1;
    }
    highlight(range: Range | null): void {
      seen.calls.push(range === null ? 'highlight none' : 'highlight');
    }
    before(): boolean {
      return false;
    }
    reveal(): boolean {
      seen.calls.push('reveal');
      this.page = 2;
      return true;
    }
    destroy(): void {}
  }
  return { ...real, Paginator: Pages };
});

beforeEach(async () => {
  await deleteAllStorage();
  await putBook({
    id: ID,
    title: 'Fixture Three',
    authors: [],
    fileBlob: new Blob([EPUB.epub3Nav() as Uint8Array<ArrayBuffer>], {
      type: 'application/epub+zip',
    }),
    addedAt: 1,
  });
});

describe('lectorium', () => {
  it('rejects a book that is not in the library', async () => {
    await expect(openSession('missing')).rejects.toBeInstanceOf(BookNotFoundError);
    await expect(openSession('missing')).rejects.toMatchObject({ bookId: 'missing' });
  });

  it('opens a new book at the start', async () => {
    const session = await openSession(ID);
    expect(session.bookId).toBe(ID);
    expect(session.book.meta.title).toBe('Fixture Three');
    expect(session.book.chapters).toHaveLength(3);
    expect(session.position).toEqual({ spineIndex: 0, fraction: 0 });
    expect(session.bookmarks).toEqual([]);
    expect(session.notes).toEqual([]);
  });

  it('pulls a stored position back inside the book', async () => {
    await putProgress({ bookId: ID, spineIndex: 9, fraction: 2, updatedAt: 1 });
    expect((await openSession(ID)).position).toEqual({ spineIndex: 2, fraction: 1 });
  });

  it('reopens where the reader left off', async () => {
    await savePosition(ID, { spineIndex: 1, fraction: 0.25 });
    expect((await openSession(ID)).position).toEqual({ spineIndex: 1, fraction: 0.25 });
  });

  it('stores a bookmark with a short single-line snippet', async () => {
    const mark = await addBookmark(
      ID,
      { spineIndex: 1, fraction: 0.5 },
      '  a\n\n b ' + 'x'.repeat(300),
    );
    expect(mark.snippet).toHaveLength(120);
    expect(mark.snippet.startsWith('a b x')).toBe(true);
    expect(mark).toMatchObject({ bookId: ID, spineIndex: 1, fraction: 0.5 });
    expect((await openSession(ID)).bookmarks).toEqual([mark]);
  });

  it('returns bookmarks in reading order and removes one', async () => {
    const late = await addBookmark(ID, { spineIndex: 2, fraction: 0.1 }, 'late');
    const early = await addBookmark(ID, { spineIndex: 0, fraction: 0.7 }, 'early');
    const middle = await addBookmark(ID, { spineIndex: 2, fraction: 0 }, 'middle');
    expect(new Set([late.id, early.id, middle.id]).size).toBe(3);
    expect((await openSession(ID)).bookmarks.map((m) => m.snippet)).toEqual([
      'early',
      'middle',
      'late',
    ]);
    await removeBookmark(middle.id);
    expect((await openSession(ID)).bookmarks.map((m) => m.snippet)).toEqual(['early', 'late']);
  });

  it('pins a note to a page and gives it back when the book reopens', async () => {
    const pinned = await addNote(ID, { spineIndex: 1, fraction: 0.5 });
    expect(pinned).toMatchObject({ bookId: ID, spineIndex: 1, fraction: 0.5, text: '' });
    const saved = await saveNote(pinned, 'Compare with chapter one.');
    expect(saved).toMatchObject({ id: pinned.id, text: 'Compare with chapter one.' });
    expect((await openSession(ID)).notes).toEqual([saved]);
  });

  it('takes a blank note off the page and cuts a long one to the limit', async () => {
    const blank = await addNote(ID, { spineIndex: 0, fraction: 0 });
    expect(await saveNote(blank, ' \n ')).toBeUndefined();
    const long = await addNote(ID, { spineIndex: 0, fraction: 0 });
    expect((await saveNote(long, 'x'.repeat(NOTE_LENGTH + 50)))!.text).toHaveLength(NOTE_LENGTH);
    await removeNote(long.id);
    expect((await openSession(ID)).notes).toEqual([]);
  });

  it('measures progress by chapter length', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    const lengths = book.chapters.map((chapter) => chapter.html.length);
    for (const pos of [
      { spineIndex: 0, fraction: 0 },
      { spineIndex: 1, fraction: 0.5 },
      { spineIndex: 2, fraction: 1 },
    ]) {
      expect(progressPercent(book, pos)).toBe(bookPercent(pos, lengths));
    }
    expect(progressPercent(book, { spineIndex: 2, fraction: 1 })).toBe(100);
  });
});

describe('reading controller', () => {
  // The chapters' styles ask for object URLs, which jsdom cannot make from a Blob.
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:copista-test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  async function open(onReaderMove: () => void, onChange = () => {}) {
    const session = await openSession(ID);
    const host = document.createElement('div');
    const look = { fontSizePercent: 100, theme: 'light' as const };
    const controller = new ReadingController(
      host,
      session,
      look,
      onChange,
      undefined,
      onReaderMove,
    );
    await controller.open();
    seen.calls.length = 0;
    return controller;
  }

  it('tells a move by the reader from a move by the reading', async () => {
    let moves = 0;
    let saved = 0;
    const controller = await open(
      () => moves++,
      () => saved++,
    );
    await controller.next();
    expect(moves).toBe(1);
    saved = 0;
    controller.follow(document.createRange());
    controller.follow(null);
    expect(seen.calls).toEqual(['highlight', 'reveal', 'highlight none']);
    // The page the reading turned to is saved as the place.
    await vi.waitFor(() => expect(saved).toBe(1));
    expect(controller.page).toBe(2);
    expect(moves).toBe(1);
    expect(await controller.continueReading()).toBe(true);
    expect(controller.position().spineIndex).toBe(1);
    expect(moves).toBe(1);
  });

  it('continues into no chapter after the last', async () => {
    let moves = 0;
    const controller = await open(() => moves++);
    await controller.goTo({ spineIndex: 2 });
    expect(moves).toBe(1);
    expect(await controller.continueReading()).toBe(false);
    expect(controller.position().spineIndex).toBe(2);
    expect(moves).toBe(1);
  });
});
