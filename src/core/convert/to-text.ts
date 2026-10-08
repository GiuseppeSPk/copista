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

function imageLabel(alt: string | null): string {
  const text = alt?.replace(/\s+/g, ' ').trim();
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
      else if (tag === 'img' || tag === 'svg') line += imageLabel(child.getAttribute('alt'));
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

/**
 * The book as plain text: title and authors, then each chapter's blocks
 * separated by a blank line, and chapters by two.
 */
export function toText(book: Book): string {
  const header = [book.meta.title, book.meta.authors.join(', ')].filter((s) => s !== '');
  const chapters = book.chapters
    .map((chapter) => textBlocks(chapter.html).join('\n\n'))
    .filter((text) => text !== '');
  return `${header.join('\n')}\n\n${chapters.join('\n\n\n')}`.trimEnd() + '\n';
}
