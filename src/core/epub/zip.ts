import { unzipSync } from 'fflate';
import { NotAnEpubError } from '../errors';

/** The entries of a zip archive, keyed by their path as stored in the archive. */
export type Zip = Map<string, Uint8Array>;

/** Unpacks a whole archive. Throws NotAnEpubError if the data is not a zip. */
export function openZip(data: Uint8Array): Zip {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch {
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
