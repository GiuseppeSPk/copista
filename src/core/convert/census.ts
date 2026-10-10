/**
 * A census of what a reader would miss if it went astray between a book and a copy of it:
 * every word, and the parts that carry structure. The same census runs on the original and
 * on the copy read back, so the two can be compared.
 */

export type Part = 'headings' | 'notes' | 'images' | 'tables' | 'links' | 'emphasis';

export const PARTS: Part[] = ['headings', 'notes', 'images', 'tables', 'links', 'emphasis'];

export interface Census {
  /** Each word in lower case, with how often it occurs, in order of first appearance. */
  words: Map<string, number>;
  /** Counts of each part; absent for plain text, which holds words only. */
  parts?: Record<Part, number>;
}

export interface PartCheck {
  part: Part;
  original: number;
  copy: number;
}

export interface Collation {
  words: { total: number; found: number; missing: string[] };
  /** Only the parts the original has. Absent when the copy is plain text. */
  parts?: PartCheck[];
}

const WORD = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu;
/** Soft hyphens, zero-width joiners and other format marks, which copies keep or drop. */
const INVISIBLE = /\p{Cf}/gu;
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;
const WEB_LINK = /^(?:https?|mailto):/i;
/** The text of a note reference: a number, a letter, a numeral or a mark, maybe bracketed. */
const NOTE_MARK = /^[[(]?(?:\d{1,4}|[ivxlc]{1,6}|[a-z]|[*†‡§¶]{1,3})[\])]?$/i;
const NOTE_NAME = /note|fn/i;
const EMPHASIS = 'em, i, strong, b, cite';
/** Elements that sit inside a line of text; any other element separates words. */
const INLINE = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'big',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'time',
  'tt',
  'u',
  'var',
]);
const SKIPPED = new Set(['script', 'style', 'template', 'head', 'title']);
const MISSING_SAMPLES = 5;

function countWords(text: string, words: Map<string, number>): void {
  const plain = text.normalize('NFC').toLowerCase().replace(INVISIBLE, '').replace(/[‘’]/g, "'");
  for (const [word] of plain.matchAll(WORD)) {
    words.set(word, (words.get(word) ?? 0) + 1);
  }
}

/** The text of a tree, with a space wherever an element breaks the line of text. */
function textOf(root: Node): string {
  const pieces: string[] = [];
  const walk = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        pieces.push((child as Text).data);
      } else if (child instanceof Element && !SKIPPED.has(child.localName)) {
        const inline = INLINE.has(child.localName);
        if (!inline) pieces.push(' ');
        walk(child);
        if (!inline) pieces.push(' ');
      }
    }
  };
  walk(root);
  return pieces.join('');
}

/**
 * A link to a note, or back from one: marked as such, or a short mark that is raised,
 * bracketed or pointing at something named as a note. A contents entry such as "IV" is not.
 */
function isNoteRef(link: Element): boolean {
  const href = link.getAttribute('href')?.trim() ?? '';
  if (!href.includes('#') || EXTERNAL.test(href)) return false;
  const roles = `${link.getAttribute('epub:type') ?? ''} ${link.getAttribute('role') ?? ''}`;
  if (/\b(?:doc-)?noteref\b/.test(roles)) return true;
  const mark = (link.textContent ?? '').replace(/\s+/g, '');
  if (!NOTE_MARK.test(mark)) return false;
  return (
    /^[[(]/.test(mark) ||
    link.closest('sup') !== null ||
    link.querySelector('sup') !== null ||
    NOTE_NAME.test(`${href} ${link.getAttribute('class') ?? ''}`)
  );
}

function countParts(root: ParentNode, parts: Record<Part, number>): void {
  parts.headings += root.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
  parts.tables += root.querySelectorAll('table').length;
  for (const image of root.querySelectorAll('img, svg')) {
    if (
      image.localName === 'svg' ? !image.parentElement?.closest('svg') : image.getAttribute('src')
    ) {
      parts.images++;
    }
  }
  for (const link of root.querySelectorAll('a[href]')) {
    if (WEB_LINK.test(link.getAttribute('href')!.trim())) parts.links++;
    else if (isNoteRef(link)) parts.notes++;
  }
  // Bold inside italics counts once: copies nest and merge such runs in their own ways.
  for (const element of root.querySelectorAll(EMPHASIS)) {
    if ((element.textContent ?? '').trim() !== '' && !element.parentElement?.closest(EMPHASIS)) {
      parts.emphasis++;
    }
  }
}

/** The census of a book given as the HTML of its chapters. */
export function censusOfHtml(chapters: string[]): Census {
  const words = new Map<string, number>();
  const parts: Record<Part, number> = {
    headings: 0,
    notes: 0,
    images: 0,
    tables: 0,
    links: 0,
    emphasis: 0,
  };
  for (const html of chapters) {
    const template = document.createElement('template');
    template.innerHTML = html;
    countWords(textOf(template.content), words);
    countParts(template.content, parts);
  }
  return { words, parts };
}

/** The census of plain text: its words, and nothing else. */
export function censusOfText(text: string): Census {
  const words = new Map<string, number>();
  countWords(text, words);
  return { words };
}

/**
 * Compares a copy with its original. A word counts as found as many times as it occurs in
 * both; words a copy adds of its own, such as image labels, change nothing.
 */
export function collate(original: Census, copy: Census): Collation {
  let total = 0;
  let found = 0;
  const missing: string[] = [];
  for (const [word, count] of original.words) {
    const kept = Math.min(count, copy.words.get(word) ?? 0);
    total += count;
    found += kept;
    if (kept < count && missing.length < MISSING_SAMPLES) missing.push(word);
  }
  const collation: Collation = { words: { total, found, missing } };
  if (original.parts && copy.parts) {
    const { parts: before } = original;
    const { parts: after } = copy;
    collation.parts = PARTS.filter((part) => before[part] > 0).map((part) => ({
      part,
      original: before[part],
      copy: after[part],
    }));
  }
  return collation;
}
