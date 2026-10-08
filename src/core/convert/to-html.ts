import type { Book, TocEntry } from '../model/book';
import { mapCssUrls, mapHtmlRefs, type RefMapper } from '../refs';
import { sanitizeCss, sanitizeHtml } from '../sanitize';

const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;
const PRINT_CSS = '@page { margin: 2cm }\nsection.chapter { break-before: page }';
// Everything the page shows is inlined, so it never needs to load anything else.
const PAGE_POLICY =
  "default-src 'none'; img-src data:; font-src data:; media-src data:; style-src 'unsafe-inline'";

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;');
}

function base64(data: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < data.length; start += 0x8000) {
    binary += String.fromCharCode(...data.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function splitKey(ref: string): { path: string; fragment: string } {
  const hashAt = ref.indexOf('#');
  return hashAt < 0
    ? { path: ref, fragment: '' }
    : { path: ref.slice(0, hashAt), fragment: ref.slice(hashAt + 1) };
}

function anchor(chapter: number, fragment = ''): string {
  return fragment === '' ? `ch-${chapter + 1}` : `ch-${chapter + 1}-${fragment}`;
}

/** Turns the book keys of one book into data: URIs, each encoded once. */
function dataUris(book: Book): (path: string) => string | null {
  const cache = new Map<string, string>();
  return (path) => {
    const cached = cache.get(path);
    if (cached !== undefined) return cached;
    const resource = book.resources.get(path);
    if (resource === undefined) return null;
    const uri = `data:${resource.mediaType};base64,${base64(resource.data)}`;
    cache.set(path, uri);
    return uri;
  };
}

function bookCss(book: Book, cssRef: RefMapper): string {
  const sheets: string[] = [];
  const seenKeys = new Set<string>();
  const seenCss = new Set<string>();
  const add = (css: string): void => {
    if (css.trim() === '' || seenCss.has(css)) return;
    seenCss.add(css);
    sheets.push(sanitizeCss(mapCssUrls(css, cssRef)));
  };
  for (const chapter of book.chapters) {
    for (const key of chapter.stylesheets) {
      const sheet = book.resources.get(key);
      if (sheet !== undefined && !seenKeys.has(key)) {
        seenKeys.add(key);
        add(new TextDecoder().decode(sheet.data));
      }
    }
    add(chapter.inlineCss);
  }
  return sheets.join('\n');
}

function chapterHtml(html: string, index: number, ref: RefMapper, cssRef: RefMapper): string {
  const template = document.createElement('template');
  template.innerHTML = mapHtmlRefs(sanitizeHtml(html), ref);
  for (const element of template.content.querySelectorAll('[id]')) {
    element.id = anchor(index, element.id);
  }
  for (const element of template.content.querySelectorAll('[style]')) {
    element.setAttribute('style', sanitizeCss(mapCssUrls(element.getAttribute('style')!, cssRef)));
  }
  return template.innerHTML;
}

function tocList(entries: TocEntry[]): string {
  if (entries.length === 0) return '';
  const items = entries.map(
    (entry) =>
      `<li><a href="#${escapeAttribute(anchor(entry.chapter, encodeURIComponent(entry.fragment ?? '')))}">` +
      `${escapeText(entry.label)}</a>${tocList(entry.children)}</li>`,
  );
  return `<ol>${items.join('')}</ol>`;
}

/**
 * The whole book as one self-contained HTML document: styles, images and
 * fonts are inlined as data: URIs and links inside the book point at the
 * chapter sections. With `print`, every chapter starts on a new page.
 */
export function toHtml(book: Book, opts: { print?: boolean } = {}): string {
  const chapterIndex = new Map(book.chapters.map((chapter, i) => [chapter.href, i]));
  const dataUri = dataUris(book);
  const cssRef: RefMapper = (ref) =>
    EXTERNAL.test(ref.trim()) ? ref : dataUri(splitKey(ref).path);
  const htmlRef: RefMapper = (ref) => {
    if (EXTERNAL.test(ref.trim())) return ref;
    const { path, fragment } = splitKey(ref);
    const target = chapterIndex.get(path);
    if (target !== undefined) return `#${anchor(target, encodeURIComponent(fragment))}`;
    return dataUri(path);
  };

  const toc: TocEntry[] =
    book.toc.length > 0
      ? book.toc
      : book.chapters.map((chapter, i) => ({
          label: chapter.title ?? `Chapter ${i + 1}`,
          chapter: i,
          children: [],
        }));
  const css = [bookCss(book, cssRef), opts.print ? PRINT_CSS : '']
    .filter((part) => part !== '')
    .join('\n')
    .replace(/<\/(style)/gi, '<\\/$1');
  const lang = book.meta.language ? ` lang="${escapeAttribute(book.meta.language)}"` : '';
  const sections = book.chapters.map(
    (chapter, i) =>
      `<section class="chapter" id="${anchor(i)}">\n` +
      `${chapterHtml(chapter.html, i, htmlRef, cssRef)}\n</section>`,
  );

  return [
    '<!DOCTYPE html>',
    `<html${lang}>`,
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${PAGE_POLICY}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ...(opts.print ? ['<meta name="color-scheme" content="light">'] : []),
    `<title>${escapeText(book.meta.title)}</title>`,
    `<style>\n${css}\n</style>`,
    '</head>',
    '<body>',
    `<nav aria-label="Contents">${tocList(toc)}</nav>`,
    ...sections,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
