import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { bookFromSections } from '../../../../src/core/convert/build';
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
    expect(back.resources.size).toBe(1);
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
