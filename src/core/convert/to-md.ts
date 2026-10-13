import TurndownService from 'turndown';
import type { Book } from '../model/book';
import { imageLabel } from './to-text';

const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;
const TABLE_ATTRIBUTES = new Set(['colspan', 'rowspan']);

function isInternalLink(node: HTMLElement): boolean {
  const href = node.getAttribute('href');
  return node.nodeName === 'A' && href !== null && !EXTERNAL.test(href.trim());
}

function isEmpty(node: HTMLElement): boolean {
  const images = [...node.querySelectorAll('img, svg')];
  return node.textContent.trim() === '' && images.every((image) => imageLabel(image) === '');
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
  // A table that fits a grid of one-line cells becomes a pipe table; any
  // other stays HTML, which survives the trip back.
  service.keep(['table']);
  service.addRule('pipeTable', {
    filter: (node) => node.nodeName === 'TABLE' && isPipeTable(node as HTMLTableElement),
    replacement: (_content, node) => `\n\n${pipeTable(node as HTMLTableElement)}\n\n`,
  });
  service.addRule('image', {
    filter: (node) => ['img', 'svg'].includes(node.nodeName.toLowerCase()),
    replacement: (_content, node) => imageLabel(node as HTMLElement),
  });
  service.addRule('internalLink', {
    filter: (node) => isInternalLink(node),
    replacement: (content) => content,
  });
  // A link around nothing but an icon would be left as "[](...)".
  service.addRule('emptyLink', {
    filter: (node) => node.nodeName === 'A' && isEmpty(node),
    replacement: () => '',
  });
  return service;
}

const CELL_BLOCKS = 'table, ul, ol, dl, pre, blockquote, figure, hr, h1, h2, h3, h4, h5, h6';

function isLineCell(cell: HTMLTableCellElement): boolean {
  return (
    cell.colSpan <= 1 &&
    cell.rowSpan <= 1 &&
    !cell.querySelector(CELL_BLOCKS) &&
    cell.querySelectorAll('p, div').length <= 1
  );
}

/** A table with no caption, no merged cells and no more than a paragraph in a cell. */
function isPipeTable(table: HTMLTableElement): boolean {
  if (table.rows.length === 0 || table.caption) return false;
  const rows = [...table.rows];
  return rows.every((row) => row.cells.length > 0 && [...row.cells].every(isLineCell));
}

function cellText(cell: HTMLTableCellElement): string {
  const text = getService().turndown(cell);
  return text.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

/**
 * Rows of cells between pipes, leaving out the rows and columns with nothing
 * in them; the first row heads the table, as Markdown needs one.
 */
function pipeTable(table: HTMLTableElement): string {
  const rows = [...table.rows]
    .map((row) => [...row.cells].map(cellText))
    .filter((cells) => cells.some((text) => text !== ''));
  const width = Math.max(0, ...rows.map((cells) => cells.length));
  const columns = [...Array(width).keys()].filter((i) => rows.some((cells) => cells[i]));
  if (columns.length === 0) return '';
  const line = (cells: string[]): string => `| ${columns.map((i) => cells[i] ?? '').join(' | ')} |`;
  const [head = [], ...body] = rows;
  return [line(head), line(Array<string>(width).fill('---')), ...body.map(line)].join('\n');
}

/** Tables kept as HTML get by hand what the turndown rules do elsewhere. */
function prepareTables(root: Element): void {
  for (const table of root.querySelectorAll('table')) {
    if (isPipeTable(table) && !table.parentElement?.closest('table')) continue;
    for (const image of table.querySelectorAll('img, svg')) {
      image.replaceWith(imageLabel(image));
    }
    for (const link of table.querySelectorAll('a')) {
      if (isInternalLink(link) || isEmpty(link) || !link.hasAttribute('href')) {
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
