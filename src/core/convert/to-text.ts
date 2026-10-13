import type { Book } from '../model/book';

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'caption',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tr',
  'ul',
]);
const SKIPPED_TAGS = new Set(['script', 'style', 'template']);

/** Pictures this small are marks and icons, such as a quality badge, not part of the text. */
const DECORATION_PX = 32;

function sizeOf(image: Element, side: 'width' | 'height'): number | undefined {
  const styled = new RegExp(`(?:^|;)\\s*${side}\\s*:\\s*([\\d.]+)px`, 'i').exec(
    image.getAttribute('style') ?? '',
  );
  const value = Number(styled?.[1] ?? image.getAttribute(side) ?? NaN);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Where a picture stood, as a label carrying its description. A picture
 * drawn no bigger than an icon gets none.
 */
export function imageLabel(image: Element): string {
  const sides = [sizeOf(image, 'width'), sizeOf(image, 'height')];
  if (sides.some((side) => side !== undefined && side <= DECORATION_PX)) return '';
  const text = image.getAttribute('alt')?.replace(/\s+/g, ' ').trim();
  return text ? `[Image: ${text}]` : '[Image]';
}

/** The text blocks of a chapter, in reading order. */
function textBlocks(html: string): string[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  const blocks: string[] = [];
  let line = '';
  let prefix = '';
  let preDepth = 0;

  const flush = (): void => {
    const text =
      preDepth > 0 ? line.replace(/^\n+|\s+$/g, '') : line.replace(/ *\n */g, '\n').trim();
    line = '';
    if (text.trim() === '') return;
    blocks.push(prefix + text);
    prefix = '';
  };

  const walk = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const data = (child as Text).data;
        line += preDepth > 0 ? data : data.replace(/\s+/g, ' ');
        continue;
      }
      if (!(child instanceof Element)) continue;
      const tag = child.localName.toLowerCase();
      if (SKIPPED_TAGS.has(tag)) continue;
      if (tag === 'br') line += '\n';
      else if (tag === 'img' || tag === 'svg') line += imageLabel(child);
      else if (tag === 'td' || tag === 'th') {
        walk(child);
        line += '\t';
      } else if (BLOCK_TAGS.has(tag)) {
        flush();
        if (tag === 'li') prefix = '- ';
        if (tag === 'pre') preDepth++;
        walk(child);
        flush();
        if (tag === 'pre') preDepth--;
      } else walk(child);
    }
  };

  walk(template.content);
  flush();
  return blocks;
}

/** Blocks of a title page the book's own opening may already print. */
const TITLE_PAGE_BLOCKS = 8;

const sameText = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The book as plain text: title and authors, unless its first pages already
 * print them, then each chapter's blocks separated by a blank line, and
 * chapters by two.
 */
export function toText(book: Book): string {
  const blocks = book.chapters.map((chapter) => textBlocks(chapter.html));
  const opening = new Set(blocks.flat().slice(0, TITLE_PAGE_BLOCKS).map(sameText));
  const header = [book.meta.title, book.meta.authors.join(', ')].filter(
    (s) => s !== '' && !opening.has(sameText(s)),
  );
  const chapters = blocks.map((text) => text.join('\n\n')).filter((text) => text !== '');
  const top = header.length > 0 ? `${header.join('\n')}\n\n` : '';
  return `${top}${chapters.join('\n\n\n')}`.trimEnd() + '\n';
}
