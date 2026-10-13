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

  it('makes a title page of the short lines a text opens with', async () => {
    const b = await fromTxt(
      enc(
        'Le avventure di Pinocchio\r\n\r\nCarlo Collodi\r\n\r\nCAPITOLO I\r\n\r\nC’era una volta.',
      ),
      {},
      { fileName: 'pinocchio.txt' },
    );
    expect(b.meta).toMatchObject({
      title: 'Le avventure di Pinocchio',
      authors: ['Carlo Collodi'],
    });
    expect(b.chapters[0]!.html).toBe(
      '<p class="title">Le avventure di Pinocchio</p><p class="author">Carlo Collodi</p>',
    );
    expect(b.chapters.map((c) => c.title)).toEqual(['Le avventure di Pinocchio', 'CAPITOLO I']);

    // Title and author as one paragraph of two lines, the author after "by".
    const two = await fromTxt(enc('The Two Roads\nby A. Tester\n\nChapter I\n\nText.'), {});
    expect(two.meta).toMatchObject({ title: 'The Two Roads', authors: ['A. Tester'] });

    // What the reader typed wins; the lines still open the book.
    const typed = await fromTxt(enc('The Two Roads\n\nA. Tester\n\nText.'), { title: 'Roads' });
    expect(typed.meta).toMatchObject({ title: 'Roads', authors: ['A. Tester'] });
    expect(typed.chapters[0]!.html).toContain('<p class="title">The Two Roads</p>');
  });

  it('reads no title page where the opening lines are not one', async () => {
    const cases: [string, string, string][] = [
      // A sentence, not a title.
      ['It was late.\n\nThe end.', 'note', 'note'],
      // A lone short line is the whole text.
      ['Shopping list', 'list', 'list'],
      // A chapter heading first.
      ['Chapter I\n\nText.', 'ch', 'ch'],
      // Project Gutenberg texts open with their licence.
      ['The Project Gutenberg eBook of Emma\n\nText.', 'emma', 'emma'],
    ];
    for (const [text, fileName, title] of cases) {
      const b = await fromTxt(enc(text), {}, { fileName: `${fileName}.txt` });
      expect(b.meta.title).toBe(title);
      expect(b.chapters[0]!.html).not.toContain('class="title"');
    }
    // A second line that is no name is left as text.
    const b = await fromTxt(enc('Shopping list\n\ncheese and bread\n\nmilk'), {});
    expect(b.meta).toMatchObject({ title: 'Shopping list', authors: ['Unknown'] });
    expect(b.chapters[0]!.html).toContain('<p>cheese and bread</p>');
  });
});
