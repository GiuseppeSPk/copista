import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteAllStorage,
  deleteBook,
  deleteBookmark,
  getBook,
  getProgress,
  getSetting,
  listBookmarks,
  listBooks,
  putBook,
  putBookmark,
  putProgress,
  putSetting,
  type BookmarkRecord,
  type BookRecord,
} from '../../../src/storage/db';

function book(id: string, addedAt: number, content = id + id): BookRecord {
  return { id, title: id.toUpperCase(), authors: [], fileBlob: new Blob([content]), addedAt };
}

function bookmark(
  id: string,
  bookId: string,
  spineIndex: number,
  fraction: number,
): BookmarkRecord {
  return { id, bookId, spineIndex, fraction, snippet: `${id} text`, createdAt: 0 };
}

describe('storage', () => {
  beforeEach(deleteAllStorage);

  it('creates the spec schema', async () => {
    await listBooks();
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('copista');
      request.onsuccess = () => resolve(request.result);
    });
    expect(db.version).toBe(1);
    expect([...db.objectStoreNames].sort()).toEqual(['bookmarks', 'books', 'progress', 'settings']);
    db.close();
  });

  it('stores and lists books newest first', async () => {
    await putBook(book('a', 1));
    await putBook(book('b', 2));
    expect((await listBooks()).map((b) => b.id)).toEqual(['b', 'a']);
    expect(await (await getBook('a'))!.fileBlob.text()).toBe('aa');
    expect(await getBook('missing')).toBeUndefined();
  });

  it('deletes a book with its progress and bookmarks only', async () => {
    for (const id of ['a', 'b']) {
      await putBook(book(id, 1));
      await putProgress({ bookId: id, spineIndex: 2, fraction: 0.5, updatedAt: 1 });
      await putBookmark(bookmark(`${id}1`, id, 0, 0.1));
      await putBookmark(bookmark(`${id}2`, id, 1, 0.2));
    }
    await deleteBook('a');
    expect(await getBook('a')).toBeUndefined();
    expect(await getProgress('a')).toBeUndefined();
    expect(await listBookmarks('a')).toEqual([]);
    expect((await getBook('b'))?.title).toBe('B');
    expect(await getProgress('b')).toEqual({
      bookId: 'b',
      spineIndex: 2,
      fraction: 0.5,
      updatedAt: 1,
    });
    expect((await listBookmarks('b')).map((m) => m.id)).toEqual(['b1', 'b2']);
  });

  it('orders bookmarks by spine index then fraction', async () => {
    await putBookmark(bookmark('x', 'a', 1, 0.5));
    await putBookmark(bookmark('y', 'a', 0, 0.9));
    await putBookmark(bookmark('z', 'a', 1, 0.1));
    await putBookmark(bookmark('other', 'b', 0, 0));
    const marks = await listBookmarks('a');
    expect(marks.map((m) => [m.spineIndex, m.fraction])).toEqual([
      [0, 0.9],
      [1, 0.1],
      [1, 0.5],
    ]);
    await deleteBookmark('z');
    expect((await listBookmarks('a')).map((m) => m.id)).toEqual(['y', 'x']);
  });

  it('keeps one progress record per book', async () => {
    await putProgress({ bookId: 'a', spineIndex: 0, fraction: 0.1, updatedAt: 1 });
    await putProgress({ bookId: 'a', spineIndex: 3, fraction: 0.7, updatedAt: 2 });
    expect(await getProgress('a')).toEqual({
      bookId: 'a',
      spineIndex: 3,
      fraction: 0.7,
      updatedAt: 2,
    });
  });

  it('round-trips settings', async () => {
    expect(await getSetting('theme')).toBeUndefined();
    await putSetting('theme', 'dark');
    expect(await getSetting('theme')).toBe('dark');
    await putSetting('look', { fontSizePercent: 120 });
    expect(await getSetting<{ fontSizePercent: number }>('look')).toEqual({ fontSizePercent: 120 });
  });

  it('turns a quota error into StorageFullError and keeps the library unchanged', async () => {
    await putBook(book('a', 1));
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(putBook(book('b', 2, '12345'))).rejects.toMatchObject({
      name: 'StorageFullError',
      neededBytes: 5,
    });
    spy.mockRestore();
    expect((await listBooks()).map((b) => b.id)).toEqual(['a']);
  });

  it('counts the cover too when the quota is exceeded', async () => {
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(
      putBook({ ...book('c', 1, '12345'), coverBlob: new Blob(['123']) }),
    ).rejects.toMatchObject({ name: 'StorageFullError', neededBytes: 8 });
    spy.mockRestore();
  });

  it('deleteAllStorage empties everything and the database reopens', async () => {
    await putBook(book('a', 1));
    await putSetting('theme', 'dark');
    await putProgress({ bookId: 'a', spineIndex: 0, fraction: 0, updatedAt: 1 });
    await deleteAllStorage();
    expect(await listBooks()).toEqual([]);
    expect(await getSetting('theme')).toBeUndefined();
    expect(await getProgress('a')).toBeUndefined();
    await putBook(book('b', 1));
    expect((await listBooks()).map((b) => b.id)).toEqual(['b']);
  });
});
