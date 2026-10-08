import { MalformedBookError } from '../errors';
import type { BookMeta } from '../model/book';
import { resolveHref } from '../paths';
import { parseXml } from './xml';

const DC_NS = 'http://purl.org/dc/elements/1.1/';

export interface ManifestItem {
  id: string;
  /** Book key of the file. */
  href: string;
  /** Lower-cased media type. */
  mediaType: string;
  properties: string[];
}

export interface PackageDocument {
  /** Metadata; `title` is empty when the package has none. */
  meta: BookMeta;
  /** Manifest items by id, in document order. */
  manifest: Map<string, ManifestItem>;
  /** Spine idrefs, in reading order. */
  spine: string[];
  /** Book key of the EPUB 3 navigation document. */
  navHref?: string;
  /** Book key of the EPUB 2 NCX. */
  ncxHref?: string;
  /** Book keys that may be the cover image, most likely first. */
  coverCandidates: string[];
}

function collapse(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function byName(root: Document | Element, name: string): Element[] {
  return [...root.getElementsByTagNameNS('*', name)];
}

/** Dublin Core elements, falling back to any namespace for sloppy packages. */
function dc(doc: Document, name: string): string[] {
  const strict = [...doc.getElementsByTagNameNS(DC_NS, name)];
  const elements = strict.length > 0 ? strict : byName(doc, name);
  return elements.map((e) => collapse(e.textContent)).filter((text) => text !== '');
}

function readIdentifier(doc: Document): string {
  const uniqueId = doc.documentElement.getAttribute('unique-identifier');
  const identifiers = [...doc.getElementsByTagNameNS(DC_NS, 'identifier')];
  const named = identifiers.find((e) => uniqueId !== null && e.getAttribute('id') === uniqueId);
  const value = collapse((named ?? identifiers[0])?.textContent);
  return value !== '' ? value : `urn:uuid:${crypto.randomUUID()}`;
}

function readManifest(doc: Document, opfPath: string): Map<string, ManifestItem> {
  const manifest = new Map<string, ManifestItem>();
  for (const item of byName(doc, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id === null || href === null || manifest.has(id)) continue;
    const resolved = resolveHref(opfPath, href);
    if (resolved === null || resolved.path === '') continue;
    manifest.set(id, {
      id,
      href: resolved.path,
      mediaType: (item.getAttribute('media-type') ?? '').trim().toLowerCase(),
      properties: (item.getAttribute('properties') ?? '').split(/\s+/).filter((p) => p !== ''),
    });
  }
  return manifest;
}

function coverCandidates(
  doc: Document,
  manifest: Map<string, ManifestItem>,
  opfPath: string,
): string[] {
  const items = [...manifest.values()];
  const candidates = items.filter((i) => i.properties.includes('cover-image')).map((i) => i.href);
  for (const meta of byName(doc, 'meta')) {
    if (meta.getAttribute('name') !== 'cover') continue;
    const content = (meta.getAttribute('content') ?? '').trim();
    const href = manifest.get(content)?.href ?? resolveHref(opfPath, content)?.path;
    if (content !== '' && href !== undefined) candidates.push(href);
  }
  for (const item of items) {
    if (item.mediaType.startsWith('image/') && /cover/i.test(item.id + ' ' + item.href)) {
      candidates.push(item.href);
    }
  }
  return [...new Set(candidates)];
}

/** Reads the package document (OPF) found at `opfPath`. */
export function parsePackage(opfXml: string, opfPath: string): PackageDocument {
  const doc = parseXml(opfXml);
  if (doc === null) throw new MalformedBookError('The package document of this book is damaged.');

  const layout = byName(doc, 'meta').some(
    (m) =>
      m.getAttribute('property') === 'rendition:layout' &&
      collapse(m.textContent) === 'pre-paginated',
  );
  const meta: BookMeta = {
    title: dc(doc, 'title')[0] ?? '',
    authors: dc(doc, 'creator'),
    language: dc(doc, 'language')[0] ?? 'und',
    identifier: readIdentifier(doc),
    layout: layout ? 'pre-paginated' : 'reflowable',
  };

  const manifest = readManifest(doc, opfPath);
  const spineElement = byName(doc, 'spine')[0];
  const spine = byName(spineElement ?? doc, 'itemref')
    .map((ref) => ref.getAttribute('idref'))
    .filter((id): id is string => id !== null);

  const items = [...manifest.values()];
  const navHref = items.find((i) => i.properties.includes('nav'))?.href;
  const ncxId = spineElement?.getAttribute('toc');
  const ncxHref =
    (ncxId != null ? manifest.get(ncxId)?.href : undefined) ??
    items.find((i) => i.mediaType === 'application/x-dtbncx+xml')?.href;

  const result: PackageDocument = {
    meta,
    manifest,
    spine,
    coverCandidates: coverCandidates(doc, manifest, opfPath),
  };
  if (navHref !== undefined) result.navHref = navHref;
  if (ncxHref !== undefined) result.ncxHref = ncxHref;
  return result;
}
