import { describe, expect, it } from 'vitest';
import { readEpub } from '../../../../src/core/epub/read';
import { parseNav, parseNcx, tocFromHeadings } from '../../../../src/core/epub/toc';
import type { Chapter } from '../../../../src/core/model/book';
import { EPUB } from '../../../fixtures/catalog';

const chapter = (html: string): Chapter => ({
  id: 'c',
  href: 'c.xhtml',
  html,
  stylesheets: [],
  inlineCss: '',
});

describe('tables of contents', () => {
  it('reads the EPUB 3 nav and names chapters after it', async () => {
    const b = await readEpub(EPUB.epub3Nav());
    expect(b.toc).toEqual([
      { label: 'Chapter One', chapter: 0, children: [] },
      {
        label: 'Chapter Two',
        chapter: 1,
        children: [{ label: 'Section 2.1', chapter: 1, fragment: 's21', children: [] }],
      },
      { label: 'Chapter Three', chapter: 2, children: [] },
    ]);
    expect(b.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two', 'Chapter Three']);
  });

  it('falls back to the NCX, then to headings', async () => {
    expect((await readEpub(EPUB.epub2Ncx())).toc.map((e) => e.label)).toEqual([
      'First Chapter',
      'Second Chapter',
    ]);
    const nt = await readEpub(EPUB.noToc());
    expect(nt.toc.map((e) => e.label)).toEqual(['Opening', 'Section 2']);
    expect(nt.warnings).toContain('toc-generated');
    expect(nt.chapters.map((c) => c.title)).toEqual(['Opening', 'Section 2']);
  });

  it('lifts the children of entries that point at no chapter', () => {
    const idx = new Map([['a/c1.xhtml', 0]]);
    expect(
      parseNav(
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>' +
          '<li><a href="c1.xhtml">  Chapter\n One </a></li>' +
          '<li><span>Part</span><ol><li><a href="https://e.org">x</a><ol><li><a href="c1.xhtml#p">Deep</a></li></ol></li></ol></li>' +
          '</ol></nav></body></html>',
        'a/nav.xhtml',
        idx,
      ),
    ).toEqual([
      { label: 'Chapter One', chapter: 0, children: [] },
      { label: 'Deep', chapter: 0, fragment: 'p', children: [] },
    ]);
  });

  it('ignores navs that are not the table of contents', () => {
    const idx = new Map([['c1.xhtml', 0]]);
    const html =
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>' +
      '<nav epub:type="landmarks"><ol><li><a href="c1.xhtml">Start</a></li></ol></nav>' +
      '<nav epub:type="toc"><ol><li><a href="c1.xhtml">One</a></li></ol></nav></body></html>';
    expect(parseNav(html, 'nav.xhtml', idx).map((e) => e.label)).toEqual(['One']);
    expect(
      parseNav('<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>', 'nav.xhtml', idx),
    ).toEqual([]);
  });

  it('reads nested NCX navPoints', () => {
    const idx = new Map([
      ['OEBPS/c1.xhtml', 0],
      ['OEBPS/c 2.xhtml', 1],
    ]);
    const ncx =
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>' +
      '<navPoint><navLabel><text>One</text></navLabel><content src="c1.xhtml"/>' +
      '<navPoint><navLabel><text> Two\n and a half </text></navLabel><content src="c%202.xhtml#x"/></navPoint>' +
      '</navPoint></navMap></ncx>';
    expect(parseNcx(ncx, 'OEBPS/toc.ncx', idx)).toEqual([
      {
        label: 'One',
        chapter: 0,
        children: [{ label: 'Two and a half', chapter: 1, fragment: 'x', children: [] }],
      },
    ]);
    expect(parseNcx('not xml', 'OEBPS/toc.ncx', idx)).toEqual([]);
  });

  it('builds one entry per chapter from headings', () => {
    expect(
      tocFromHeadings([
        chapter('<p>x</p><h3> Third\nlevel </h3><h1>Later</h1>'),
        chapter('<h4>Too deep</h4>'),
      ]),
    ).toEqual([
      { label: 'Third level', chapter: 0, children: [] },
      { label: 'Section 2', chapter: 1, children: [] },
    ]);
  });
});
