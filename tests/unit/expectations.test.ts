import { describe, expect, it } from 'vitest';
import { readEpub } from '../../src/core/epub/read';
import { EPUB, type EpubFixture } from '../fixtures/catalog';
import { normalized, outcomeOf, READ_EXPECTATIONS } from '../fixtures/expectations';

describe('reader expectations (jsdom)', () => {
  for (const key of Object.keys(READ_EXPECTATIONS) as EpubFixture[]) {
    it(key, async () => {
      const outcome = await readEpub(EPUB[key]()).then(outcomeOf, (e: Error) => ({
        error: e.name,
      }));
      expect(outcome).toEqual(normalized(READ_EXPECTATIONS[key]));
    });
  }
});
