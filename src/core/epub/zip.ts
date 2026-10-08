import { unzipSync } from 'fflate';
import { MalformedBookError, NotAnEpubError } from '../errors';

/** The entries of a zip archive, keyed by their path as stored in the archive. */
export type Zip = Map<string, Uint8Array>;

// Far above any real book, low enough that a forged archive cannot exhaust memory.
const MAX_ENTRY_BYTES = 200 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

/**
 * Unpacks a whole archive. Throws NotAnEpubError if the data is not a zip, and
 * MalformedBookError, before unpacking anything, if its headers announce more
 * than the size limits.
 */
export function openZip(data: Uint8Array): Zip {
  let entries: Record<string, Uint8Array>;
  let total = 0;
  try {
    entries = unzipSync(data, {
      filter: (file) => {
        total += file.originalSize;
        if (file.originalSize > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) {
          throw new MalformedBookError('This file is too large to open once unpacked.');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof MalformedBookError) throw error;
    throw new NotAnEpubError('This file is not an EPUB (it is not a zip archive).');
  }
  return new Map(Object.entries(entries).filter(([path]) => !path.endsWith('/')));
}

/** Decodes an entry as text (UTF-8, or UTF-16 when it starts with a byte order mark). */
export function readText(zip: Zip, path: string): string | undefined {
  const data = zip.get(path);
  return data === undefined ? undefined : decodeText(data);
}

/** Decodes bytes as UTF-8, or UTF-16 when they start with a byte order mark. */
export function decodeText(data: Uint8Array): string {
  const encoding =
    data[0] === 0xff && data[1] === 0xfe
      ? 'utf-16le'
      : data[0] === 0xfe && data[1] === 0xff
        ? 'utf-16be'
        : 'utf-8';
  return new TextDecoder(encoding).decode(data);
}
