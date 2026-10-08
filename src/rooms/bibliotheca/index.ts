import { detectFormat } from '../../core/convert/detect';
import { readEpub } from '../../core/epub/read';
import { UnsupportedFormatError } from '../../core/errors';
import { sha256Hex } from '../../core/hash';
import type { Book, BookWarning } from '../../core/model/book';
import {
  deleteBook,
  getBook,
  getSetting,
  listBooks,
  putBook,
  putSetting,
  type BookRecord,
} from '../../storage/db';

export interface ShelfBook {
  id: string;
  title: string;
  authors: string[];
  coverBlob?: Blob;
  addedAt: number;
}

export interface ImportResult {
  book: ShelfBook;
  alreadyPresent: boolean;
  warnings: BookWarning[];
}

const EPUB_MEDIA_TYPE = 'application/epub+zip';
const PERSIST_SETTING = 'persistRequested';

function toShelf(rec: BookRecord): ShelfBook {
  const { id, title, authors, coverBlob, addedAt } = rec;
  return coverBlob ? { id, title, authors, coverBlob, addedAt } : { id, title, authors, addedAt };
}

function coverOf(book: Book): Blob | undefined {
  const cover = book.cover === undefined ? undefined : book.resources.get(book.cover);
  if (!cover) return undefined;
  return new Blob([cover.data as Uint8Array<ArrayBuffer>], { type: cover.mediaType });
}

/** Asks once, after the first book is kept, that the browser not evict the library. */
async function requestPersistence(): Promise<void> {
  if ((await getSetting<boolean>(PERSIST_SETTING)) === true) return;
  try {
    await navigator.storage?.persist?.();
  } catch {
    // A refusal or a missing API only means the browser may evict the library later.
  }
  await putSetting(PERSIST_SETTING, true);
}

/**
 * Keeps an EPUB in the library. A book already there (same bytes) is returned
 * as it is, with its progress and bookmarks untouched.
 */
export async function importBook(file: File): Promise<ImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectFormat(bytes, file.name);
  if (format !== 'epub') {
    throw new UnsupportedFormatError(
      format,
      'Only EPUB books can be kept in the library. Convert this file in the Scriptorium first.',
    );
  }
  const id = await sha256Hex(bytes);
  const existing = await getBook(id);
  if (existing) return { book: toShelf(existing), alreadyPresent: true, warnings: [] };

  const book = await readEpub(bytes, { fileName: file.name });
  const rec: BookRecord = {
    id,
    title: book.meta.title,
    authors: book.meta.authors,
    fileBlob: new Blob([bytes], { type: EPUB_MEDIA_TYPE }),
    addedAt: Date.now(),
  };
  const coverBlob = coverOf(book);
  if (coverBlob) rec.coverBlob = coverBlob;
  await putBook(rec);
  await requestPersistence();
  return { book: toShelf(rec), alreadyPresent: false, warnings: book.warnings };
}

/** The library, newest first. */
export async function listShelf(): Promise<ShelfBook[]> {
  return (await listBooks()).map(toShelf);
}

/** Removes a book with its reading progress and bookmarks. */
export async function removeBook(id: string): Promise<void> {
  await deleteBook(id);
}
