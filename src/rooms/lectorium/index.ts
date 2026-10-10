import { readEpub } from '../../core/epub/read';
import type { Book } from '../../core/model/book';
import type { Position } from '../../core/model/position';
import { bookPercent, clampPosition } from '../../reader/location';
import {
  BookNotFoundError,
  deleteBookmark,
  deleteNote,
  getBook,
  getProgress,
  listBookmarks,
  listNotes,
  putBookmark,
  putNote,
  putProgress,
  type BookmarkRecord,
  type NoteRecord,
} from '../../storage/db';

export interface ReadingSession {
  bookId: string;
  book: Book;
  position: Position;
  bookmarks: BookmarkRecord[];
  notes: NoteRecord[];
}

const SNIPPET_LENGTH = 120;
/** A note is a slip of paper, not a chapter. */
export const NOTE_LENGTH = 2000;

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
  const [bookmarks, notes] = await Promise.all([listBookmarks(bookId), listNotes(bookId)]);
  return { bookId, book, position, bookmarks, notes };
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

/** Pins an empty note to the page at a position; it is kept at once, so it survives a reload. */
export async function addNote(bookId: string, pos: Position): Promise<NoteRecord> {
  const now = Date.now();
  const note: NoteRecord = {
    id: crypto.randomUUID(),
    bookId,
    spineIndex: pos.spineIndex,
    fraction: pos.fraction,
    text: '',
    createdAt: now,
    updatedAt: now,
  };
  await putNote(note);
  return note;
}

/** Keeps a note's new text; a note left blank is taken off the page and returns undefined. */
export async function saveNote(note: NoteRecord, text: string): Promise<NoteRecord | undefined> {
  if (text.trim() === '') {
    await deleteNote(note.id);
    return undefined;
  }
  const saved = { ...note, text: text.slice(0, NOTE_LENGTH), updatedAt: Date.now() };
  await putNote(saved);
  return saved;
}

export async function removeNote(id: string): Promise<void> {
  await deleteNote(id);
}

/** How far through the book a position is, weighting chapters by their length. */
export function progressPercent(book: Book, pos: Position): number {
  return bookPercent(
    pos,
    book.chapters.map((chapter) => chapter.html.length),
  );
}
