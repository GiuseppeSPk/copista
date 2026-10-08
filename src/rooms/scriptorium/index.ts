import type { NewBookMeta } from '../../core/convert/build';
import { decodeText } from '../../core/convert/decode';
import { detectFormat, type InputFormat } from '../../core/convert/detect';
import { fromDocx } from '../../core/convert/from-docx';
import { fromMarkdown, parseFrontMatter } from '../../core/convert/from-md';
import { fromTxt } from '../../core/convert/from-txt';
import { toDocx } from '../../core/convert/to-docx';
import { toHtml } from '../../core/convert/to-html';
import { toMarkdown } from '../../core/convert/to-md';
import { toText } from '../../core/convert/to-text';
import { readEpub } from '../../core/epub/read';
import { writeEpub } from '../../core/epub/write';
import type { Book } from '../../core/model/book';

export type OutputFormat = 'epub' | 'docx' | 'md' | 'txt' | 'html' | 'pdf';
export type ConvertOutput =
  { kind: 'file'; blob: Blob; fileName: string } | { kind: 'print'; html: string };

const OUTPUT_FORMATS: OutputFormat[] = ['epub', 'docx', 'md', 'txt', 'html', 'pdf'];

const MIME_TYPES: Record<Exclude<OutputFormat, 'pdf'>, string> = {
  epub: 'application/epub+zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  html: 'text/html;charset=utf-8',
};

const UNKNOWN_AUTHOR = 'Unknown';
const MAX_NAME_LENGTH = 100;

async function bytesOf(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function hasFrontMatterTitle(data: Uint8Array): boolean {
  return Boolean(parseFrontMatter(decodeText(data)).fields['title']);
}

/** The file name without its last extension, for books that carry no title. */
function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, '').trim() || 'Untitled';
}

/**
 * Tells what a file is, which formats it can become, and whether the user
 * should be asked for a title and author (plain text, and Markdown without a
 * front-matter title). Throws UnsupportedFormatError for anything else.
 */
export async function inspect(
  file: File,
): Promise<{ format: InputFormat; needsMeta: boolean; targets: OutputFormat[] }> {
  const data = await bytesOf(file);
  const format = detectFormat(data, file.name);
  const needsMeta = format === 'txt' || (format === 'md' && !hasFrontMatterTitle(data));
  return { format, needsMeta, targets: OUTPUT_FORMATS.filter((target) => target !== format) };
}

/** Reads any supported file as a book. Metadata only applies to text and Markdown. */
async function toBook(file: File, meta: Partial<NewBookMeta>): Promise<Book> {
  const data = await bytesOf(file);
  switch (detectFormat(data, file.name)) {
    case 'epub':
      return readEpub(data, { fileName: file.name });
    case 'docx':
      return fromDocx(data, { fileName: file.name });
    case 'md':
      return fromMarkdown(data, {
        ...meta,
        title: meta.title || (hasFrontMatterTitle(data) ? undefined : baseName(file.name)),
      });
    case 'txt':
      return fromTxt(data, {
        ...meta,
        title: meta.title || baseName(file.name),
        author: meta.author || UNKNOWN_AUTHOR,
      });
  }
}

/** Converts a file to another format. Missing metadata never stops a conversion. */
export async function convert(
  file: File,
  target: OutputFormat,
  meta: Partial<NewBookMeta> = {},
): Promise<ConvertOutput> {
  return convertBook(await toBook(file, meta), target);
}

/** Writes a book in the target format; PDF comes back as a page to print. */
export async function convertBook(book: Book, target: OutputFormat): Promise<ConvertOutput> {
  if (target === 'pdf') return { kind: 'print', html: toHtml(book, { print: true }) };
  const body = {
    epub: () => writeEpub(book),
    docx: () => toDocx(book),
    md: () => toMarkdown(book),
    txt: () => toText(book),
    html: () => toHtml(book),
  }[target]();
  return {
    kind: 'file',
    blob: new Blob([body as BlobPart], { type: MIME_TYPES[target] }),
    fileName: outputFileName(book.meta.title, target),
  };
}

/**
 * A file name every common file system accepts, from a book title. Line
 * breaks and tabs count as spaces, not as control characters.
 */
export function outputFileName(title: string, target: Exclude<OutputFormat, 'pdf'>): string {
  const name = title
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return `${name || 'book'}.${target}`;
}
