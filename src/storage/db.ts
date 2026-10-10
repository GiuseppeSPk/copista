import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { CopistaError } from '../core/errors';

export interface BookRecord {
  id: string;
  title: string;
  authors: string[];
  coverBlob?: Blob;
  fileBlob: Blob;
  addedAt: number;
}

/** A library entry without its file, as the shelf lists it. */
export type BookSummary = Omit<BookRecord, 'fileBlob'>;

export interface ProgressRecord {
  bookId: string;
  spineIndex: number;
  fraction: number;
  updatedAt: number;
}

export interface BookmarkRecord {
  id: string;
  bookId: string;
  spineIndex: number;
  fraction: number;
  snippet: string;
  createdAt: number;
}

/** A note the reader pinned to a page; it stays where it was left. */
export interface NoteRecord {
  id: string;
  bookId: string;
  spineIndex: number;
  fraction: number;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export class StorageFullError extends CopistaError {
  override name = 'StorageFullError';
  readonly neededBytes: number;

  constructor(
    neededBytes: number,
    message = 'There is not enough space on this device to keep the book.',
  ) {
    super(message);
    this.neededBytes = neededBytes;
  }
}

export class BookNotFoundError extends CopistaError {
  override name = 'BookNotFoundError';
  readonly bookId: string;

  constructor(bookId: string, message = 'This book is no longer in the library.') {
    super(message);
    this.bookId = bookId;
  }
}

const DB_NAME = 'copista';
const DB_VERSION = 2;

interface SettingRecord {
  key: string;
  value: unknown;
}

// Blobs are kept as plain bytes: WebKit refuses Blobs in IndexedDB in private
// sessions. The book file lives in its own store so listing the shelf does not
// read every file.
interface StoredBytes {
  bytes: ArrayBuffer;
  type: string;
}

interface StoredBook {
  id: string;
  title: string;
  authors: string[];
  addedAt: number;
  cover?: StoredBytes;
}

interface StoredFile extends StoredBytes {
  id: string;
}

interface CopistaSchema extends DBSchema {
  books: { key: string; value: StoredBook };
  files: { key: string; value: StoredFile };
  progress: { key: string; value: ProgressRecord };
  bookmarks: { key: string; value: BookmarkRecord; indexes: { byBook: string } };
  notes: { key: string; value: NoteRecord; indexes: { byBook: string } };
  settings: { key: string; value: SettingRecord };
}

let connection: Promise<IDBPDatabase<CopistaSchema>> | undefined;

function db(): Promise<IDBPDatabase<CopistaSchema>> {
  connection ??= openDB<CopistaSchema>(DB_NAME, DB_VERSION, {
    // Each version adds to the one before, so a library kept by an older version keeps its books.
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('books', { keyPath: 'id' });
        database.createObjectStore('files', { keyPath: 'id' });
        database.createObjectStore('progress', { keyPath: 'bookId' });
        const bookmarks = database.createObjectStore('bookmarks', { keyPath: 'id' });
        bookmarks.createIndex('byBook', 'bookId');
        database.createObjectStore('settings', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        const notes = database.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('byBook', 'bookId');
      }
    },
    // Another tab wants to delete or upgrade the database: let it.
    blocking() {
      void closeConnection();
    },
    terminated() {
      connection = undefined;
    },
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

async function closeConnection(): Promise<void> {
  const open = connection;
  connection = undefined;
  if (open) (await open.catch(() => undefined))?.close();
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

/** Runs a write, reporting a full disk as `StorageFullError` sized by the record's blobs. */
async function write(neededBytes: number, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError(neededBytes);
    throw error;
  }
}

async function toBytes(blob: Blob): Promise<StoredBytes> {
  return { bytes: await blob.arrayBuffer(), type: blob.type };
}

function toBlob(stored: StoredBytes): Blob {
  return new Blob([stored.bytes], { type: stored.type });
}

function toSummary(stored: StoredBook): BookSummary {
  const { id, title, authors, addedAt, cover } = stored;
  return cover
    ? { id, title, authors, addedAt, coverBlob: toBlob(cover) }
    : { id, title, authors, addedAt };
}

export async function putBook(rec: BookRecord): Promise<void> {
  const { id, title, authors, addedAt } = rec;
  const book: StoredBook = { id, title, authors, addedAt };
  if (rec.coverBlob) book.cover = await toBytes(rec.coverBlob);
  const file: StoredFile = { id, ...(await toBytes(rec.fileBlob)) };
  const database = await db();
  await write(rec.fileBlob.size + (rec.coverBlob?.size ?? 0), async () => {
    const tx = database.transaction(['books', 'files'], 'readwrite');
    try {
      await Promise.all([
        tx.objectStore('books').put(book),
        tx.objectStore('files').put(file),
        tx.done,
      ]);
    } catch (error) {
      // A put that throws before the transaction settles must not leave half a book behind.
      tx.done.catch(() => undefined);
      try {
        tx.abort();
      } catch {
        // Already finished or aborted.
      }
      throw error;
    }
  });
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  const tx = (await db()).transaction(['books', 'files']);
  const [book, file] = await Promise.all([
    tx.objectStore('books').get(id),
    tx.objectStore('files').get(id),
  ]);
  if (!book || !file) return undefined;
  return { ...toSummary(book), fileBlob: toBlob(file) };
}

/** Every book in the library, newest first, without the files. */
export async function listBooks(): Promise<BookSummary[]> {
  const books = await (await db()).getAll('books');
  return books.sort((a, b) => b.addedAt - a.addedAt).map(toSummary);
}

/** Removes a book together with its reading progress, bookmarks and notes, all or nothing. */
export async function deleteBook(id: string): Promise<void> {
  const tx = (await db()).transaction(
    ['books', 'files', 'progress', 'bookmarks', 'notes'],
    'readwrite',
  );
  const bookmarks = tx.objectStore('bookmarks');
  const notes = tx.objectStore('notes');
  const [marks, pinned] = await Promise.all([
    bookmarks.index('byBook').getAllKeys(id),
    notes.index('byBook').getAllKeys(id),
  ]);
  await Promise.all([
    tx.objectStore('books').delete(id),
    tx.objectStore('files').delete(id),
    tx.objectStore('progress').delete(id),
    ...marks.map((key) => bookmarks.delete(key)),
    ...pinned.map((key) => notes.delete(key)),
    tx.done,
  ]);
}

export async function getProgress(bookId: string): Promise<ProgressRecord | undefined> {
  return (await db()).get('progress', bookId);
}

export async function putProgress(rec: ProgressRecord): Promise<void> {
  const database = await db();
  await write(0, () => database.put('progress', rec));
}

/** A book's bookmarks in reading order. */
export async function listBookmarks(bookId: string): Promise<BookmarkRecord[]> {
  const marks = await (await db()).getAllFromIndex('bookmarks', 'byBook', bookId);
  return marks.sort((a, b) => a.spineIndex - b.spineIndex || a.fraction - b.fraction);
}

export async function putBookmark(rec: BookmarkRecord): Promise<void> {
  const database = await db();
  await write(0, () => database.put('bookmarks', rec));
}

export async function deleteBookmark(id: string): Promise<void> {
  await (await db()).delete('bookmarks', id);
}

/** A book's notes in reading order. */
export async function listNotes(bookId: string): Promise<NoteRecord[]> {
  const notes = await (await db()).getAllFromIndex('notes', 'byBook', bookId);
  return notes.sort(
    (a, b) => a.spineIndex - b.spineIndex || a.fraction - b.fraction || a.createdAt - b.createdAt,
  );
}

export async function putNote(rec: NoteRecord): Promise<void> {
  const database = await db();
  await write(rec.text.length * 2, () => database.put('notes', rec));
}

export async function deleteNote(id: string): Promise<void> {
  await (await db()).delete('notes', id);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('settings', key))?.value as T | undefined;
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  const database = await db();
  await write(0, () => database.put('settings', { key, value }));
}

/** Closes the connection and deletes the whole database; the next call starts empty. */
export async function deleteAllStorage(): Promise<void> {
  await closeConnection();
  await deleteDB(DB_NAME);
}
