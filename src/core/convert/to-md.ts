import TurndownService from 'turndown';
import type { Book } from '../model/book';

const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;
const TABLE_ATTRIBUTES = new Set(['colspan', 'rowspan']);

function imageLabel(alt: string | null): string {
  const text = alt?.replace(/\s+/g, ' ').trim();
  return text ? `[Image: ${text}]` : '[Image]';
}

function isInternalLink(node: HTMLElement): boolean {
  const href = node.getAttribute('href');
  return node.nodeName === 'A' && href !== null && !EXTERNAL.test(href.trim());
}

let service: TurndownService | undefined;

function getService(): TurndownService {
  if (service) return service;
  service = new TurndownService({
    headingStyle: 'atx',
    emDelimiter: '*',
    strongDelimiter: '**',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });
  service.remove(['script', 'style', 'template']);
  // Markdown has no tables of its own; raw HTML tables survive the trip back.
  service.keep(['table']);
  service.addRule('image', {
    filter: (node) => ['img', 'svg'].includes(node.nodeName.toLowerCase()),
    replacement: (_content, node) => imageLabel((node as HTMLElement).getAttribute('alt')),
  });
  service.addRule('internalLink', {
    filter: (node) => isInternalLink(node),
    replacement: (content) => content,
  });
  return service;
}

/** Tables are kept as HTML, so they get by hand what the turndown rules do elsewhere. */
function prepareTables(root: Element): void {
  for (const table of root.querySelectorAll('table')) {
    for (const image of table.querySelectorAll('img, svg')) {
      image.replaceWith(imageLabel(image.getAttribute('alt')));
    }
    for (const link of table.querySelectorAll('a')) {
      if (isInternalLink(link as HTMLElement) || !link.hasAttribute('href')) {
        link.replaceWith(...link.childNodes);
      }
    }
    for (const element of [table, ...table.querySelectorAll('*')]) {
      for (const { name } of [...element.attributes]) {
        if (!TABLE_ATTRIBUTES.has(name) && !(name === 'href' && element.localName === 'a')) {
          element.removeAttribute(name);
        }
      }
    }
  }
}

function frontMatter(book: Book): string {
  const fields: Array<[string, string]> = [
    ['title', book.meta.title],
    ['author', book.meta.authors.join(', ')],
    ['language', book.meta.language],
  ];
  const lines = fields
    .map(([key, value]) => [key, value.replace(/\s+/g, ' ').trim()])
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}: ${value}`);
  return ['---', ...lines, '---'].join('\n');
}

/**
 * The book as Markdown: YAML front matter, then every chapter. Images become
 * "[Image: alt]" labels and links inside the book become their text.
 */
export function toMarkdown(book: Book): string {
  const chapters = book.chapters
    .map((chapter) => {
      const root = document.createElement('div');
      root.innerHTML = chapter.html;
      prepareTables(root);
      return getService().turndown(root).trim();
    })
    .filter((markdown) => markdown !== '');
  return `${frontMatter(book)}\n\n${chapters.join('\n\n')}`.trimEnd() + '\n';
}
