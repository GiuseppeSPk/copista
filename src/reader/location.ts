import type { Book } from '../core/model/book';
import type { Position } from '../core/model/position';

const clamp = (value: number, min: number, max: number) =>
  Number.isNaN(value) ? min : Math.min(max, Math.max(min, value));

/** The fraction of a chapter at which a page starts. */
export function fractionForPage(page: number, pageCount: number): number {
  return pageCount <= 0 ? 0 : page / pageCount;
}

/** The page that holds a fraction of a chapter, always a valid page index. */
export function pageForFraction(fraction: number, pageCount: number): number {
  if (!(pageCount > 0) || !(fraction > 0)) return 0;
  return Math.min(pageCount - 1, Math.floor(fraction * pageCount + 1e-6));
}

/**
 * How far through the whole book a position is, as an integer percentage.
 * Chapters weigh by their length; when no length is known they weigh the same.
 */
export function bookPercent(pos: Position, chapterLengths: number[]): number {
  if (chapterLengths.length === 0) return 0;
  const { spineIndex, fraction } = clampPosition(pos, chapterLengths.length);
  const total = chapterLengths.reduce((sum, length) => sum + length, 0);
  const lengths = total > 0 ? chapterLengths : chapterLengths.map(() => 1);
  const before = lengths.slice(0, spineIndex).reduce((sum, length) => sum + length, 0);
  const read = before + fraction * lengths[spineIndex]!;
  const all = total > 0 ? total : lengths.length;
  return clamp(Math.round((read / all) * 100), 0, 100);
}

/** Pulls a stored position back inside a book with this many chapters. */
export function clampPosition(pos: Position, chapterCount: number): Position {
  return {
    spineIndex: clamp(Math.trunc(pos.spineIndex), 0, Math.max(0, chapterCount - 1)),
    fraction: clamp(pos.fraction, 0, 1),
  };
}

/** The chapter, and the fragment inside it, that a book key points to. */
export function chapterForHref(
  book: Book,
  key: string,
): { spineIndex: number; fragment?: string } | null {
  const hash = key.indexOf('#');
  const path = hash < 0 ? key : key.slice(0, hash);
  const fragment = hash < 0 ? '' : key.slice(hash + 1);
  const spineIndex = book.chapters.findIndex((chapter) => chapter.href === path);
  if (spineIndex < 0) return null;
  return fragment === '' ? { spineIndex } : { spineIndex, fragment };
}
