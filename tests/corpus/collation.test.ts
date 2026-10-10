import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readEpub } from '../../src/core/epub/read';
import { convertBook, type OutputFormat } from '../../src/rooms/scriptorium';
import corpus from '../corpus.json';

const TARGETS: OutputFormat[] = ['epub', 'docx', 'md', 'txt', 'html'];

/**
 * jsdom holds each parsed document through a WeakRef, and V8 keeps the target of a WeakRef
 * alive until the event loop turns. A run of awaits that never yields keeps every book.
 */
const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve));

/** Every word of a real book should reach every copy; the parts are reported, not required. */
describe('collation of real books', () => {
  for (const entry of corpus) {
    it(
      entry.id,
      async () => {
        const data = new Uint8Array(readFileSync(`tests/fixtures/corpus/${entry.id}.epub`));
        const book = await readEpub(data);
        const report: string[] = [];
        for (const target of TARGETS) {
          await yieldToEventLoop();
          const { words, parts } = await (await convertBook(book, target)).check();
          const lost = (parts ?? [])
            .filter((p) => p.copy < p.original)
            .map((p) => `${p.part} ${p.copy}/${p.original}`);
          report.push(`${target}: words ${words.found}/${words.total} ${lost.join(', ')}`);
          expect(words.missing, `${entry.id} → ${target}`).toEqual([]);
        }
        console.log(`${entry.id}\n  ${report.join('\n  ')}`);
      },
      300_000,
    );
  }
});
