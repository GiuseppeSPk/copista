/**
 * Hand-written EPUB parts, written from the EPUB 3.3 and OCF 3.3
 * specifications. Fixtures never go through the engine's own writer.
 */
import { buildZip, type ZipFile } from './zip-builder';

export const XHTML_11_DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">';

export interface XhtmlOptions {
  /** Stylesheet hrefs, relative to the chapter. */
  css?: string[];
  /** Extra markup for <head>. */
  head?: string;
  doctype?: string;
}

export function xhtml(title: string, body: string, options: XhtmlOptions = {}): string {
  const links = (options.css ?? [])
    .map((href) => `<link rel="stylesheet" type="text/css" href="${href}"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    (options.doctype ?? '<!DOCTYPE html>') +
    '\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    `<head><meta charset="UTF-8"/><title>${title}</title>${links}${options.head ?? ''}</head>` +
    `<body>${body}</body></html>\n`
  );
}

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
}

export interface MetadataOptions {
  title?: string;
  creators?: string[];
  language?: string;
  identifier?: string;
  /** Extra markup inside <metadata>. */
  extra?: string;
  version?: '3.0' | '2.0';
}

export function metadata(options: MetadataOptions): string {
  const parts = [
    `<dc:identifier id="uid">${options.identifier ?? 'urn:uuid:00000000-0000-4000-8000-000000000000'}</dc:identifier>`,
  ];
  if (options.title !== undefined) parts.push(`<dc:title>${options.title}</dc:title>`);
  for (const creator of options.creators ?? []) parts.push(`<dc:creator>${creator}</dc:creator>`);
  parts.push(`<dc:language>${options.language ?? 'en'}</dc:language>`);
  if ((options.version ?? '3.0') === '3.0') {
    parts.push('<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>');
  }
  if (options.extra) parts.push(options.extra);
  return parts.join('');
}

export interface OpfOptions extends MetadataOptions {
  items: ManifestItem[];
  /** Manifest ids, in reading order. */
  spine: string[];
  /** Manifest id of the NCX, for the spine's toc attribute. */
  ncx?: string;
}

export function opf(options: OpfOptions): string {
  const version = options.version ?? '3.0';
  const items = options.items
    .map(
      (item) =>
        `<item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"` +
        (item.properties ? ` properties="${item.properties}"` : '') +
        '/>',
    )
    .join('');
  const spine = options.spine.map((id) => `<itemref idref="${id}"/>`).join('');
  const toc = options.ncx ? ` toc="${options.ncx}"` : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="uid">` +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">' +
    metadata(options) +
    `</metadata><manifest>${items}</manifest><spine${toc}>${spine}</spine></package>\n`
  );
}

export interface TocPoint {
  label: string;
  href: string;
  children?: TocPoint[];
}

function navList(points: TocPoint[]): string {
  const items = points
    .map(
      (p) =>
        `<li><a href="${p.href}">${p.label}</a>` +
        (p.children?.length ? navList(p.children) : '') +
        '</li>',
    )
    .join('');
  return `<ol>${items}</ol>`;
}

export function nav(points: TocPoint[]): string {
  return xhtml(
    'Contents',
    `<nav epub:type="toc" id="toc"><h1>Contents</h1>${navList(points)}</nav>`,
  );
}

export function ncx(
  points: TocPoint[],
  identifier = 'urn:uuid:00000000-0000-4000-8000-000000000000',
) {
  let order = 0;
  const navPoints = (list: TocPoint[]): string =>
    list
      .map((p) => {
        order++;
        return (
          `<navPoint id="np${order}" playOrder="${order}">` +
          `<navLabel><text>${p.label}</text></navLabel><content src="${p.href}"/>` +
          navPoints(p.children ?? []) +
          '</navPoint>'
        );
      })
      .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    `<head><meta name="dtb:uid" content="${identifier}"/></head>` +
    '<docTitle><text>Contents</text></docTitle>' +
    `<navMap>${navPoints(points)}</navMap></ncx>\n`
  );
}

export function container(opfPath = 'OEBPS/content.opf'): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    `<rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles>` +
    '</container>\n'
  );
}

/** An OCF encryption.xml listing each file with the given algorithm. */
export function encryption(entries: Array<{ uri: string; algorithm: string }>): string {
  const data = entries
    .map(
      (e) =>
        '<enc:EncryptedData>' +
        `<enc:EncryptionMethod Algorithm="${e.algorithm}"/>` +
        `<enc:CipherData><enc:CipherReference URI="${e.uri}"/></enc:CipherData>` +
        '</enc:EncryptedData>',
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" ' +
    'xmlns:enc="http://www.w3.org/2001/04/xmlenc#">' +
    data +
    '</encryption>\n'
  );
}

export interface EpubZipOptions {
  /** Path of the package document for container.xml; false leaves container.xml out. */
  container?: string | false;
  /** Leave out the mimetype file. */
  noMimetype?: boolean;
}

/** Zips an EPUB: mimetype first and stored, then container.xml, then `files` in order. */
export function epubZip(
  files: Record<string, string | Uint8Array>,
  options: EpubZipOptions = {},
): Uint8Array {
  const entries: ZipFile[] = [];
  if (!options.noMimetype) {
    entries.push({ name: 'mimetype', data: 'application/epub+zip', store: true });
  }
  if (options.container !== false) {
    entries.push({ name: 'META-INF/container.xml', data: container(options.container) });
  }
  for (const [name, data] of Object.entries(files)) {
    entries.push({ name, data, store: data instanceof Uint8Array && data.length > 1_000_000 });
  }
  return buildZip(entries);
}
