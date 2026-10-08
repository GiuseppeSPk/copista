// Writes every EPUB the engine produces to tests/fixtures/output/, for
// EPUBCheck. Readable EPUB fixtures are rewritten by writeEpub; later tasks
// add the outputs of their own converters to OUTPUTS.
//
//   npx tsx scripts/write-outputs.ts            fixtures only
//   npx tsx scripts/write-outputs.ts --corpus   also every downloaded corpus book
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import corpus from '../tests/corpus.json';
import { EPUB, type EpubFixture } from '../tests/fixtures/catalog';
import { READ_EXPECTATIONS } from '../tests/fixtures/expectations';
import { kebab } from '../tests/fixtures/names';

export const OUTPUT_DIR = join('tests', 'fixtures', 'output');
const CORPUS_DIR = join('tests', 'fixtures', 'corpus');
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

/** The engine needs a DOM; install jsdom's before any engine module loads. */
function installDom(): void {
  if (typeof globalThis.document !== 'undefined') return;
  const { window } = new JSDOM('');
  Object.assign(globalThis, {
    window,
    document: window.document,
    DOMParser: window.DOMParser,
    XMLSerializer: window.XMLSerializer,
    Node: window.Node,
    NodeFilter: window.NodeFilter,
    Element: window.Element,
    DocumentFragment: window.DocumentFragment,
  });
}

async function rewrite(data: Uint8Array, fileName: string): Promise<Uint8Array> {
  installDom();
  const { readEpub } = await import('../src/core/epub/read');
  const { writeEpub } = await import('../src/core/epub/write');
  return writeEpub(await readEpub(data, { fileName }), { modified: FIXED_DATE });
}

export const OUTPUTS: Array<{ name: string; make(): Promise<Uint8Array> }> = Object.entries(EPUB)
  .filter(([key]) => !('error' in READ_EXPECTATIONS[key as EpubFixture]))
  .map(([key, build]) => ({
    name: `rewrite-${kebab(key)}`,
    make: () => rewrite(build(), `${kebab(key)}.epub`),
  }));

function corpusOutputs(): Array<{ name: string; make(): Promise<Uint8Array> }> {
  return corpus
    .filter(({ id }) => existsSync(join(CORPUS_DIR, `${id}.epub`)))
    .map(({ id }) => ({
      name: `corpus-${id}`,
      make: () => rewrite(new Uint8Array(readFileSync(join(CORPUS_DIR, `${id}.epub`))), id),
    }));
}

/** Clears OUTPUT_DIR and writes every output; returns how many were written. */
export async function writeOutputs(withCorpus: boolean): Promise<number> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const file of readdirSync(OUTPUT_DIR)) rmSync(join(OUTPUT_DIR, file), { recursive: true });
  const outputs = withCorpus ? [...OUTPUTS, ...corpusOutputs()] : OUTPUTS;
  for (const output of outputs) {
    writeFileSync(join(OUTPUT_DIR, `${output.name}.epub`), await output.make());
  }
  return outputs.length;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const count = await writeOutputs(process.argv.includes('--corpus'));
  console.log(`Wrote ${count} EPUB files to ${OUTPUT_DIR}`);
}
