import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readEpub } from '../../../../src/core/epub/read';
import { writeEpub } from '../../../../src/core/epub/write';
import { htmlToXhtml } from '../../../../src/core/epub/xhtml';
import { parseXml } from '../../../../src/core/epub/xml';
import { EPUB, type EpubFixture, textOf } from '../../../fixtures/catalog';
import { READ_EXPECTATIONS } from '../../../fixtures/expectations';

const OPS_NS = 'http://www.idpf.org/2007/ops';

async function legacyOutput() {
  const zip = unzipSync(writeEpub(await readEpub(EPUB.legacyMarkup())));
  const text = strFromU8(zip['EPUB/text/c001.xhtml']!);
  return { zip, text, chapter: parseXml(text)! };
}

function find(doc: Document, tag: string, text: string): Element {
  const element = [...doc.getElementsByTagName(tag)].find((e) => e.textContent === text);
  expect(element, `<${tag}> ${text}`).toBeDefined();
  return element!;
}

function attributes(element: Element): string[] {
  return element.getAttributeNames().sort();
}

function declarations(element: Element): string[] {
  return (element.getAttribute('style') ?? '')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d !== '')
    .sort();
}

describe('htmlToXhtml', () => {
  it('serializes an HTML fragment as well-formed XHTML', () => {
    const xhtml = htmlToXhtml('<p>a<br>b &nbsp;<img src="x.png" alt="">');
    expect(xhtml).toBe('<p>a<br />b  <img src="x.png" alt="" /></p>');
    expect(parseXml(`<div xmlns="http://www.w3.org/1999/xhtml">${xhtml}</div>`)).not.toBeNull();
  });
});

describe('writeEpub', () => {
  it('writes a deterministic EPUB 3 that reads back to the same book', async () => {
    const original = await readEpub(EPUB.epub3Nav());
    const modified = new Date('2026-10-08T12:00:00Z');
    const bytes = writeEpub(original, { modified });
    const ascii = (a: Uint8Array) => String.fromCharCode(...a);
    expect(ascii(bytes.subarray(30, 38))).toBe('mimetype');
    expect(ascii(bytes.subarray(38, 58))).toBe('application/epub+zip');
    expect(bytes[8]! | (bytes[9]! << 8)).toBe(0); // stored
    expect(bytes[28]! | (bytes[29]! << 8)).toBe(0); // no extra field

    const zip = unzipSync(bytes);
    expect(Object.keys(zip).every((k) => /^[A-Za-z0-9._/-]+$/.test(k))).toBe(true);
    const opf = strFromU8(zip['EPUB/content.opf']!);
    expect(opf).toContain('<meta property="dcterms:modified">2026-10-08T12:00:00Z</meta>');
    expect(opf).toContain('properties="nav"');
    expect(opf).toContain('properties="cover-image"');
    expect(writeEpub(original, { modified })).toEqual(bytes);

    const again = await readEpub(bytes);
    expect(again.meta).toEqual(original.meta);
    expect(again.toc).toEqual(original.toc);
    expect(again.chapters.map((c) => textOf(c.html))).toEqual(
      original.chapters.map((c) => textOf(c.html)),
    );
    expect(again.resources.get(again.cover!)!.data).toEqual(
      original.resources.get(original.cover!)!.data,
    );
    expect(again.chapters[1]!.html).toContain(`href="${again.chapters[2]!.href}#end"`);
    expect(again.warnings).toEqual([]);
  });

  it('drops blocked urls and replaces images it cannot keep with their alt text', async () => {
    for (const name of ['malicious', 'missingFiles'] as const) {
      const out = unzipSync(writeEpub(await readEpub(EPUB[name]())));
      for (const [path, data] of Object.entries(out)) {
        const text = strFromU8(data);
        expect(text, `${name} ${path}`).not.toContain('about:invalid');
        expect(text, `${name} ${path}`).not.toMatch(/<img(?![^>]*\ssrc=)[^>]*>/);
      }
      const chapter = strFromU8(out['EPUB/text/c001.xhtml']!);
      if (name === 'missingFiles') expect(chapter).toContain('<p>gone</p>');
    }
  });

  it('turns obsolete HTML into valid HTML5 and keeps its layout as CSS', async () => {
    const doc = (await legacyOutput()).chapter;
    const p = find(doc, 'p', 'Centered');
    expect(attributes(p)).toEqual(['style']);
    expect(declarations(p)).toEqual(['text-align: center']);
    expect(declarations(find(doc, 'div', 'Old centre'))).toEqual(['text-align: center']);
    const table = doc.getElementsByTagName('table')[0]!;
    expect(attributes(table)).toEqual(['border', 'style']);
    expect(declarations(table)).toEqual([
      'background-color: #eee',
      'border-spacing: 0px',
      'margin-left: auto',
      'margin-right: auto',
      'width: 80%',
    ]);
    expect(declarations(doc.getElementsByTagName('tr')[0]!)).toEqual(['vertical-align: top']);
    const td = find(doc, 'td', 'Cell');
    expect(attributes(td)).toEqual(['style']);
    expect(declarations(td)).toEqual(['text-align: right', 'white-space: nowrap', 'width: 20px']);
    const th = find(doc, 'th', 'Head');
    expect(attributes(th)).toEqual(['scope', 'style']);
    expect(declarations(th)).toEqual(['width: 5px']);
    const br = doc.getElementsByTagName('br')[0]!;
    expect(declarations(br)).toEqual(['clear: both']);
    const hr = doc.getElementsByTagName('hr')[0]!;
    expect(attributes(hr)).toEqual(['style']);
    expect(declarations(hr)).toEqual(['width: 50%']);
    const ul = doc.getElementsByTagName('ul')[0]!;
    expect(attributes(ul)).toEqual(['style']);
    expect(declarations(ul)).toEqual(['list-style-type: disc']);
    const bullet = find(doc, 'li', 'Bullet');
    expect(attributes(bullet)).toEqual(['style']);
    expect(declarations(bullet)).toEqual(['list-style-type: square']);
    expect(attributes(doc.getElementsByTagName('ol')[0]!)).toEqual(['type']);
    expect(attributes(find(doc, 'li', 'Third'))).toEqual(['value']);
    const img = doc.getElementsByTagName('img')[0]!;
    expect(attributes(img)).toEqual(['alt', 'height', 'src', 'style', 'width']);
    expect(declarations(img)).toEqual([
      'float: left',
      'margin-bottom: 5px',
      'margin-left: 5px',
      'margin-right: 5px',
      'margin-top: 5px',
    ]);
    expect(declarations(find(doc, 'span', 'Red'))).toEqual(['color: red', 'font-family: serif']);
    expect(declarations(find(doc, 'span', 'big'))).toEqual(['font-size: larger']);
    expect(declarations(find(doc, 'span', 'mono'))).toEqual(['font-family: monospace']);
    expect(attributes(find(doc, 's', 'gone'))).toEqual([]);
    expect(attributes(find(doc, 'u', 'under'))).toEqual([]);
    for (const tag of ['font', 'center', 'big', 'tt', 'strike'])
      expect(doc.getElementsByTagName(tag), tag).toHaveLength(0);
  });

  it('keeps z3998 semantics with their prefix and drops other foreign prefixes', async () => {
    const { chapter, text } = await legacyOutput();
    expect(text).toContain(
      'epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#"',
    );
    const section = chapter.getElementsByTagName('section')[0]!;
    expect(section.getAttributeNS(OPS_NS, 'type')).toBe('chapter z3998:poem');
    expect(attributes(find(chapter, 'p', 'Verse'))).toEqual([]);
    const word = find(chapter, 'p', 'Word');
    expect(attributes(word)).toEqual([]);
    expect(word.children).toHaveLength(0);
    expect(text).not.toMatch(/<o:|\so:|xmlns:o/);

    const plain = unzipSync(writeEpub(await readEpub(EPUB.epub3Nav())));
    expect(strFromU8(plain['EPUB/text/c001.xhtml']!)).not.toContain('epub:prefix');
  });

  it('leaves out search key maps and media overlays', async () => {
    const { zip } = await legacyOutput();
    expect(strFromU8(zip['EPUB/content.opf']!)).not.toMatch(/search-key-map|smil/);
    expect(Object.keys(zip).filter((p) => /search-key-map|\.smil$/.test(p))).toEqual([]);
  });

  it('writes well-formed XML for every readable fixture', async () => {
    for (const [name, build] of Object.entries(EPUB)) {
      if ('error' in READ_EXPECTATIONS[name as EpubFixture]) continue;
      const out = unzipSync(writeEpub(await readEpub(build())));
      for (const [path, data] of Object.entries(out))
        if (path.endsWith('.xhtml') || path.endsWith('.opf'))
          expect(parseXml(strFromU8(data)), `${name} ${path}`).not.toBeNull();
    }
  });
});
