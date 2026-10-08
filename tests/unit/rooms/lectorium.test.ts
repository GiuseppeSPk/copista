import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { readEpub } from '../../../src/core/epub/read';
import { BookNotFoundError } from '../../../src/storage/db';
import {
  addBookmark,
  openSession,
  progressPercent,
  removeBookmark,
  savePosition,
} from '../../../src/rooms/lectorium/index';
import { bookPercent } from '../../../src/reader/location';
import { deleteAllStorage, putBook, putProgress } from '../../../src/storage/db';
import { EPUB } from '../../fixtures/catalog';

const ID = 'three';

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
