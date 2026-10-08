/** Exposes the engine to browser tests as `window.engine`. Later tasks add to it. */
import { readEpub } from '../../src/core/epub/read';
import { writeEpub } from '../../src/core/epub/write';
import { convert, type OutputFormat } from '../../src/rooms/scriptorium/index';
import { outcomeOf, type ReadOutcome } from '../fixtures/expectations';

async function readOutcome(url: string): Promise<ReadOutcome> {
  const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
  try {
    return outcomeOf(await readEpub(data));
  } catch (e) {
    return { error: (e as Error).name };
  }
}

/** Reads a fixture, writes it as EPUB 3 and reads the result back. */
async function rewriteOutcome(url: string): Promise<ReadOutcome> {
  const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
  return outcomeOf(await readEpub(writeEpub(await readEpub(data))));
}

export interface ConvertOutcome {
  kind: 'file' | 'print';
  fileName?: string;
  size: number;
  /** Chapters of an EPUB output, read back with readEpub. */
  chapters?: number;
  printable?: boolean;
}

/** Converts a fetched fixture, or inline text, and checks what comes out. */
async function convertOutcome(
  source: { url: string } | { text: string },
  name: string,
  target: OutputFormat,
): Promise<ConvertOutcome> {
  const data =
    'url' in source
      ? new Uint8Array(await (await fetch(source.url)).arrayBuffer())
      : new TextEncoder().encode(source.text);
  const out = await convert(new File([data], name), target);
  if (out.kind === 'print') {
    return { kind: 'print', size: out.html.length, printable: out.html.includes('@page') };
  }
  const bytes = new Uint8Array(await out.blob.arrayBuffer());
  const outcome: ConvertOutcome = { kind: 'file', fileName: out.fileName, size: bytes.length };
  if (target === 'epub') outcome.chapters = (await readEpub(bytes)).chapters.length;
  return outcome;
}

const engine = { readEpub, writeEpub, readOutcome, rewriteOutcome, convertOutcome };

declare global {
  interface Window {
    engine: typeof engine;
  }
}

window.engine = engine;
