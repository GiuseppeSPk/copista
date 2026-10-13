import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { BOOK_CSS_KEY, bookFromSections } from '../../../../src/core/convert/build';
import { fromDocx } from '../../../../src/core/convert/from-docx';
import { toDocx } from '../../../../src/core/convert/to-docx';
import { readEpub } from '../../../../src/core/epub/read';
import { parseXml } from '../../../../src/core/epub/xml';
import type { Resource } from '../../../../src/core/model/book';
import { DOCX, EPUB } from '../../../fixtures/catalog';
import { makePng } from '../../../fixtures/png';

const documentXml = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['word/document.xml']!);

describe('toDocx', () => {
  it('writes a package that mammoth reads back', async () => {
    const bytes = toDocx(await fromDocx(DOCX.basic()));
    const zip = unzipSync(bytes);
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'word/document.xml',
      'word/styles.xml',
      'word/numbering.xml',
      'word/_rels/document.xml.rels',
      'word/media/image1.png',
    ])
      expect(zip[part], part).toBeDefined();
    for (const [p, d] of Object.entries(zip))
      if (/\.(xml|rels)$/.test(p)) expect(parseXml(strFromU8(d)), p).not.toBeNull();

    // mammoth is an independent reader of our output
    const back = await fromDocx(bytes);
    expect(back.meta.title).toBe('Docx Fixture');
    expect(back.chapters.map((c) => c.title)).toEqual(['Part One', 'Part Two']);
    for (const s of [
      '<strong>bold</strong>',
      '<em>italic</em>',
      '<ul><li>first</li><li>second</li></ul>',
      '<ol><li>one</li><li>two</li></ol>',
      'a | b',
      'c | d',
    ])
      expect(back.chapters[0]!.html).toContain(s);
    // The one picture, and the stylesheet every book Copista makes carries.
    expect([...back.resources.keys()].filter((k) => k !== BOOK_CSS_KEY)).toHaveLength(1);
    expect(back.resources.get(BOOK_CSS_KEY)?.mediaType).toBe('text/css');
  });

  it('starts every chapter after the first on a new page', async () => {
    const fromEpub = toDocx(await readEpub(EPUB.epub3Nav()));
    expect((await fromDocx(fromEpub)).chapters.map((c) => c.title)).toEqual([
      'Chapter One',
      'Chapter Two',
      'Chapter Three',
    ]);
    expect(documentXml(fromEpub).split('<w:br w:type="page"/>')).toHaveLength(3);
  });

  it('nests lists and restarts the numbering of each ordered list', async () => {
    const book = bookFromSections(
      [
        {
          html:
            '<ol><li>one<ol><li>inner</li></ol></li></ol><p>Between.</p>' +
            '<ol><li>again</li></ol><ul><li>a<ul><li>b</li></ul></li></ul>',
        },
      ],
      { title: 'Lists', author: 'Ada Example' },
    );
    const bytes = toDocx(book);
    expect(documentXml(bytes)).toContain('<w:ilvl w:val="1"/>');
    const numbering = parseXml(strFromU8(unzipSync(bytes)['word/numbering.xml']!))!;
    expect(numbering.getElementsByTagName('w:startOverride')).toHaveLength(2);
    const html = (await fromDocx(bytes)).chapters[0]!.html;
    expect(html).toContain('<ol><li>one<ol><li>inner</li></ol></li></ol>');
    expect(html).toContain('<ol><li>again</li></ol>');
    expect(html).toContain('<ul><li>a<ul><li>b</li></ul></li></ul>');
  });

  it('keeps the caption of a table above its rows', async () => {
    const book = bookFromSections(
      [
        {
          html:
            '<table><caption>Cut &amp; Comeagain,<br>Merchant Tailors.</caption>' +
            '<tbody><tr><td>To one coat</td><td>$10</td></tr></tbody></table>',
        },
      ],
      { title: 'Bill', author: 'Ada Example' },
    );
    const html = (await fromDocx(toDocx(book))).chapters[0]!.html;
    expect(html).toContain(
      '<p>Cut &amp; Comeagain,<br>Merchant Tailors.</p><p>To one coat | $10</p>',
    );
  });

  it('heads a chapter with no heading of its own by its name in the contents', () => {
    const book = bookFromSections(
      [
        { title: 'Capitolo 1', html: '<p>I.</p><p>C’era una volta...</p>' },
        { title: 'Capitolo 2', html: '<h2>Capitolo 2</h2><p>Two.</p>' },
        { title: 'Capitolo 3', html: '<p>Capitolo 3</p><p>Three.</p>' },
        { html: '<p>Untitled.</p>' },
      ],
      { title: 'Pinocchio', author: 'Carlo Collodi' },
    );
    const xml = documentXml(toDocx(book));
    expect(
      xml
        .match(/<w:pStyle w:val="Heading\d"\/>.*?<\/w:p>/g)
        ?.map((p) => /[^>]+(?=<\/w:t>)/.exec(p)?.[0]),
    ).toEqual(['Capitolo 1', 'Capitolo 2']);
    expect(xml).not.toContain('>Pinocchio<');
  });

  it('makes links inside the book jump to the chapter or the place they name', () => {
    const book = bookFromSections(
      [
        {
          html:
            '<p><a href="text/c002.xhtml">Two</a>, <a href="text/c002.xhtml#n1">note</a>, ' +
            '<a href="text/c002.xhtml#gone">lost</a> and <a href="https://example.org/">out</a>.</p>',
        },
        { html: '<h1>Two</h1><p>Body.</p><p id="n1">The <span id="x">note</span>.</p>' },
      ],
      { title: 'Links', author: 'Ada Example' },
    );
    const bytes = toDocx(book);
    const xml = documentXml(bytes);
    expect(parseXml(xml)).not.toBeNull();
    const anchors = [...xml.matchAll(/<w:hyperlink w:anchor="([^"]+)"/g)].map((m) => m[1]);
    expect(anchors).toEqual(['_c1', '_c1_1', '_c1']);
    const bookmarks = [...xml.matchAll(/<w:bookmarkStart w:id="\d+" w:name="([^"]+)"\/>/g)];
    expect(bookmarks.map((m) => m[1])).toEqual(['_c1', '_c1_1']);
    // Each bookmark sits in the paragraph it names.
    expect(xml).toMatch(/w:name="_c1"\/><w:bookmarkEnd w:id="0"\/><w:r>(?:(?!<\/w:p>).)*>Two</);
    expect(xml).toMatch(/w:name="_c1_1"\/><w:bookmarkEnd w:id="1"\/><w:r>(?:(?!<\/w:p>).)*>The </);
    expect(xml).toContain('<w:t xml:space="preserve">out</w:t>');
    expect(xml).not.toContain('example.org');
    expect(strFromU8(unzipSync(bytes)['word/styles.xml']!)).toContain('w:styleId="Hyperlink"');
  });

  it('bookmarks notes kept in a list or a table', () => {
    const book = bookFromSections(
      [
        {
          html:
            '<p>Text<sup id="r1"><a href="#n1">1</a></sup> and <a href="#n2">2</a>.</p>' +
            '<ol><li id="n1"><a href="#r1">^</a> First.</li></ol>' +
            '<table><tr><td id="n2">Second.</td></tr></table>',
        },
      ],
      { title: 'Notes', author: 'Ada Example' },
    );
    const xml = documentXml(toDocx(book));
    const anchors = new Set([...xml.matchAll(/w:anchor="([^"]+)"/g)].map((m) => m[1]));
    const bookmarks = [...xml.matchAll(/w:bookmarkStart w:id="\d+" w:name="([^"]+)"/g)];
    expect([...anchors].sort()).toEqual(bookmarks.map((m) => m[1]).sort());
    expect(anchors.size).toBe(3);
    expect(xml).toMatch(
      /w:name="_c0_\d"\/><w:bookmarkEnd w:id="\d"\/><w:r>(?:(?!<\/w:p>).)*>Second\.</,
    );
  });

  it('scales wide images down to six inches', () => {
    const resources = new Map<string, Resource>([
      [
        'images/wide.png',
        { href: 'images/wide.png', mediaType: 'image/png', data: makePng(1152, 96) },
      ],
    ]);
    const book = bookFromSections(
      [{ html: '<p><img src="images/wide.png" alt="Wide"></p>' }],
      { title: 'Wide', author: 'Ada Example' },
      resources,
    );
    expect(documentXml(toDocx(book))).toContain('<wp:extent cx="5486400" cy="457200"/>');
  });
});
