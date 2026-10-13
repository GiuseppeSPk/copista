import { zipSync } from 'fflate';
import type { NewBookMeta } from '../../core/convert/build';
import type { Collation } from '../../core/convert/census';
import { decodeText } from '../../core/convert/decode';
import { detectFormat, type InputFormat } from '../../core/convert/detect';
import {
  fromMarkdown,
  parseFrontMatter,
  picturesNamed,
  type Picture,
} from '../../core/convert/from-md';
import { fromTxt } from '../../core/convert/from-txt';
import { toDocx } from '../../core/convert/to-docx';
import { toHtml } from '../../core/convert/to-html';
import { toMarkdown } from '../../core/convert/to-md';
import { toText } from '../../core/convert/to-text';
import { readEpub } from '../../core/epub/read';
import { writeEpub } from '../../core/epub/write';
import type { Book } from '../../core/model/book';
import { BookNotFoundError, getBook } from '../../storage/db';
import { collateCopy } from './collation';

export type OutputFormat = 'epub' | 'docx' | 'md' | 'txt' | 'html' | 'pdf';
/** A copy ready to save, and how to read it back against the book it came from. */
export interface PrintCopy {
  html: string;
  /** Reads the copy back and compares it with the book; run it after the copy is saved. */
  check: () => Promise<Collation>;
}

export type ConvertOutput = (
  | { kind: 'file'; blob: Blob; fileName: string }
  | {
      kind: 'print';
      title: string;
      html: string;
      /** The same pages without pictures, made once when first asked for. */
      withoutPictures: () => PrintCopy;
    }
) & {
  /** Reads the copy back and compares it with the book; run it after the copy is saved. */
  check: () => Promise<Collation>;
};

const OUTPUT_FORMATS: OutputFormat[] = ['epub', 'docx', 'md', 'txt', 'html', 'pdf'];

/** What a library book can become: it is already an EPUB. */
export const LIBRARY_TARGETS: OutputFormat[] = OUTPUT_FORMATS.filter((target) => target !== 'epub');

/** How many files can be converted together. */
export const BATCH_LIMIT = 20;

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

/** A picture a Markdown file can show, told by its name before anything is read. */
export function isPicture(file: File): boolean {
  return /\.(gif|jpe?g|png|svg|webp)$/i.test(file.name);
}

/**
 * Tells what a file is, which formats it can become, whether the user should
 * be asked for a title and author (plain text, and Markdown without a
 * front-matter title), and which pictures a Markdown file shows by name.
 * Throws UnsupportedFormatError for anything else.
 */
export async function inspect(file: File): Promise<{
  format: InputFormat;
  needsMeta: boolean;
  targets: OutputFormat[];
  pictures: string[];
}> {
  const data = await bytesOf(file);
  const format = detectFormat(data, file.name);
  const needsMeta = format === 'txt' || (format === 'md' && !hasFrontMatterTitle(data));
  return {
    format,
    needsMeta,
    targets: OUTPUT_FORMATS.filter((target) => target !== format),
    pictures: format === 'md' ? picturesNamed(data) : [],
  };
}

/**
 * Reads any supported file as a book. Metadata only applies to text and
 * Markdown, pictures only to Markdown.
 */
async function toBook(file: File, meta: Partial<NewBookMeta>, pictures: File[]): Promise<Book> {
  const data = await bytesOf(file);
  switch (detectFormat(data, file.name)) {
    case 'epub':
      return readEpub(data, { fileName: file.name });
    case 'docx': {
      // mammoth is most of the converter code, so it loads only when a .docx needs it.
      const { fromDocx } = await import('../../core/convert/from-docx');
      return fromDocx(data, { fileName: file.name });
    }
    case 'md':
      return fromMarkdown(
        data,
        {
          ...meta,
          title: meta.title || (hasFrontMatterTitle(data) ? undefined : baseName(file.name)),
        },
        await Promise.all(
          pictures.map(async (p): Promise<Picture> => ({ name: p.name, data: await bytesOf(p) })),
        ),
      );
    case 'txt':
      return fromTxt(data, {
        ...meta,
        title: meta.title || baseName(file.name),
        author: meta.author || UNKNOWN_AUTHOR,
      });
  }
}

/**
 * Converts a file to another format. Missing metadata never stops a
 * conversion; a Markdown file shows the pictures it names among those given.
 */
export async function convert(
  file: File,
  target: OutputFormat,
  meta: Partial<NewBookMeta> = {},
  pictures: File[] = [],
): Promise<ConvertOutput> {
  return convertBook(await toBook(file, meta, pictures), target);
}

/** Converts a book from the library, read from its stored EPUB. */
export async function convertLibraryBook(
  bookId: string,
  target: OutputFormat,
): Promise<ConvertOutput> {
  const rec = await getBook(bookId);
  if (!rec) throw new BookNotFoundError(bookId);
  return convertBook(await readEpub(new Uint8Array(await rec.fileBlob.arrayBuffer())), target);
}

function printCopy(book: Book, pictures: boolean): PrintCopy {
  const html = toHtml(book, { print: true, pictures });
  return { html, check: () => collateCopy(book, html, 'html') };
}

/** Writes a book in the target format; PDF comes back as pages to preview and print. */
export async function convertBook(book: Book, target: OutputFormat): Promise<ConvertOutput> {
  if (target === 'pdf') {
    let plain: PrintCopy | undefined;
    return {
      kind: 'print',
      title: book.meta.title,
      ...printCopy(book, true),
      withoutPictures: () => (plain ??= printCopy(book, false)),
    };
  }
  const body = {
    epub: () => writeEpub(book),
    docx: () => toDocx(book),
    md: () => toMarkdown(book),
    txt: () => toText(book),
    html: () => toHtml(book),
  }[target]();
  const blob = new Blob([body as BlobPart], { type: MIME_TYPES[target] });
  return {
    kind: 'file',
    blob,
    fileName: outputFileName(book.meta.title, target),
    check: async () => collateCopy(book, new Uint8Array(await blob.arrayBuffer()), target),
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

/**
 * The formats every chosen file can become. Several files never go to PDF,
 * which is printed one book at a time from its preview.
 */
export function commonTargets(lists: OutputFormat[][]): OutputFormat[] {
  if (lists.length === 1) return lists[0]!;
  return OUTPUT_FORMATS.filter(
    (target) => target !== 'pdf' && lists.length > 0 && lists.every((l) => l.includes(target)),
  );
}

/** One zip holding every copy; a name already taken gets a number, as in "Book (2).txt". */
export async function zipCopies(copies: { blob: Blob; fileName: string }[]): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  for (const { blob, fileName } of copies) {
    const dot = fileName.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [fileName.slice(0, dot), fileName.slice(dot)] : [fileName, ''];
    let name = fileName;
    for (let n = 2; name in files; n++) name = `${stem} (${n})${ext}`;
    files[name] = new Uint8Array(await blob.arrayBuffer());
  }
  return new Blob([zipSync(files) as BlobPart], { type: 'application/zip' });
}
