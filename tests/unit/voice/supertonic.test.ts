import { describe, expect, it } from 'vitest';
import {
  TextIds,
  frameNoise,
  latentSize,
  noise,
  parseStyle,
  preprocessText,
} from '../../../src/voice/supertonic';

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

describe('the Italian text fixes, each off unless asked for', () => {
  it('reads a Roman numeral after a heading word as an ordinal, and leaves a king alone', () => {
    expect(preprocessText('Capitolo XIV', 'it', ['roman'])).toBe(
      '<it>Capitolo quattordicesimo.</it>',
    );
    expect(preprocessText('CANTO I', 'it', ['roman'])).toBe('<it>CANTO primo.</it>');
    expect(preprocessText('Parte II', 'it', ['roman'])).toBe('<it>Parte seconda.</it>');
    expect(preprocessText('Luigi XIV', 'it', ['roman'])).toBe('<it>Luigi XIV.</it>');
    expect(preprocessText('nel canto i fiori', 'it', ['roman'])).toBe(
      '<it>nel canto i fiori.</it>',
    );
  });

  it('spells out the common abbreviations, and not a word that ends like one', () => {
    expect(preprocessText('il sig. Rossi', 'it', ['abbreviations'])).toBe(
      '<it>il signor Rossi.</it>',
    );
    expect(preprocessText('la sig.ra Rossi', 'it', ['abbreviations'])).toBe(
      '<it>la signora Rossi.</it>',
    );
    expect(preprocessText('mele, pere ecc., e poi', 'it', ['abbreviations'])).toBe(
      '<it>mele, pere eccetera, e poi.</it>',
    );
    expect(preprocessText('un buon design. Poi', 'it', ['abbreviations'])).toBe(
      '<it>un buon design. Poi.</it>',
    );
  });

  it('keeps the full stop when an abbreviation ends the sentence', () => {
    expect(preprocessText('mele, pere ecc. Poi venne', 'it', ['abbreviations'])).toBe(
      '<it>mele, pere eccetera. Poi venne.</it>',
    );
  });

  it('changes nothing when no fix is asked for', () => {
    const text = 'Il sig. Rossi, Capitolo XIV, ecc.';
    expect(preprocessText(text, 'it')).toBe('<it>Il sig. Rossi, Capitolo XIV, ecc.</it>');
    expect(preprocessText(text, 'it', [])).toBe(preprocessText(text, 'it'));
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

describe('noise', () => {
  it('repeats for the same seed, so a sentence always sounds the same', () => {
    expect(noise(64, 1)).toEqual(noise(64, 1));
    expect(noise(64, 1)).not.toEqual(noise(64, 2));
  });

  it('is roughly standard normal', () => {
    const xs = noise(20000, 3);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(variance - 1)).toBeLessThan(0.05);
  });
});

describe('frameNoise', () => {
  it('draws frame by frame, so a longer piece starts with the same noise', () => {
    const short = frameNoise(4, 10, 2);
    const long = frameNoise(4, 50, 2);
    for (let d = 0; d < 4; d++) {
      for (let t = 0; t < 10; t++) expect(short[d * 10 + t]).toBe(long[d * 50 + t]);
    }
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
