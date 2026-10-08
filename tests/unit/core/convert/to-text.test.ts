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
});
