/** Exposes the engine to browser tests as `window.engine`. Later tasks add to it. */
import { readEpub } from '../../src/core/epub/read';
import { writeEpub } from '../../src/core/epub/write';
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

const engine = { readEpub, writeEpub, readOutcome, rewriteOutcome };

declare global {
  interface Window {
    engine: typeof engine;
  }
}

window.engine = engine;
