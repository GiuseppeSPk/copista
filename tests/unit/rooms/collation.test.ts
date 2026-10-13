import { describe, expect, it } from 'vitest';
import { bookFromSections } from '../../../src/core/convert/build';
import type { Part } from '../../../src/core/convert/census';
import type { Resource } from '../../../src/core/model/book';
import { convertBook, type OutputFormat } from '../../../src/rooms/scriptorium';
import { makePng } from '../../fixtures/png';

const IMAGE: Resource = { href: 'images/plate.png', mediaType: 'image/png', data: makePng(2, 2) };

/** A small book with one of each part the collation counts. */
function sampleBook() {
  return bookFromSections(
    [
      {
        title: 'The Voyage',
        html:
          '<h1>The Voyage</h1>' +
          '<p>Call me <em>Ishmael</em>, said the sailor’s son.' +
          '<a href="#n1" epub:type="noteref"><sup>1</sup></a></p>' +
          '<p><img src="images/plate.png" alt="A whale"/></p>' +
          '<table><tr><td>Ship</td><td>Pequod</td></tr></table>' +
          '<p>See <a href="https://example.org/whales">the whale list</a>.</p>',
      },
      {
        title: 'Notes',
        html: '<h1>Notes</h1><p id="n1">A note on the voyage.</p>',
      },
    ],
    { title: 'Collation Fixture', author: 'Tester' },
    new Map([[IMAGE.href, IMAGE]]),
  );
}

async function collationOf(target: OutputFormat) {
  return (await convertBook(sampleBook(), target)).check();
}

function counts(parts: { part: Part; copy: number }[] | undefined): Partial<Record<Part, number>> {
  return Object.fromEntries((parts ?? []).map((p) => [p.part, p.copy]));
}

const EVERYTHING = { headings: 2, notes: 1, images: 1, tables: 1, links: 1, emphasis: 1 };

describe('collation of a copy', () => {
  it('finds every word of the book in every format', async () => {
    for (const target of ['epub', 'docx', 'md', 'txt', 'html', 'pdf'] as OutputFormat[]) {
      const { words } = await collationOf(target);
      expect(words, target).toEqual({ total: 22, found: 22, missing: [] });
    }
  });

  it('finds every part in an EPUB, an HTML page and a print view', async () => {
    for (const target of ['epub', 'html', 'pdf'] as OutputFormat[]) {
      expect(counts((await collationOf(target)).parts), target).toEqual(EVERYTHING);
    }
  });

  it('reports what Word and Markdown leave behind', async () => {
    // Word keeps the note's mark as a link to it, but no table or web link.
    expect(counts((await collationOf('docx')).parts)).toEqual({
      ...EVERYTHING,
      tables: 0,
      links: 0,
    });
    expect(counts((await collationOf('md')).parts)).toEqual({
      ...EVERYTHING,
      notes: 0,
      images: 0,
    });
  });

  it('counts only words in plain text', async () => {
    expect((await collationOf('txt')).parts).toBeUndefined();
  });
});
