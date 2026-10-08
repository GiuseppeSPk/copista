import { DrmProtectedError, MalformedBookError, NotAnEpubError } from '../errors';
import type { Book, BookWarning, Chapter, Resource, TocEntry } from '../model/book';
import { resolveHref } from '../paths';
import { mapCssUrls, mapHtmlRefs, type RefMapper } from '../refs';
import { sanitizeCss, sanitizeHtml } from '../sanitize';
import { detectDrm } from './drm';
import { parsePackage, type ManifestItem, type PackageDocument } from './package';
import { firstHeading, parseNav, parseNcx, titlesFromToc, tocFromHeadings } from './toc';
import { bodyHtml, parseXhtml, parseXml, XHTML_NS } from './xml';
import { decodeText, openZip, readText, type Zip } from './zip';

const CHAPTER_TYPES = new Set(['application/xhtml+xml', 'text/html']);
/** Chapters converted between two yields to the event loop. */
const CHAPTERS_PER_YIELD = 25;

/** An entry by book key; archives made on macOS may store names in NFD. */
function lookup(zip: Zip, key: string): Uint8Array | undefined {
  return zip.get(key) ?? zip.get(key.normalize('NFC')) ?? zip.get(key.normalize('NFD'));
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** The zip path of the package document. */
function findPackage(zip: Zip): string {
  const container = readText(zip, 'META-INF/container.xml');
  const doc = container === undefined ? null : parseXml(container);
  if (doc !== null) {
    const rootfiles = [...doc.getElementsByTagNameNS('*', 'rootfile')];
    rootfiles.sort(
      (a, b) =>
        Number(b.getAttribute('media-type') === 'application/oebps-package+xml') -
        Number(a.getAttribute('media-type') === 'application/oebps-package+xml'),
    );
    for (const rootfile of rootfiles) {
      const raw = (rootfile.getAttribute('full-path') ?? '').replace(/^\/+/, '');
      for (const path of [raw, decodePath(raw)]) {
        if (path !== '' && lookup(zip, path) !== undefined) return path;
      }
    }
  }
  const opfs = [...zip.keys()].filter((path) => path.toLowerCase().endsWith('.opf'));
  if (opfs.length === 1) return opfs[0]!;
  throw new NotAnEpubError('This file is not an EPUB (it has no package document).');
}

/** Maps references in a file to book keys; external references are left for the sanitizers. */
function keyMapper(base: string): RefMapper {
  return (ref) => {
    const resolved = resolveHref(base, ref);
    if (resolved === null) return ref;
    return resolved.fragment === undefined
      ? resolved.path
      : `${resolved.path}#${resolved.fragment}`;
  };
}

function readResource(item: ManifestItem, data: Uint8Array): Resource {
  if (item.mediaType !== 'text/css') return { href: item.href, mediaType: item.mediaType, data };
  const css = sanitizeCss(mapCssUrls(decodeText(data), keyMapper(item.href)));
  return { href: item.href, mediaType: item.mediaType, data: new TextEncoder().encode(css) };
}

function readChapter(
  item: ManifestItem,
  data: Uint8Array,
  resources: Map<string, Resource>,
  warnings: Set<BookWarning>,
): Chapter {
  const { doc, fallback } = parseXhtml(decodeText(data));
  if (fallback) warnings.add('html-fallback');
  const map = keyMapper(item.href);

  const stylesheets: string[] = [];
  for (const link of doc.getElementsByTagNameNS(XHTML_NS, 'link')) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('stylesheet') || rel.includes('alternate')) continue;
    const resolved = resolveHref(item.href, link.getAttribute('href') ?? '');
    if (resolved === null || !resources.has(resolved.path)) continue;
    if (!stylesheets.includes(resolved.path)) stylesheets.push(resolved.path);
  }

  const inlineCss = [...doc.getElementsByTagNameNS(XHTML_NS, 'style')]
    .map((style) => sanitizeCss(mapCssUrls(style.textContent ?? '', map)))
    .filter((css) => css.trim() !== '')
    .join('\n');

  return {
    id: item.id,
    href: item.href,
    html: sanitizeHtml(mapHtmlRefs(bodyHtml(doc), map)),
    stylesheets,
    inlineCss,
  };
}

/** The nav, else the NCX, else a list built from headings (with a warning). */
function readToc(
  zip: Zip,
  pkg: PackageDocument,
  chapters: Chapter[],
  warnings: Set<BookWarning>,
): TocEntry[] {
  const chapterIndex = new Map(chapters.map((c, i) => [c.href, i]));
  const read = (href: string | undefined): string | undefined => {
    const bytes = href === undefined ? undefined : lookup(zip, href);
    return bytes === undefined ? undefined : decodeText(bytes);
  };
  const nav = read(pkg.navHref);
  const fromNav =
    nav === undefined || pkg.navHref === undefined ? [] : parseNav(nav, pkg.navHref, chapterIndex);
  if (fromNav.length > 0) return fromNav;
  const ncx = read(pkg.ncxHref);
  const fromNcx =
    ncx === undefined || pkg.ncxHref === undefined ? [] : parseNcx(ncx, pkg.ncxHref, chapterIndex);
  if (fromNcx.length > 0) return fromNcx;
  warnings.add('toc-generated');
  return tocFromHeadings(chapters);
}

function titleFromFileName(fileName: string | undefined): string {
  const title = (fileName ?? '').replace(/\.[^./\\]*$/, '').trim();
  return title !== '' ? title : 'Untitled';
}

/** Reads an EPUB 2 or EPUB 3 file into a Book. */
export async function readEpub(data: Uint8Array, opts: { fileName?: string } = {}): Promise<Book> {
  const zip = openZip(data);
  const drm = detectDrm(zip);
  if (drm.protected) throw new DrmProtectedError(drm.scheme);
  const obfuscated = new Set(drm.obfuscatedFonts);

  const opfPath = findPackage(zip);
  const opfData = lookup(zip, opfPath);
  const pkg = parsePackage(opfData === undefined ? '' : decodeText(opfData), opfPath);
  const warnings = new Set<BookWarning>();

  const chapterItems: ManifestItem[] = [];
  const chapterIds = new Set<string>();
  for (const idref of pkg.spine) {
    const item = pkg.manifest.get(idref);
    if (item === undefined) {
      warnings.add('missing-resource');
      continue;
    }
    if (!CHAPTER_TYPES.has(item.mediaType) || chapterIds.has(idref)) continue;
    chapterIds.add(idref);
    chapterItems.push(item);
  }

  const resources = new Map<string, Resource>();
  for (const item of pkg.manifest.values()) {
    if (chapterIds.has(item.id) || resources.has(item.href)) continue;
    if (obfuscated.has(item.href)) {
      warnings.add('obfuscated-fonts-ignored');
      continue;
    }
    const bytes = lookup(zip, item.href);
    if (bytes === undefined) {
      warnings.add('missing-resource');
      continue;
    }
    resources.set(item.href, readResource(item, bytes));
  }

  const chapters: Chapter[] = [];
  for (const item of chapterItems) {
    const bytes = lookup(zip, item.href);
    if (bytes === undefined) {
      warnings.add('missing-resource');
      continue;
    }
    chapters.push(readChapter(item, bytes, resources, warnings));
    if (chapters.length % CHAPTERS_PER_YIELD === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (chapters.length === 0) throw new MalformedBookError('This book has no readable chapters.');

  const meta = { ...pkg.meta };
  if (meta.title === '') meta.title = titleFromFileName(opts.fileName);
  if (meta.layout === 'pre-paginated') warnings.add('fixed-layout');

  const toc = readToc(zip, pkg, chapters, warnings);
  const titles = titlesFromToc(toc);
  chapters.forEach((chapter, i) => {
    const title = titles.get(i) ?? firstHeading(chapter.html);
    if (title !== undefined) chapter.title = title;
  });

  const book: Book = { meta, chapters, toc, resources, warnings: [...warnings] };
  const cover = pkg.coverCandidates.find((href) => resources.has(href));
  if (cover !== undefined) book.cover = cover;
  return book;
}
