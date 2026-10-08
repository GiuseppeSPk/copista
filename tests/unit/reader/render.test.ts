import { describe, expect, it } from 'vitest';
import { bookFromSections } from '../../../src/core/convert/build';
import { readEpub } from '../../../src/core/epub/read';
import type { Resource } from '../../../src/core/model/book';
import { buildSrcdoc } from '../../../src/reader/render';
import { ResourceUrls } from '../../../src/reader/resources';
import { EPUB } from '../../fixtures/catalog';
import { makePng } from '../../fixtures/png';

function counting() {
  let n = 0;
  return () => `blob:test/${++n}`;
}

describe('buildSrcdoc', () => {
  it('writes a locked-down page with blob resources and inert links', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    const urls = new ResourceUrls(book, counting(), () => {});
    const img = urls.urlFor('OEBPS/images/cover.png');
    const html = buildSrcdoc(book, 1, urls, { fontSizePercent: 120, theme: 'sepia' });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; font-src blob: data:; style-src blob: 'unsafe-inline'">`,
    );
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('data-theme="sepia"');
    expect(html).toContain('font-size: 120%');
    expect(html).toContain(`src="${img}"`);
    expect(html).toContain('data-copista-href="OEBPS/text/ch3.xhtml#end"');
    expect(html).toContain('data-copista-external="https://example.org/"');
    expect(html).toMatch(/<link rel="stylesheet" href="blob:test\/\d+">/);
    expect(html).not.toContain('OEBPS/images/cover.png');
    expect(html).not.toContain('href="https://example.org/"');
  });

  it('drops missing resources and maps style attributes', () => {
    const resources = new Map<string, Resource>([
      ['bg.png', { href: 'bg.png', mediaType: 'image/png', data: makePng(1, 1) }],
    ]);
    const book = bookFromSections(
      [{ html: '<p>placeholder</p>' }],
      { title: 'Refs', author: 'Ada Example' },
      resources,
    );
    book.chapters[0]!.html =
      '<p style="background: url(bg.png)">x</p><img src="gone.png" alt="Gone"><p>a</p>';
    book.chapters[0]!.inlineCss = 'p { color: red } </style><script>alert(1)</script>';
    const urls = new ResourceUrls(book, counting(), () => {});
    const html = buildSrcdoc(book, 0, urls, { fontSizePercent: 100, theme: 'dark' });
    expect(html).toMatch(/style="background: url\(&quot;blob:test\/\d+&quot;\)"/);
    expect(html).not.toContain('gone.png');
    expect(html).toContain('alt="Gone"');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelectorAll('style')).toHaveLength(2);
    expect(html).toContain('data-theme="dark"');
  });
});
