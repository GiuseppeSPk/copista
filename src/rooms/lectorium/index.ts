import { readEpub } from '../../core/epub/read';
import type { Book } from '../../core/model/book';
import type { Position } from '../../core/model/position';
import { bookPercent, clampPosition } from '../../reader/location';
import {
  BookNotFoundError,
  deleteBookmark,
  getBook,
  getProgress,
  listBookmarks,
  putBookmark,
  putProgress,
  type BookmarkRecord,
} from '../../storage/db';

export interface ReadingSession {
  bookId: string;
  book: Book;
  position: Position;
  bookmarks: BookmarkRecord[];
}

const SNIPPET_LENGTH = 120;

/** Opens a library book where the reader left off, or at the start. */
export async function openSession(bookId: string): Promise<ReadingSession> {
  const rec = await getBook(bookId);
  if (!rec) throw new BookNotFoundError(bookId);
  const book = await readEpub(new Uint8Array(await rec.fileBlob.arrayBuffer()));
  const stored = await getProgress(bookId);
  const position = stored
    ? clampPosition(
        { spineIndex: stored.spineIndex, fraction: stored.fraction },
        book.chapters.length,
      )
    : { spineIndex: 0, fraction: 0 };
  return { bookId, book, position, bookmarks: await listBookmarks(bookId) };
}

export async function savePosition(bookId: string, pos: Position): Promise<void> {
  await putProgress({
    bookId,
    spineIndex: pos.spineIndex,
    fraction: pos.fraction,
    updatedAt: Date.now(),
  });
}

/** Keeps a bookmark with a one-line excerpt of the page it marks. */
export async function addBookmark(
  bookId: string,
  pos: Position,
  snippet: string,
): Promise<BookmarkRecord> {
  const mark: BookmarkRecord = {
    id: crypto.randomUUID(),
    bookId,
    spineIndex: pos.spineIndex,
    fraction: pos.fraction,
    snippet: snippet.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH),
    createdAt: Date.now(),
  };
  await putBookmark(mark);
  return mark;
}

export async function removeBookmark(id: string): Promise<void> {
  await deleteBookmark(id);
}

/** How far through the book a position is, weighting chapters by their length. */
export function progressPercent(book: Book, pos: Position): number {
  return bookPercent(
    pos,
    book.chapters.map((chapter) => chapter.html.length),
  );
}
