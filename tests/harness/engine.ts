/** Exposes the engine to browser tests as `window.engine`. Later tasks add to it. */
import { readEpub } from '../../src/core/epub/read';
import { outcomeOf, type ReadOutcome } from '../fixtures/expectations';

async function readOutcome(url: string): Promise<ReadOutcome> {
  const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
  try {
    return outcomeOf(await readEpub(data));
  } catch (e) {
    return { error: (e as Error).name };
  }
}

const engine = { readEpub, readOutcome };

declare global {
  interface Window {
    engine: typeof engine;
  }
}

window.engine = engine;
