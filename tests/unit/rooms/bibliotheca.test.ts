import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrmProtectedError } from '../../../src/core/errors';
import { sha256Hex } from '../../../src/core/hash';
import { importBook, listShelf, removeBook } from '../../../src/rooms/bibliotheca/index';
import {
  deleteAllStorage,
  getBook,
  getProgress,
  getSetting,
  putProgress,
} from '../../../src/storage/db';
import { DOCX, EPUB } from '../../fixtures/catalog';

const file = (data: Uint8Array, name: string) => new File([data as Uint8Array<ArrayBuffer>], name);

let persist: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await deleteAllStorage();
  persist = vi.fn(async () => true);
  Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bibliotheca', () => {
  it('imports, deduplicates, rejects and removes books', async () => {
    const r = await importBook(file(EPUB.epub3Nav(), 'three.epub'));
    expect(r.alreadyPresent).toBe(false);
    expect(r.book).toMatchObject({
      title: 'Fixture Three',
      authors: ['Ada Example', 'Bo Sample'],
      id: await sha256Hex(EPUB.epub3Nav()),
    });
    expect(r.book.coverBlob!.type).toBe('image/png');
    await putProgress({ bookId: r.book.id, spineIndex: 2, fraction: 0.5, updatedAt: 1 });
    expect((await importBook(file(EPUB.epub3Nav(), 'copy.epub'))).alreadyPresent).toBe(true);
    expect(await listShelf()).toHaveLength(1);
    expect(await getProgress(r.book.id)).toMatchObject({ spineIndex: 2, fraction: 0.5 });
    await importBook(file(EPUB.noCover(), 'b.epub'));
    expect(persist).toHaveBeenCalledTimes(1);
    await expect(importBook(file(EPUB.drmAdept(), 'd.epub'))).rejects.toBeInstanceOf(
      DrmProtectedError,
    );
    await expect(importBook(file(DOCX.basic(), 'x.docx'))).rejects.toMatchObject({
      format: 'docx',
    });
    expect(await listShelf()).toHaveLength(2);
    expect((await importBook(file(EPUB.fixedLayout(), 'f.epub'))).warnings).toContain(
      'fixed-layout',
    );
    await removeBook(r.book.id);
    expect((await listShelf()).map((b) => b.id)).not.toContain(r.book.id);
    expect(await getProgress(r.book.id)).toBeUndefined();
  });

  it('keeps the original file, typed as EPUB, and records the persistence request', async () => {
    const bytes = EPUB.epub3Nav();
    const { book } = await importBook(file(bytes, 'three.epub'));
    const stored = await getBook(book.id);
    expect(stored!.fileBlob.type).toBe('application/epub+zip');
    expect(new Uint8Array(await stored!.fileBlob.arrayBuffer())).toEqual(bytes);
    expect(await getSetting('persistRequested')).toBe(true);
  });

  it('lists the shelf newest first, without the book files', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 0, 1));
    const first = await importBook(file(EPUB.noCover(), 'b.epub'));
    vi.setSystemTime(Date.UTC(2026, 0, 2));
    const second = await importBook(file(EPUB.epub3Nav(), 'three.epub'));
    vi.useRealTimers();
    expect([first.book.addedAt, second.book.addedAt]).toEqual([
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 0, 2),
    ]);
    const shelf = await listShelf();
    expect(shelf.map((b) => b.id)).toEqual([second.book.id, first.book.id]);
    expect(shelf[0]).not.toHaveProperty('fileBlob');
  });

  it('imports without a storage manager', async () => {
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
    const r = await importBook(file(EPUB.noCover(), 'b.epub'));
    expect(r.book.coverBlob).toBeUndefined();
    expect(await listShelf()).toHaveLength(1);
  });

  it('reports a full disk and leaves the shelf unchanged', async () => {
    await importBook(file(EPUB.noCover(), 'b.epub'));
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(importBook(file(EPUB.epub3Nav(), 'three.epub'))).rejects.toMatchObject({
      name: 'StorageFullError',
    });
    vi.restoreAllMocks();
    expect(await listShelf()).toHaveLength(1);
  });
});
