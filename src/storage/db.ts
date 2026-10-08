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
const DB_VERSION = 1;

interface SettingRecord {
  key: string;
  value: unknown;
}

interface CopistaSchema extends DBSchema {
  books: { key: string; value: BookRecord };
  progress: { key: string; value: ProgressRecord };
  bookmarks: { key: string; value: BookmarkRecord; indexes: { byBook: string } };
  settings: { key: string; value: SettingRecord };
}

let connection: Promise<IDBPDatabase<CopistaSchema>> | undefined;

function db(): Promise<IDBPDatabase<CopistaSchema>> {
  connection ??= openDB<CopistaSchema>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore('books', { keyPath: 'id' });
      database.createObjectStore('progress', { keyPath: 'bookId' });
      const bookmarks = database.createObjectStore('bookmarks', { keyPath: 'id' });
      bookmarks.createIndex('byBook', 'bookId');
      database.createObjectStore('settings', { keyPath: 'key' });
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

export async function putBook(rec: BookRecord): Promise<void> {
  const database = await db();
  await write(rec.fileBlob.size + (rec.coverBlob?.size ?? 0), () => database.put('books', rec));
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  return (await db()).get('books', id);
}

/** Every book in the library, newest first. */
export async function listBooks(): Promise<BookRecord[]> {
  const books = await (await db()).getAll('books');
  return books.sort((a, b) => b.addedAt - a.addedAt);
}

/** Removes a book together with its reading progress and bookmarks, all or nothing. */
export async function deleteBook(id: string): Promise<void> {
  const tx = (await db()).transaction(['books', 'progress', 'bookmarks'], 'readwrite');
  const bookmarks = tx.objectStore('bookmarks');
  const marks = await bookmarks.index('byBook').getAllKeys(id);
  await Promise.all([
    tx.objectStore('books').delete(id),
    tx.objectStore('progress').delete(id),
    ...marks.map((key) => bookmarks.delete(key)),
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
