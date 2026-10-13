import { describe, expect, it } from 'vitest';
import { fromTxt } from '../../../../src/core/convert/from-txt';

const enc = (s: string) => new TextEncoder().encode(s);

describe('fromTxt', () => {
  it('splits a plain-text book at its chapter headings', async () => {
    const b = await fromTxt(
      enc('CHAPTER I\n\nIt was a dark night.\nStill dark.\n\nNext <b>.\n\nCHAPTER II\n\nMorning.'),
      { title: 'Night', author: 'Ada Example' },
    );
    expect(b.meta).toMatchObject({
      title: 'Night',
      authors: ['Ada Example'],
      language: 'en',
      layout: 'reflowable',
    });
    expect(b.meta.identifier).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
    expect(b.chapters.map((c) => c.title)).toEqual(['CHAPTER I', 'CHAPTER II']);
    expect(b.chapters.map((c) => [c.id, c.href])).toEqual([
      ['c001', 'text/c001.xhtml'],
      ['c002', 'text/c002.xhtml'],
    ]);
    expect(b.chapters[0]!.html).toBe(
      '<h1>CHAPTER I</h1><p>It was a dark night.<br>Still dark.</p><p>Next &lt;b&gt;.</p>',
    );
    expect(b.toc.map((e) => [e.label, e.chapter])).toEqual([
      ['CHAPTER I', 0],
      ['CHAPTER II', 1],
    ]);
  });

  it('splits an Italian book at its CAPITOLO headings', async () => {
    const b = await fromTxt(
      enc(
        'Pinocchio\n\nCAPITOLO I\n\nC’era una volta.\n\nCapitolo II\n\nUn pezzo di legno.\n\nPARTE TERZA\n\nFine.',
      ),
      { title: 'Pinocchio', author: 'Carlo Collodi', language: 'it' },
    );
    expect(b.chapters.map((c) => c.title)).toEqual([
      'Pinocchio',
      'CAPITOLO I',
      'Capitolo II',
      'PARTE TERZA',
    ]);
  });

  it('guesses the language when none is given', async () => {
    const page =
      'C’era una volta un pezzo di legno. Non era un legno di lusso, ma un semplice pezzo ' +
      'da catasta, di quelli che d’inverno si mettono nelle stufe e nei caminetti per ' +
      'accendere il fuoco e per riscaldare le stanze. Non so come andasse, ma il fatto gli è ' +
      'che un bel giorno questo pezzo di legno capitò nella bottega di un falegname.';
    const b = await fromTxt(enc(page), { title: 'Pinocchio', author: 'Carlo Collodi' });
    expect(b.meta.language).toBe('it');
    const given = await fromTxt(enc(page), { title: 'P', author: 'A', language: 'fr' });
    expect(given.meta.language).toBe('fr');
  });

  it('gives a book without headings one chapter named after the book', async () => {
    const b = await fromTxt(enc('Just one paragraph.'), { title: 'T', author: 'A' });
    expect(b.chapters.map((c) => c.title)).toEqual(['T']);
  });

  it('keeps text before the first heading and ignores heading words inside paragraphs', async () => {
    const b = await fromTxt(
      enc('A foreword.\n\nPart One\n\nChapter and verse are\nquoted here.\n\nII.\n\nEnd.'),
      { title: 'T', author: 'A', language: 'it' },
    );
    expect(b.meta.language).toBe('it');
    expect(b.chapters.map((c) => c.title)).toEqual(['T', 'Part One', 'II.']);
    expect(b.chapters[1]!.html).toContain('<p>Chapter and verse are<br>quoted here.</p>');
  });
});
