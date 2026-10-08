import { zipSync, type Zippable } from 'fflate';
import type { Book, Chapter, TocEntry } from '../model/book';
import { relativeHref } from '../paths';
import { mapCssUrls, mapHtmlRefs, type RefMapper } from '../refs';
import { toHtml5, Z3998_PREFIX } from './html5';
import { escapeXml, htmlToXhtml } from './xhtml';

const OPS_NS = 'http://www.idpf.org/2007/ops';
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;

/**
 * Resource types that never come along: the old package, nav, NCX and
 * non-spine documents, and the search key maps and media overlays that
 * point into documents the writer rewrites.
 */
const SKIPPED_TYPES = new Set([
  'application/xhtml+xml',
  'text/html',
  'application/x-dtbncx+xml',
  'application/oebps-package+xml',
  'application/vnd.epub.search-key-map+xml',
  'application/smil+xml',
]);

/** Common non-standard media types mapped to the ones EPUB 3 lists as core. */
const MEDIA_TYPE_FIXES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'application/x-font-ttf': 'font/ttf',
  'application/x-font-truetype': 'font/ttf',
  'application/x-truetype-font': 'font/ttf',
  'application/x-font-otf': 'font/otf',
  'application/x-font-opentype': 'font/otf',
  'application/x-font-woff': 'font/woff',
  'application/font-woff2': 'font/woff2',
};

/** Compressing already compressed media only costs time. */
const STORED = /^(image|font|audio|video)\/|^application\/(font|vnd\.ms-opentype)/;

/** Fixed-layout documents must declare a viewport; the model does not keep the original one. */
const DEFAULT_VIEWPORT = 'width=1200, height=1600';

const CONTAINER_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
  '  <rootfiles>\n' +
  '    <rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/>\n' +
  '  </rootfiles>\n' +
  '</container>\n';

interface WrittenResource {
  id: string;
  path: string;
  mediaType: string;
  data: Uint8Array;
}

interface WrittenChapter {
  id: string;
  path: string;
  ids: Set<string>;
}

/**
 * Writes a book as an EPUB 3 package. The same book and `modified` date always
 * give the same bytes.
 */
export function writeEpub(book: Book, opts: { modified?: Date } = {}): Uint8Array {
  const modified = opts.modified ?? new Date();
  const language = LANGUAGE_TAG.test(book.meta.language) ? book.meta.language : 'und';

  const chapters = new Map<string, WrittenChapter>();
  book.chapters.forEach((chapter, i) => {
    const id = `c${pad(i + 1)}`;
    chapters.set(chapter.href, {
      id,
      path: `EPUB/text/${id}.xhtml`,
      ids: elementIds(chapter.html),
    });
  });
  const written = [...chapters.values()];

  const resources = new Map<string, WrittenResource>();
  const taken = new Set<string>();
  for (const [key, resource] of book.resources) {
    const mediaType = normalizeMediaType(resource.mediaType);
    if (SKIPPED_TYPES.has(mediaType)) continue;
    const name = uniqueName(baseName(key), taken);
    const id = `r${pad(resources.size + 1)}`;
    resources.set(key, { id, path: `EPUB/res/${name}`, mediaType, data: resource.data });
  }

  /** Maps book keys found in `fromFile` to relative hrefs in the written package. */
  const mapperFor =
    (fromFile: string): RefMapper =>
    (ref) => {
      if (EXTERNAL.test(ref)) return ref;
      const hashAt = ref.indexOf('#');
      const key = hashAt >= 0 ? ref.slice(0, hashAt) : ref;
      const fragment = hashAt >= 0 ? ref.slice(hashAt + 1) : '';
      const chapter = chapters.get(key);
      if (chapter !== undefined) {
        const keep = fragment !== '' && chapter.ids.has(fragment);
        return (
          relativeHref(fromFile, chapter.path) + (keep ? `#${encodeURIComponent(fragment)}` : '')
        );
      }
      const resource = resources.get(key);
      if (resource === undefined) return null;
      return relativeHref(fromFile, resource.path) + (fragment !== '' ? `#${fragment}` : '');
    };

  const files: Zippable = {};
  const stored = { level: 0 as const, mtime: modified };
  const deflated = { level: 6 as const, mtime: modified };
  files['mimetype'] = [new TextEncoder().encode('application/epub+zip'), stored];
  files['META-INF/container.xml'] = [encode(CONTAINER_XML), deflated];

  const contentProperties = new Map<string, string>();
  book.chapters.forEach((chapter, i) => {
    const target = written[i]!;
    const xhtml = chapterDocument(
      book,
      chapter,
      target.path,
      language,
      mapperFor(target.path),
      resources,
    );
    const properties = contentDocumentProperties(xhtml);
    if (properties !== '') contentProperties.set(target.id, properties);
    files[target.path] = [encode(xhtml), deflated];
  });

  files['EPUB/nav.xhtml'] = [encode(navDocument(book, written, language)), deflated];

  for (const resource of resources.values()) {
    let data = resource.data;
    if (resource.mediaType === 'text/css') {
      data = encode(writtenCss(new TextDecoder().decode(data), mapperFor(resource.path)));
    }
    files[resource.path] = [data, STORED.test(resource.mediaType) ? stored : deflated];
  }

  files['EPUB/content.opf'] = [
    encode(packageDocument(book, language, modified, written, resources, contentProperties)),
    deflated,
  ];

  return zipSync(files);
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function normalizeMediaType(mediaType: string): string {
  const type = mediaType.trim().toLowerCase();
  return MEDIA_TYPE_FIXES[type] ?? type;
}

function baseName(key: string): string {
  const name = key.slice(key.lastIndexOf('/') + 1).replace(/[^A-Za-z0-9._-]/g, '-');
  return name.replace(/^\.+/, '') || 'file';
}

/** De-duplicates case-insensitively, since many zip consumers ignore case. */
function uniqueName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}-${n}${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

function elementIds(html: string): Set<string> {
  const template = document.createElement('template');
  template.innerHTML = html;
  return new Set([...template.content.querySelectorAll('[id]')].map((e) => e.id));
}

const BLOCKED_IMPORT = /@import\s+url\("about:invalid"\)[^;]*;?/gi;
const BLOCKED_DECLARATION = /[-\w]+\s*:[^;{}]*url\("about:invalid"\)[^;{}]*;?/gi;

/** Maps a stylesheet's urls and drops the declarations whose url the package cannot hold. */
function writtenCss(css: string, map: RefMapper): string {
  return mapCssUrls(css, map).replace(BLOCKED_IMPORT, '').replace(BLOCKED_DECLARATION, '');
}

/**
 * Makes a mapped chapter body valid EPUB content. Remote files are dropped
 * from everything but links: EPUB only allows remote audio, video and fonts,
 * and a reading system offline cannot show them anyway. An image left without
 * a source becomes its alt text, since EPUB requires img to have one.
 */
function writtenBody(html: string, map: RefMapper): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const original of template.content.querySelectorAll('*')) {
    const element = toHtml5(original);
    if (element === null) continue;
    const tag = element.localName;
    if (tag !== 'a' && tag !== 'area') {
      for (const name of ['src', 'poster', 'href', 'xlink:href']) {
        const value = element.getAttribute(name);
        if (value !== null && /^\s*https?:/i.test(value)) element.removeAttribute(name);
      }
      const srcset = element.getAttribute('srcset');
      if (srcset !== null && /https?:/i.test(srcset)) element.removeAttribute('srcset');
    }
    const style = element.getAttribute('style');
    if (style !== null) {
      const css = writtenCss(style, map).trim();
      if (css === '') element.removeAttribute('style');
      else element.setAttribute('style', css);
    }
    if (tag === 'img' && !element.hasAttribute('src')) {
      element.replaceWith(element.getAttribute('alt') ?? '');
    } else if (
      tag === 'source' &&
      !element.hasAttribute('src') &&
      !element.hasAttribute('srcset')
    ) {
      element.remove();
    }
  }
  return template.innerHTML;
}

function htmlStart(language: string, title: string, head: string, prefix = ''): string {
  const lang = escapeXml(language);
  const declared = prefix === '' ? '' : ` epub:prefix="${prefix}"`;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="${OPS_NS}"${declared} lang="${lang}" xml:lang="${lang}">\n` +
    `<head>\n<meta charset="utf-8"/>\n<title>${escapeXml(title)}</title>\n${head}</head>\n`
  );
}

function chapterDocument(
  book: Book,
  chapter: Chapter,
  path: string,
  language: string,
  map: RefMapper,
  resources: Map<string, WrittenResource>,
): string {
  let head = '';
  if (book.meta.layout === 'pre-paginated')
    head += `<meta name="viewport" content="${DEFAULT_VIEWPORT}"/>\n`;
  for (const key of chapter.stylesheets) {
    const resource = resources.get(key);
    if (resource?.mediaType !== 'text/css') continue;
    head += `<link rel="stylesheet" type="text/css" href="${escapeXml(relativeHref(path, resource.path))}"/>\n`;
  }
  const inlineCss = writtenCss(chapter.inlineCss, map);
  if (inlineCss.trim() !== '') head += `<style>${escapeXml(inlineCss)}</style>\n`;
  const title = chapter.title || book.meta.title || 'Untitled';
  const body = htmlToXhtml(writtenBody(mapHtmlRefs(chapter.html, map), map));
  const prefix = /epub:type="[^"]*\bz3998:/.test(body) ? Z3998_PREFIX : '';
  return `${htmlStart(language, title, head, prefix)}<body>${body}</body>\n</html>\n`;
}

function contentDocumentProperties(xhtml: string): string {
  const properties: string[] = [];
  if (/<math[\s>/]/.test(xhtml)) properties.push('mathml');
  if (/<script[\s>/]/.test(xhtml)) properties.push('scripted');
  if (/<svg[\s>/]/.test(xhtml)) properties.push('svg');
  return properties.join(' ');
}

function navDocument(book: Book, chapters: WrittenChapter[], language: string): string {
  const entries: TocEntry[] =
    book.toc.length > 0
      ? book.toc
      : book.chapters.map((_, chapter) => ({ label: '', chapter, children: [] }));
  const list = (items: TocEntry[]): string => {
    const lis = items
      .filter((entry) => chapters[entry.chapter] !== undefined)
      .map((entry) => {
        const target = chapters[entry.chapter]!;
        const keep = entry.fragment !== undefined && target.ids.has(entry.fragment);
        const href =
          relativeHref('EPUB/nav.xhtml', target.path) +
          (keep ? `#${encodeURIComponent(entry.fragment!)}` : '');
        const label =
          entry.label.trim() || book.chapters[entry.chapter]?.title?.trim() || 'Untitled';
        const children = list(entry.children);
        return `<li><a href="${escapeXml(href)}">${escapeXml(label)}</a>${children}</li>`;
      });
    return lis.length > 0 ? `<ol>${lis.join('\n')}</ol>` : '';
  };
  const toc =
    list(entries) ||
    `<ol><li><a href="text/c001.xhtml">${escapeXml(book.meta.title || 'Untitled')}</a></li></ol>`;
  return (
    htmlStart(language, book.meta.title || 'Contents', '') +
    `<body>\n<nav epub:type="toc" id="toc">\n<h1>Contents</h1>\n${toc}\n</nav>\n</body>\n</html>\n`
  );
}

/** FNV-1a, enough to give a stable identifier to a book that has none. */
function fallbackIdentifier(book: Book): string {
  let hash = 0x811c9dc5;
  for (const char of `${book.meta.title}\u0000${book.meta.authors.join('\u0000')}`) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `urn:copista:${hash.toString(16).padStart(8, '0')}`;
}

function packageDocument(
  book: Book,
  language: string,
  modified: Date,
  chapters: WrittenChapter[],
  resources: Map<string, WrittenResource>,
  contentProperties: Map<string, string>,
): string {
  const relative = (path: string) => escapeXml(relativeHref('EPUB/content.opf', path));
  const identifier = book.meta.identifier.trim() || fallbackIdentifier(book);
  const cover = book.cover !== undefined ? resources.get(book.cover) : undefined;
  const coverImage = cover?.mediaType.startsWith('image/') ? cover : undefined;

  const metadata = [
    `<dc:identifier id="uid">${escapeXml(identifier)}</dc:identifier>`,
    `<dc:title>${escapeXml(book.meta.title.trim() || 'Untitled')}</dc:title>`,
    ...book.meta.authors.map((author) => `<dc:creator>${escapeXml(author)}</dc:creator>`),
    `<dc:language>${escapeXml(language)}</dc:language>`,
    `<meta property="dcterms:modified">${modified.toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>`,
  ];
  if (book.meta.layout === 'pre-paginated') {
    metadata.push('<meta property="rendition:layout">pre-paginated</meta>');
  }
  if (coverImage !== undefined) metadata.push(`<meta name="cover" content="${coverImage.id}"/>`);

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    ...chapters.map((chapter) => {
      const properties = contentProperties.get(chapter.id);
      const attr = properties !== undefined ? ` properties="${properties}"` : '';
      return `<item id="${chapter.id}" href="${relative(chapter.path)}" media-type="application/xhtml+xml"${attr}/>`;
    }),
    ...[...resources.values()].map((resource) => {
      const attr = resource === coverImage ? ' properties="cover-image"' : '';
      return `<item id="${resource.id}" href="${relative(resource.path)}" media-type="${escapeXml(resource.mediaType)}"${attr}/>`;
    }),
  ];
  const spine = chapters.map((chapter) => `<itemref idref="${chapter.id}"/>`);

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${escapeXml(language)}">\n` +
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n${metadata.join('\n')}\n</metadata>\n` +
    `<manifest>\n${manifest.join('\n')}\n</manifest>\n` +
    `<spine>\n${spine.join('\n')}\n</spine>\n` +
    '</package>\n'
  );
}
