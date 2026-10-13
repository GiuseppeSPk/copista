import mammoth from 'mammoth';
import { openZip, readText, type Zip } from '../epub/zip';
import { CopistaError, MalformedBookError } from '../errors';
import type { Book, Resource } from '../model/book';
import { bookFromSections, IMAGE_EXTENSIONS, splitByHeading } from './build';

const DC = 'http://purl.org/dc/elements/1.1/';
const NOT_WORD = 'This file is not a Word document (.docx).';

/**
 * Added to mammoth's own map, which drops quotation, title and underlining styles and
 * flattens lists nested by style alone (List Bullet 2 with no numbering of its own).
 */
const STYLE_MAP = [
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Title'] => p.title:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  "p[style-name='List Bullet 2'] => ul|ol > li > ul > li:fresh",
  "p[style-name='List Number 2'] => ul|ol > li > ol > li:fresh",
  "p[style-name='List Bullet 3'] => ul|ol > li > ul|ol > li > ul > li:fresh",
  "p[style-name='List Number 3'] => ul|ol > li > ul|ol > li > ol > li:fresh",
  'u => u',
];

/** Title, author and language from docProps/core.xml; empty when absent. */
function coreProperties(zip: Zip): { title: string; author: string; language: string } {
  const xml = readText(zip, 'docProps/core.xml');
  const doc = xml === undefined ? null : new DOMParser().parseFromString(xml, 'application/xml');
  const field = (name: string): string =>
    (doc?.getElementsByTagNameNS(DC, name)[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { title: field('title'), author: field('creator'), language: field('language') };
}

/** The text of the first paragraph set in Word's Title style. */
function titleParagraph(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.querySelector('p.title')?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function titleFromFileName(fileName: string | undefined): string {
  return (fileName ?? '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]*$/, '')
    .trim();
}

/**
 * Converts a Word document to a book, split at its Heading 1 paragraphs (or
 * Heading 2 when it has none). Images the EPUB format supports become
 * resources; the others (EMF, WMF, TIFF…) are dropped. The title falls back
 * to the paragraph in Word's Title style, the file name, then "Untitled"; the
 * author to "Unknown".
 */
export async function fromDocx(data: Uint8Array, opts: { fileName?: string } = {}): Promise<Book> {
  let zip: Zip;
  try {
    zip = openZip(data);
  } catch {
    throw new MalformedBookError(NOT_WORD);
  }
  if (!zip.has('word/document.xml')) throw new MalformedBookError(NOT_WORD);

  const resources = new Map<string, Resource>();
  const convertImage = mammoth.images.imgElement(async (image) => {
    const mediaType = (image.contentType ?? '').toLowerCase();
    const extension = IMAGE_EXTENSIONS[mediaType];
    if (extension === undefined) return { src: '' };
    const href = `images/img${String(resources.size + 1).padStart(3, '0')}.${extension}`;
    resources.set(href, {
      href,
      mediaType,
      data: new Uint8Array(await image.readAsArrayBuffer()),
    });
    return { src: href };
  });

  // The browser build of mammoth reads `arrayBuffer`, the Node build `buffer`.
  const bytes = data.slice().buffer;
  const input = { arrayBuffer: bytes, buffer: bytes } as unknown as { arrayBuffer: ArrayBuffer };
  let html: string;
  try {
    ({ value: html } = await mammoth.convertToHtml(input, {
      convertImage,
      styleMap: STYLE_MAP,
      externalFileAccess: false,
    }));
    // Word raises a note mark and mammoth raises it again.
    html = html.replace(/<sup><sup>(<a [^>]*>[^<]*<\/a>)<\/sup><\/sup>/g, '<sup>$1</sup>');
  } catch (error) {
    if (error instanceof CopistaError) throw error;
    throw new MalformedBookError('This Word document is damaged and cannot be read.');
  }

  const core = coreProperties(zip);
  return bookFromSections(
    splitByHeading(html),
    {
      title: core.title || titleParagraph(html) || titleFromFileName(opts.fileName) || 'Untitled',
      author: core.author || 'Unknown',
      language: core.language,
    },
    resources,
  );
}
