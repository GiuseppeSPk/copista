import type { Book } from '../model/book';
import { bookFromSections, splitByHeading, titleFromFileName, type NewBookMeta } from './build';
import { decodeText } from './decode';

const HEADING_WORD = new RegExp(
  '^(' +
    [
      'chapter|part|book|prologue|epilogue|introduction|preface',
      'capitolo|parte|libro|prologo|epilogo|introduzione|prefazione',
      'chapitre|capítulo|kapitel',
    ].join('|') +
    ')\\b',
  'i',
);
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

/** A short line with no closing punctuation, as a title is set. */
function isTitleLine(line: string | undefined): line is string {
  return (
    line !== undefined &&
    line.length <= 80 &&
    /\p{L}/u.test(line) &&
    !/[.,;:]$/.test(line) &&
    !isHeading([line])
  );
}

const NAME_PARTICLE = /^(?:by|di|da|de|del|della|van|von|der|du|le|la|par|por|y|e|and|und|et)$/i;
const AUTHOR_PREFIX = /^(?:by|di|de|von|par|por)\s+/i;

/** A line that reads as a person's name: a few capitalised words, initials or particles. */
function authorOf(line: string | undefined): string | undefined {
  if (!isTitleLine(line) || line.length > 60) return undefined;
  const name = line.replace(AUTHOR_PREFIX, '');
  const words = name.split(/\s+/);
  const nameLike = words.every((word) => /^\p{Lu}/u.test(word) || NAME_PARTICLE.test(word));
  return words.length <= 6 && nameLike && /^\p{Lu}/u.test(name) ? name : undefined;
}

/**
 * The title, and the author when a name follows it, from the short lines a
 * text opens with: "Title", or "Title" then "Author", either on lines of
 * their own or as one paragraph of two lines. Something must follow them,
 * and Project Gutenberg texts, which open with their licence, are left alone.
 */
function titlePage(
  blocks: string[][],
  text: string,
): { title: string; author?: string; used: number } | undefined {
  if (/project gutenberg/i.test(text.slice(0, 3000))) return undefined;
  const [first, second] = blocks;
  if (first?.length === 2) {
    const author = authorOf(first[1]);
    return isTitleLine(first[0]) && author !== undefined && blocks.length > 1
      ? { title: first[0], author, used: 1 }
      : undefined;
  }
  if (first?.length !== 1 || !isTitleLine(first[0]) || blocks.length < 2) return undefined;
  const author = second?.length === 1 && blocks.length > 2 ? authorOf(second[0]) : undefined;
  return author === undefined ? { title: first[0], used: 1 } : { title: first[0], author, used: 2 };
}

/**
 * Converts a plain-text file to a book. Blank lines separate paragraphs, a
 * single newline is a line break, and a short line alone between blank lines
 * that reads like a chapter heading starts a new chapter. Short lines at the
 * top become a title page and, where the caller leaves them empty, the
 * book's title and author; the title then falls back to the file name.
 */
export function fromTxt(
  data: Uint8Array,
  meta: Partial<NewBookMeta>,
  opts: { fileName?: string } = {},
): Promise<Book> {
  const text = decodeText(data);
  const blocks = text
    .split(/\n[ \t]*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    )
    .filter((lines) => lines.length > 0);
  const page = titlePage(blocks, text);
  const html =
    (page === undefined
      ? ''
      : `<p class="title">${escapeHtml(page.title)}</p>` +
        (page.author === undefined ? '' : `<p class="author">${escapeHtml(page.author)}</p>`)) +
    blocks
      .slice(page?.used ?? 0)
      .map((lines) =>
        isHeading(lines)
          ? `<h1>${escapeHtml(lines[0]!)}</h1>`
          : `<p>${lines.map(escapeHtml).join('<br>')}</p>`,
      )
      .join('');
  return Promise.resolve(
    bookFromSections(splitByHeading(html), {
      title: meta.title || page?.title || titleFromFileName(opts.fileName) || 'Untitled',
      author: meta.author || page?.author || 'Unknown',
      language: meta.language,
    }),
  );
}
