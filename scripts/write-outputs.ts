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
import { DOCX, EPUB, type EpubFixture } from '../tests/fixtures/catalog';
import { READ_EXPECTATIONS } from '../tests/fixtures/expectations';
import { kebab } from '../tests/fixtures/names';
import { makePng } from '../tests/fixtures/png';
import type { Book } from '../src/core/model/book';

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

const SAMPLE_TXT =
  'PREFACE\n\nA note & a <tag>.\n\nCHAPTER I\n\nIt was a dark night.\nStill dark.\n\nII.\n\nMorning.';

function sampleMarkdown(): string {
  const png = `data:image/png;base64,${Buffer.from(makePng(4, 3)).toString('base64')}`;
  return [
    '---',
    'title: Markdown Sample',
    'author: Bo Sample',
    'language: it',
    '---',
    'Opening words.',
    '# One',
    'Hello *there*, [a link](https://example.org) and [a note](#two).',
    `![a dot](${png}) ![remote](https://e.invalid/p.png) ![local](missing.png)`,
    '# Two',
    '- a\n- b',
    '| x | y |\n|---|---|\n| 1 | 2 |',
    '```\ncode <here>\n```',
    '<script>alert(1)</script>',
  ].join('\n\n');
}

async function convert(
  run: (core: {
    fromTxt: typeof import('../src/core/convert/from-txt').fromTxt;
    fromMarkdown: typeof import('../src/core/convert/from-md').fromMarkdown;
    fromDocx: typeof import('../src/core/convert/from-docx').fromDocx;
  }) => Promise<Book>,
): Promise<Uint8Array> {
  installDom();
  const { fromTxt } = await import('../src/core/convert/from-txt');
  const { fromMarkdown } = await import('../src/core/convert/from-md');
  const { fromDocx } = await import('../src/core/convert/from-docx');
  const { writeEpub } = await import('../src/core/epub/write');
  return writeEpub(await run({ fromTxt, fromMarkdown, fromDocx }), { modified: FIXED_DATE });
}

const encode = (text: string) => new TextEncoder().encode(text);

export const OUTPUTS: Array<{ name: string; make(): Promise<Uint8Array> }> = [
  ...Object.entries(EPUB)
    .filter(([key]) => !('error' in READ_EXPECTATIONS[key as EpubFixture]))
    .map(([key, build]) => ({
      name: `rewrite-${kebab(key)}`,
      make: () => rewrite(build(), `${kebab(key)}.epub`),
    })),
  {
    name: 'from-txt',
    make: () =>
      convert(({ fromTxt }) =>
        fromTxt(encode(SAMPLE_TXT), { title: 'Text Sample', author: 'Ada Example' }),
      ),
  },
  {
    name: 'from-md',
    make: () => convert(({ fromMarkdown }) => fromMarkdown(encode(sampleMarkdown()), {})),
  },
  {
    name: 'from-docx',
    make: () => convert(({ fromDocx }) => fromDocx(DOCX.basic())),
  },
];

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
