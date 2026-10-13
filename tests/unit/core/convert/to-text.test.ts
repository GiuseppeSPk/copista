import { describe, expect, it } from 'vitest';
import { toText } from '../../../../src/core/convert/to-text';
import { readEpub } from '../../../../src/core/epub/read';
import type { Book } from '../../../../src/core/model/book';
import { EPUB } from '../../../fixtures/catalog';

function bookOf(...chapters: string[]): Book {
  return {
    meta: {
      title: 'T',
      authors: [],
      language: 'en',
      identifier: 'urn:x',
      layout: 'reflowable',
    },
    chapters: chapters.map((html, i) => ({
      id: `c${i}`,
      href: `c${i}.xhtml`,
      html,
      stylesheets: [],
      inlineCss: '',
    })),
    toc: [],
    resources: new Map(),
    warnings: [],
  };
}

describe('toText', () => {
  it('writes a header, then the text of every chapter', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    const txt = toText(book);
    expect(txt.startsWith('Fixture Three\nAda Example, Bo Sample\n\nChapter One\n\n')).toBe(true);
    expect(txt).toContain('[Image: Cover]');
    expect(txt).not.toMatch(/<[a-z]/i);
    expect(txt.endsWith('The end.\n')).toBe(true);
    expect(txt).toContain('Nobody there had yet heard the bell.\n\n\nChapter Two\n\n');
  });

  it('keeps line breaks, marks list items and images, and collapses spaces', () => {
    const txt = toText(
      bookOf(
        '<p>one<br>two   three\n four</p><ul><li>a</li><li><p>b</p></li></ul><p><img src="x.png"></p>',
        '<pre>  keep\n    this</pre><p>&lt;tag&gt; &amp;</p>',
      ),
    );
    expect(txt).toBe(
      'T\n\none\ntwo three four\n\n- a\n\n- b\n\n[Image]\n\n\n  keep\n    this\n\n<tag> &\n',
    );
  });

  it('leaves out the title and authors when the opening pages already print them', () => {
    const titled = (...chapters: string[]): Book => {
      const book = bookOf(...chapters);
      return { ...book, meta: { ...book.meta, title: 'Pinocchio', authors: ['Carlo Collodi'] } };
    };
    expect(toText(titled('<h1>PINOCCHIO</h1><p>Carlo  Collodi</p>', '<p>One.</p>'))).toBe(
      'PINOCCHIO\n\nCarlo Collodi\n\n\nOne.\n',
    );
    expect(toText(titled('<h1>Pinocchio</h1><p>One.</p>'))).toBe(
      'Carlo Collodi\n\nPinocchio\n\nOne.\n',
    );
    expect(toText(titled('<p>One.</p>'))).toBe('Pinocchio\nCarlo Collodi\n\nOne.\n');
  });

  it('gives no label to a picture drawn the size of an icon', () => {
    const txt = toText(
      bookOf(
        '<p><img src="q.png" width="20" alt="100%"> Complete text</p>',
        '<p><img style="height: 16px" alt="x"><img width="200" height="300" alt="Geppetto"></p>',
      ),
    );
    expect(txt).toBe('T\n\nComplete text\n\n\n[Image: Geppetto]\n');
  });
});
