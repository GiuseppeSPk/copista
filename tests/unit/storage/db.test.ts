import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteAllStorage,
  deleteBook,
  deleteBookmark,
  deleteNote,
  getBook,
  getProgress,
  getSetting,
  listBookmarks,
  listBooks,
  listNotes,
  putBook,
  putBookmark,
  putNote,
  putProgress,
  putSetting,
  type BookmarkRecord,
  type BookRecord,
  type NoteRecord,
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

function note(
  id: string,
  bookId: string,
  spineIndex: number,
  fraction: number,
  createdAt = 0,
): NoteRecord {
  return { id, bookId, spineIndex, fraction, text: `${id} note`, createdAt, updatedAt: createdAt };
}

/** Every record in every store, read past the module, as the browser keeps it. */
async function rawRecords(): Promise<Record<string, unknown[]>> {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const request = indexedDB.open('copista');
    request.onsuccess = () => resolve(request.result);
  });
  const names = [...db.objectStoreNames];
  const tx = db.transaction(names);
  const all = await Promise.all(
    names.map(
      (name) =>
        new Promise<unknown[]>((resolve) => {
          const request = tx.objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result as unknown[]);
        }),
    ),
  );
  db.close();
  return Object.fromEntries(names.map((name, i) => [name, all[i]!]));
}

function holdsBlob(value: unknown): boolean {
  if (value instanceof Blob) return true;
  return typeof value === 'object' && value !== null && Object.values(value).some(holdsBlob);
}

describe('storage', () => {
  beforeEach(deleteAllStorage);

  it('creates the spec schema', async () => {
    await listBooks();
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('copista');
      request.onsuccess = () => resolve(request.result);
    });
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames].sort()).toEqual([
      'bookmarks',
      'books',
      'files',
      'notes',
      'progress',
      'settings',
    ]);
    db.close();
  });

  it('adds the notes to a library kept by the first version, keeping its books', async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('copista', 1);
      request.onupgradeneeded = () => {
        const old = request.result;
        old.createObjectStore('books', { keyPath: 'id' }).put({
          id: 'a',
          title: 'Old',
          authors: [],
          addedAt: 1,
        });
        old.createObjectStore('files', { keyPath: 'id' }).put({
          id: 'a',
          bytes: new ArrayBuffer(2),
          type: '',
        });
        old.createObjectStore('progress', { keyPath: 'bookId' });
        old.createObjectStore('bookmarks', { keyPath: 'id' }).createIndex('byBook', 'bookId');
        old.createObjectStore('settings', { keyPath: 'key' });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });
    expect((await listBooks()).map((b) => b.title)).toEqual(['Old']);
    await putNote(note('n', 'a', 0, 0.5));
    expect((await listNotes('a')).map((n) => n.id)).toEqual(['n']);
  });

  it('stores and lists books newest first', async () => {
    await putBook(book('a', 1));
    await putBook(book('b', 2));
    expect((await listBooks()).map((b) => b.id)).toEqual(['b', 'a']);
    expect(await (await getBook('a'))!.fileBlob.text()).toBe('aa');
    expect(await getBook('missing')).toBeUndefined();
  });

  it('keeps no Blob in the database, since WebKit private sessions refuse them', async () => {
    await putBook({
      ...book('a', 1),
      fileBlob: new Blob(['abc'], { type: 'application/epub+zip' }),
      coverBlob: new Blob(['png'], { type: 'image/png' }),
    });
    const raw = await rawRecords();
    expect(raw.books).toHaveLength(1);
    expect(holdsBlob(raw)).toBe(false);
    const back = (await getBook('a'))!;
    expect(back.fileBlob.type).toBe('application/epub+zip');
    expect(await back.fileBlob.text()).toBe('abc');
    expect(back.coverBlob!.type).toBe('image/png');
    expect(await back.coverBlob!.text()).toBe('png');
  });

  it('lists the library without loading the book files', async () => {
    await putBook({ ...book('a', 1), coverBlob: new Blob(['png'], { type: 'image/png' }) });
    const [listed] = await listBooks();
    expect(listed).not.toHaveProperty('fileBlob');
    expect(await listed!.coverBlob!.text()).toBe('png');
  });

  it('deletes a book with its progress, bookmarks and notes only', async () => {
    for (const id of ['a', 'b']) {
      await putBook(book(id, 1));
      await putProgress({ bookId: id, spineIndex: 2, fraction: 0.5, updatedAt: 1 });
      await putBookmark(bookmark(`${id}1`, id, 0, 0.1));
      await putBookmark(bookmark(`${id}2`, id, 1, 0.2));
      await putNote(note(`${id}n`, id, 0, 0.3));
    }
    await deleteBook('a');
    expect(await getBook('a')).toBeUndefined();
    expect(await getProgress('a')).toBeUndefined();
    expect(await listBookmarks('a')).toEqual([]);
    expect(await listNotes('a')).toEqual([]);
    expect((await listNotes('b')).map((n) => n.id)).toEqual(['bn']);
    expect((await getBook('b'))?.title).toBe('B');
    expect(await getProgress('b')).toEqual({
      bookId: 'b',
      spineIndex: 2,
      fraction: 0.5,
      updatedAt: 1,
    });
    expect((await listBookmarks('b')).map((m) => m.id)).toEqual(['b1', 'b2']);
    expect((await rawRecords()).files).toHaveLength(1);
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

  it('orders notes by place in the book, then by age, and updates one in place', async () => {
    await putNote(note('late', 'a', 1, 0.5, 2));
    await putNote(note('early', 'a', 1, 0.5, 1));
    await putNote(note('first', 'a', 0, 0.9, 3));
    await putNote(note('other', 'b', 0, 0));
    expect((await listNotes('a')).map((n) => n.id)).toEqual(['first', 'early', 'late']);
    await putNote({ ...note('early', 'a', 1, 0.5, 1), text: 'Changed', updatedAt: 9 });
    const notes = await listNotes('a');
    expect(notes).toHaveLength(3);
    expect(notes[1]).toMatchObject({ id: 'early', text: 'Changed', updatedAt: 9 });
    await deleteNote('first');
    expect((await listNotes('a')).map((n) => n.id)).toEqual(['early', 'late']);
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
