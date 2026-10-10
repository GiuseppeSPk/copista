import { describe, expect, it } from 'vitest';
import { censusOfHtml, censusOfText, collate } from '../../../../src/core/convert/census';

const SOFT_HYPHEN = String.fromCharCode(0xad);
const words = (html: string) => Object.fromEntries(censusOfHtml([html]).words);
const parts = (html: string) => censusOfHtml([html]).parts;

describe('census', () => {
  it('counts words without case, across curly apostrophes and soft hyphens', () => {
    expect(words(`<p>The sailor’s <b>won${SOFT_HYPHEN}der</b>, the SAILOR's wonder.</p>`)).toEqual({
      the: 2,
      "sailor's": 2,
      wonder: 2,
    });
  });

  it('separates words at block elements but not inside a line', () => {
    expect(words('<p>end</p><p>start</p><p>wh<i>ale</i></p>')).toEqual({
      end: 1,
      start: 1,
      whale: 1,
    });
  });

  it('skips scripts and styles', () => {
    expect(words('<style>p { color: red }</style><p>kept</p>')).toEqual({ kept: 1 });
  });

  it('counts headings, tables, images and web links', () => {
    expect(
      parts(
        '<h1>A</h1><h3>B</h3><table><tr><td>x</td></tr></table>' +
          '<img src="a.png"><img alt="no source"><svg><svg></svg></svg>' +
          '<a href="https://example.org">web</a><a href="mailto:a@b.c">mail</a>',
      ),
    ).toMatchObject({ headings: 2, tables: 1, images: 2, links: 2 });
  });

  it('tells note references from contents entries', () => {
    const html =
      '<a href="n.xhtml#n1" epub:type="noteref">first</a>' +
      '<a href="#n2"><sup>2</sup></a>' +
      '<sup><a href="#n3">3</a></sup>' +
      '<a href="#n4">[4]</a>' +
      '<a href="#fn5">5</a>' +
      '<a href="#chapter-iv">IV</a>' +
      '<a href="ch4.xhtml">4</a>';
    expect(parts(html)?.notes).toBe(5);
  });

  it('counts emphasis once when it is nested', () => {
    expect(parts('<p><em>one <strong>two</strong></em> <b>three</b> <i> </i></p>')?.emphasis).toBe(
      2,
    );
  });

  it('holds only words for plain text', () => {
    expect(censusOfText('Two words')).toEqual({
      words: new Map([
        ['two', 1],
        ['words', 1],
      ]),
    });
  });
});

describe('collate', () => {
  it('counts each word as often as both texts have it, and names the first missing ones', () => {
    const original = censusOfText('a a a b c d e f g h');
    const copy = censusOfText('a b extra');
    expect(collate(original, copy).words).toEqual({
      total: 10,
      found: 2,
      missing: ['a', 'c', 'd', 'e', 'f'],
    });
  });

  it('compares only the parts the original has', () => {
    const original = censusOfHtml(['<h1>T</h1><p><em>x</em></p>']);
    const copy = censusOfHtml(['<h1>T</h1><p>x</p><table><tr><td>y</td></tr></table>']);
    expect(collate(original, copy).parts).toEqual([
      { part: 'headings', original: 1, copy: 1 },
      { part: 'emphasis', original: 1, copy: 0 },
    ]);
  });

  it('leaves the parts out when the copy is plain text', () => {
    expect(collate(censusOfHtml(['<h1>T</h1>']), censusOfText('T')).parts).toBeUndefined();
  });
});
