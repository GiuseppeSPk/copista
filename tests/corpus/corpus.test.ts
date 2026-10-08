import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readEpub } from '../../src/core/epub/read';
import corpus from '../corpus.json';

/**
 * Counts the spine itemrefs that point at XHTML manifest items, using regexes
 * on the raw OPF so the count does not share code with the reader.
 */
function countXhtmlItemrefs(data: Uint8Array): number {
  const files = unzipSync(data);
  const container = strFromU8(files['META-INF/container.xml']!);
  const opfPath = /full-path\s*=\s*["']([^"']+)["']/.exec(container)![1]!;
  const opf = strFromU8(files[opfPath]!);
  const xhtmlIds = new Set<string>();
  for (const [item] of opf.matchAll(/<(?:\w+:)?item\b[^>]*>/g)) {
    const id = /\bid\s*=\s*["']([^"']+)["']/.exec(item)?.[1];
    const type = /\bmedia-type\s*=\s*["']([^"']+)["']/.exec(item)?.[1];
    if (id && type === 'application/xhtml+xml') xhtmlIds.add(id);
  }
  let count = 0;
  for (const [ref] of opf.matchAll(/<(?:\w+:)?itemref\b[^>]*>/g)) {
    const idref = /\bidref\s*=\s*["']([^"']+)["']/.exec(ref)?.[1];
    if (idref && xhtmlIds.has(idref)) count++;
  }
  return count;
}

describe('real-world corpus', () => {
  for (const entry of corpus) {
    it(
      entry.id,
      async () => {
        const data = new Uint8Array(readFileSync(`tests/fixtures/corpus/${entry.id}.epub`));
        const book = await readEpub(data);
        expect(book.meta.title.trim()).not.toBe('');
        expect(book.meta.authors.length).toBeGreaterThan(0);
        expect(book.toc.length).toBeGreaterThan(0);
        expect(book.chapters.length).toBe(countXhtmlItemrefs(data));
        expect(book.warnings).not.toContain('missing-resource');
        expect(book.chapters.every((c) => c.html.trim() !== '')).toBe(true);
      },
      30_000,
    );
  }
});
