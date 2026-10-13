import { describe, expect, it } from 'vitest';
import { TextIds, latentSize, parseStyle, preprocessText } from '../../../src/voice/supertonic';

// Expected strings computed once with the original helper's UnicodeProcessor.
// NFKD splits an accented letter into the letter and a combining accent.
const GRAVE = String.fromCharCode(0x300);

describe('preprocessText', () => {
  it('matches the original helper', () => {
    expect(preprocessText('Ciao — mondo', 'it')).toBe('<it>Ciao - mondo.</it>');
    expect(preprocessText('«Sì», disse.', 'it')).toBe(`<it>«Si${GRAVE}», disse.</it>`);
    expect(preprocessText('e.g., a test @ home', 'en')).toBe(
      '<en>for example, a test at home.</en>',
    );
    expect(preprocessText('Già 😀 fatto', 'it')).toBe(`<it>Gia${GRAVE} fatto.</it>`);
    expect(preprocessText('Nessuna punteggiatura', 'it')).toBe('<it>Nessuna punteggiatura.</it>');
  });
});

describe('TextIds', () => {
  it('looks up each code unit of the prepared text, and gives -1 past the indexer', () => {
    const indexer = Array.from({ length: 128 }, (_, i) => i * 2);
    const ids = new TextIds(indexer).encode('a', 'it');
    expect([...ids]).toEqual([...'<it>a.</it>'].map((c) => BigInt(c.charCodeAt(0) * 2)));
    expect([...new TextIds(indexer).encode('é', 'it')]).toContain(-1n);
  });
});

describe('latentSize', () => {
  it('gives the latent shape for a duration with the real config', () => {
    const cfg = {
      ae: { sample_rate: 44100, base_chunk_size: 512 },
      ttl: { chunk_compress_factor: 6, latent_dim: 24 },
    };
    expect(latentSize(1, cfg)).toEqual({ length: 15, dim: 144 });
  });
});

describe('parseStyle', () => {
  it('flattens both style arrays in order and keeps their dims', () => {
    const style = parseStyle({
      style_ttl: {
        dims: [1, 2, 3],
        data: [
          [
            [1, 2, 3],
            [4, 5, 6],
          ],
        ],
      },
      style_dp: { dims: [1, 1, 2], data: [[[7, 8]]] },
    });
    expect([...style.ttl]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(style.ttlDims).toEqual([1, 2, 3]);
    expect([...style.dp]).toEqual([7, 8]);
    expect(style.dpDims).toEqual([1, 1, 2]);
  });

  it('refuses a file that is not a voice style', () => {
    expect(() => parseStyle({ style_ttl: { dims: [1, 2, 3], data: [[[1]]] } })).toThrow();
  });
});
