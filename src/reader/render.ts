import type { Book } from '../core/model/book';
import { mapHtmlRefs } from '../core/refs';
import { sanitizeHtml } from '../core/sanitize';
import { splitKey, type ResourceUrls } from './resources';

export type Theme = 'light' | 'dark' | 'sepia';

/** Turning one screen at a time, or one long column per chapter. */
export type ReadingMode = 'pages' | 'scroll';

export interface ReaderLook {
  fontSizePercent: number;
  theme: Theme;
}

const CSP =
  "default-src 'none'; img-src blob: data:; font-src blob: data:; style-src blob: 'unsafe-inline'";

/** Placeholder colours; the interface work will choose the real ones. */
const THEME_COLORS: Record<Theme, { background: string; text: string; link: string }> = {
  light: { background: '#ffffff', text: '#1a1a1a', link: '#1a4d8f' },
  dark: { background: '#1b1b1b', text: '#e6e6e6', link: '#8ab4f8' },
  sepia: { background: '#f4ecd8', text: '#3b2f22', link: '#6b4226' },
};

const LINK_SCHEMES = /^\s*(?:https?|mailto):/i;

function escapeAttribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Keeps text inside a <style> element from closing it. */
const styleText = (css: string) => css.replace(/<\/(style)/gi, '<\\/$1');

function readerCss(look: ReaderLook): string {
  const colors = THEME_COLORS[look.theme] ?? THEME_COLORS.light;
  const size = Number.isFinite(look.fontSizePercent) ? Math.round(look.fontSizePercent) : 100;
  return [
    `:root { --copista-background: ${colors.background}; --copista-text: ${colors.text};` +
      ` --copista-link: ${colors.link}; }`,
    `html { font-size: ${size}%; background: var(--copista-background);` +
      ' color: var(--copista-text); }',
    'a { color: var(--copista-link); }',
    'img, svg, video { max-width: 100%; height: auto; }',
  ].join('\n');
}

/**
 * Links do not navigate inside the frame: a link to a chapter keeps its book
 * key in data-copista-href, an outside link its URL in data-copista-external,
 * and the reader decides what to do with a click.
 */
function bodyHtml(book: Book, html: string, urls: ResourceUrls): string {
  const chapters = new Set(book.chapters.map((chapter) => chapter.href));
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(html);
  for (const link of template.content.querySelectorAll('a[href], area[href]')) {
    const href = link.getAttribute('href')!;
    link.removeAttribute('href');
    if (LINK_SCHEMES.test(href)) {
      link.setAttribute('data-copista-external', href.trim());
    } else if (chapters.has(splitKey(href).path)) {
      link.setAttribute('data-copista-href', href);
    } else {
      continue;
    }
    link.setAttribute('href', '#');
  }
  for (const element of template.content.querySelectorAll('[style]')) {
    element.setAttribute('style', urls.css(element.getAttribute('style')!));
  }
  return mapHtmlRefs(template.innerHTML, (ref) => (ref === '#' ? ref : urls.refFor(ref)));
}

/**
 * The srcdoc of one chapter: a standalone page whose policy lets it load
 * nothing but blob: and data: resources and run no script at all.
 */
export function buildSrcdoc(
  book: Book,
  index: number,
  urls: ResourceUrls,
  look: ReaderLook,
): string {
  const chapter = book.chapters[index];
  if (chapter === undefined) throw new RangeError(`No chapter at index ${index}`);
  const lang = book.meta.language ? ` lang="${escapeAttribute(book.meta.language)}"` : '';
  const links = chapter.stylesheets
    .map((key) => urls.urlFor(key))
    .filter((url) => url !== null)
    .map((url) => `<link rel="stylesheet" href="${escapeAttribute(url)}">`);
  const inline =
    chapter.inlineCss.trim() === ''
      ? []
      : [`<style>${styleText(urls.css(chapter.inlineCss))}</style>`];
  // The book is read as it was written: a browser translating the app leaves its pages alone,
  // as the voice, the notes and the search all work on the words the book has.
  return [
    '<!doctype html>',
    `<html${lang} translate="no" data-theme="${look.theme}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    ...links,
    ...inline,
    `<style>${styleText(readerCss(look))}</style>`,
    '</head>',
    `<body>${bodyHtml(book, chapter.html, urls)}</body>`,
    '</html>',
  ].join('\n');
}
