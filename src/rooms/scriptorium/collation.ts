import {
  censusOfHtml,
  censusOfText,
  collate,
  type Census,
  type Collation,
} from '../../core/convert/census';
import { decodeText } from '../../core/convert/decode';
import { fromMarkdown } from '../../core/convert/from-md';
import { readEpub } from '../../core/epub/read';
import type { Book } from '../../core/model/book';

/** The formats a copy can be read back from; a print view is HTML. */
export type CopyFormat = 'epub' | 'docx' | 'md' | 'txt' | 'html';

/** The chapters of a whole-book HTML page, without the contents list it adds. */
function chaptersOfPage(html: string): string[] {
  const page = new DOMParser().parseFromString(html, 'text/html');
  return [...page.querySelectorAll('section.chapter')].map((section) => section.innerHTML);
}

async function censusOfCopy(copy: Uint8Array | string, format: CopyFormat): Promise<Census> {
  if (typeof copy === 'string') return censusOfHtml(chaptersOfPage(copy));
  switch (format) {
    case 'epub':
      return censusOfHtml((await readEpub(copy)).chapters.map((c) => c.html));
    case 'docx': {
      const { fromDocx } = await import('../../core/convert/from-docx');
      return censusOfHtml((await fromDocx(copy)).chapters.map((c) => c.html));
    }
    case 'md':
      return censusOfHtml((await fromMarkdown(copy, {})).chapters.map((c) => c.html));
    case 'txt':
      return censusOfText(decodeText(copy));
    case 'html':
      return censusOfHtml(chaptersOfPage(decodeText(copy)));
  }
}

/**
 * Reads a copy back the way another program would and compares it with the book it was made
 * from: how many of the book's words arrived, and how many headings, notes, images, tables,
 * links and emphases.
 */
export async function collateCopy(
  book: Book,
  copy: Uint8Array | string,
  format: CopyFormat,
): Promise<Collation> {
  const original = censusOfHtml(book.chapters.map((c) => c.html));
  return collate(original, await censusOfCopy(copy, format));
}
