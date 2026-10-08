import type { Book } from '../model/book';
import { bookFromSections, splitByHeading, type NewBookMeta } from './build';
import { decodeText } from './decode';

const HEADING_WORD = /^(chapter|part|book|prologue|epilogue|introduction|preface)\b/i;
const ROMAN_NUMERAL = /^[IVXLC]+\.?$/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A paragraph that is a single short line naming a chapter, part or numeral. */
function isHeading(lines: string[]): boolean {
  if (lines.length !== 1) return false;
  const line = lines[0]!;
  return line.length <= 60 && (HEADING_WORD.test(line) || ROMAN_NUMERAL.test(line));
}

/**
 * Converts a plain-text file to a book. Blank lines separate paragraphs, a
 * single newline is a line break, and a short line alone between blank lines
 * that reads like a chapter heading starts a new chapter.
 */
export function fromTxt(data: Uint8Array, meta: NewBookMeta): Promise<Book> {
  const html = decodeText(data)
    .split(/\n[ \t]*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    )
    .filter((lines) => lines.length > 0)
    .map((lines) =>
      isHeading(lines)
        ? `<h1>${escapeHtml(lines[0]!)}</h1>`
        : `<p>${lines.map(escapeHtml).join('<br>')}</p>`,
    )
    .join('');
  return Promise.resolve(bookFromSections(splitByHeading(html), meta));
}
