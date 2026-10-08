import { strToU8, zipSync, type Zippable } from 'fflate';

export interface ZipFile {
  name: string;
  data: string | Uint8Array;
  /** Store without compression. */
  store?: boolean;
}

/** A fixed file date, so the same fixture always has the same bytes and hash. */
const MTIME = new Date(2020, 0, 1);

/** Zips the files in the given order. */
export function buildZip(files: ZipFile[]): Uint8Array {
  const zippable: Zippable = {};
  for (const file of files) {
    const bytes = typeof file.data === 'string' ? strToU8(file.data) : file.data;
    zippable[file.name] = [bytes, { level: file.store ? 0 : 6, mtime: MTIME }];
  }
  return zipSync(zippable);
}
