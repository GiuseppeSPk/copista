import type { Book, TocEntry } from '../model/book';
import { mapCssUrls, mapHtmlRefs, type RefMapper } from '../refs';
import { sanitizeCss, sanitizeHtml } from '../sanitize';

const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;
/** What a reader can leave out of a copy without losing a word of it. */
const PICTURES = 'img, picture, video, audio, object, embed';

/** How the printed pages look; the reader picks these in the print preview. */
export interface PrintOptions {
  page: 'a4' | 'a5' | 'letter';
  text: 'small' | 'normal' | 'large';
  margins: 'narrow' | 'normal' | 'wide';
  /** Each chapter starts on a new page. */
  breaks: boolean;
  /** The table of contents opens the copy. */
  contents: boolean;
}

export const DEFAULT_PRINT: PrintOptions = {
  page: 'a4',
  text: 'normal',
  margins: 'normal',
  breaks: true,
  contents: true,
};

/** Page sizes, with the width the preview gives the sheet on screen. */
export const PAGE_SIZES: Record<PrintOptions['page'], { size: string; width: string; px: number }> =
  {
    a4: { size: 'A4', width: '210mm', px: 794 },
    a5: { size: 'A5', width: '148mm', px: 559 },
    letter: { size: 'letter', width: '8.5in', px: 816 },
  };
const TEXT_SIZES: Record<PrintOptions['text'], string> = {
  small: '10pt',
  normal: '11.5pt',
  large: '13.5pt',
};
// Centimetres on an A4 or Letter page; a smaller page gets smaller margins.
const MARGINS: Record<PrintOptions['margins'], number> = { narrow: 1.25, normal: 2, wide: 3 };
/** The id of the style element that holds the page options, rewritten as the reader picks. */
export const PRINT_STYLE_ID = 'print-options';

/**
 * The page rules for printing. The book's own body margins and type size give
 * way to the reader's choice; on screen the same rules draw one long sheet of
 * the page's width, so the preview has the line length the paper will have.
 */
export function printCss(options: PrintOptions): string {
  const page = PAGE_SIZES[options.page];
  const margin = `${+(MARGINS[options.margins] * (options.page === 'a5' ? 0.75 : 1)).toFixed(2)}cm`;
  const rules = [
    `@page { size: ${page.size}; margin: ${margin} }`,
    `html, body { font-size: ${TEXT_SIZES[options.text]} !important }`,
    '@media print { body { margin: 0 !important; padding: 0 !important } }',
    'img, svg, video { max-width: 100% }',
    'img { break-inside: avoid }',
  ];
  if (options.breaks) rules.push('section.chapter { break-before: page }');
  if (!options.contents) rules.push('body > nav { display: none }');
  rules.push(
    '@media screen {',
    '  html { background: #e8e4dc }',
    `  body { box-sizing: border-box !important; width: ${page.width} !important; max-width: none !important;` +
      ` margin: 24px auto !important; padding: ${margin} !important; background: #fff !important;` +
      ' color: #1f1a17; box-shadow: 0 1px 6px rgb(0 0 0 / 0.25) }',
  );
  if (options.breaks) {
    rules.push(
      `  body > nav + section.chapter, section.chapter + section.chapter { margin-top: ${margin}; padding-top: ${margin}; border-top: 1px dashed #b9b2a5 }`,
    );
  }
  rules.push('}');
  return rules.join('\n');
}
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
function dataUris(book: Book, pictures: boolean): (path: string) => string | null {
  const cache = new Map<string, string>();
  return (path) => {
    const cached = cache.get(path);
    if (cached !== undefined) return cached;
    const resource = book.resources.get(path);
    if (resource === undefined) return null;
    if (!pictures && /^(image|video|audio)\//.test(resource.mediaType)) return null;
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

function chapterHtml(
  html: string,
  index: number,
  ref: RefMapper,
  cssRef: RefMapper,
  pictures: boolean,
): string {
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(html);
  if (!pictures) {
    for (const element of template.content.querySelectorAll(PICTURES)) element.remove();
    // A drawing that frames a picture (a cover, a plate) goes with it.
    for (const svg of template.content.querySelectorAll('svg')) {
      if (svg.querySelector('image')) svg.remove();
    }
  }
  template.innerHTML = mapHtmlRefs(template.innerHTML, ref);
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
 * chapter sections. With `print`, the page rules of `DEFAULT_PRINT` come in
 * a style element of their own, which the print preview rewrites. Without
 * `pictures`, images, sound and video are left out, so a heavy book prints fast.
 */
export function toHtml(book: Book, opts: { print?: boolean; pictures?: boolean } = {}): string {
  const pictures = opts.pictures ?? true;
  const chapterIndex = new Map(book.chapters.map((chapter, i) => [chapter.href, i]));
  const dataUri = dataUris(book, pictures);
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
  const css = bookCss(book, cssRef).replace(/<\/(style)/gi, '<\\/$1');
  const lang = book.meta.language ? ` lang="${escapeAttribute(book.meta.language)}"` : '';
  const sections = book.chapters.map(
    (chapter, i) =>
      `<section class="chapter" id="${anchor(i)}">\n` +
      `${chapterHtml(chapter.html, i, htmlRef, cssRef, pictures)}\n</section>`,
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
    ...(opts.print ? [`<style id="${PRINT_STYLE_ID}">\n${printCss(DEFAULT_PRINT)}\n</style>`] : []),
    '</head>',
    '<body>',
    `<nav aria-label="Contents">${tocList(toc)}</nav>`,
    ...sections,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
