import { unzipSync } from 'fflate';
import { UnsupportedFormatError } from '../errors';

export type InputFormat = 'epub' | 'docx' | 'md' | 'txt';

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

function startsWith(data: Uint8Array, bytes: readonly number[]): boolean {
  return bytes.every((byte, i) => data[i] === byte);
}

function isZip(data: Uint8Array): boolean {
  return data[0] === 0x50 && data[1] === 0x4b && (data[2] === 3 || data[2] === 5);
}

/** Lists a zip's entries and reads only its `mimetype` entry. */
function zipFormat(data: Uint8Array): InputFormat {
  const names = new Set<string>();
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (file) => {
        names.add(file.name);
        return file.name === 'mimetype';
      },
    });
  } catch {
    throw new UnsupportedFormatError('zip', 'This zip archive is damaged and cannot be opened.');
  }
  const mimetype = entries['mimetype'];
  const declared = mimetype !== undefined && new TextDecoder().decode(mimetype).trim();
  if (declared === 'application/epub+zip' || names.has('META-INF/container.xml')) return 'epub';
  if (names.has('word/document.xml')) return 'docx';
  throw new UnsupportedFormatError(
    'zip',
    'This zip archive is neither an EPUB book nor a Word document.',
  );
}

function looksLikeText(data: Uint8Array): boolean {
  if (startsWith(data, [0xff, 0xfe]) || startsWith(data, [0xfe, 0xff])) return true;
  return !data.subarray(0, 1024).includes(0);
}

/**
 * Tells which converter a file needs, from its contents first and its name
 * only to tell Markdown from plain text. Throws UnsupportedFormatError naming
 * the format ('doc', 'pdf', 'zip' or 'unknown') of anything else.
 */
export function detectFormat(data: Uint8Array, fileName: string): InputFormat {
  if (isZip(data)) return zipFormat(data);
  if (startsWith(data, OLE_SIGNATURE)) {
    throw new UnsupportedFormatError(
      'doc',
      'Old Word documents (.doc) are not supported. Save the file as .docx and try again.',
    );
  }
  if (startsWith(data, [0x25, 0x50, 0x44, 0x46])) {
    throw new UnsupportedFormatError('pdf', 'PDF files cannot be converted to EPUB.');
  }
  if (MARKDOWN_EXTENSION.test(fileName)) return 'md';
  if (looksLikeText(data)) return 'txt';
  throw new UnsupportedFormatError(
    'unknown',
    'This file is not a book or a document Copista can read.',
  );
}
