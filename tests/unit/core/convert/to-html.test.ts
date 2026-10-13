import { describe, expect, it } from 'vitest';
import { DEFAULT_PRINT, printCss, toHtml } from '../../../../src/core/convert/to-html';
import { readEpub } from '../../../../src/core/epub/read';
import { EPUB } from '../../../fixtures/catalog';

describe('toHtml', () => {
  it('writes one self-contained document', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    const doc = new DOMParser().parseFromString(toHtml(book), 'text/html');
    expect(doc.title).toBe('Fixture Three');
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
    expect(doc.querySelectorAll('section.chapter')).toHaveLength(3);
    expect(
      doc.querySelector('img')!.getAttribute('src')!.startsWith('data:image/png;base64,'),
    ).toBe(true);
    expect(doc.querySelector('a[href="#ch-3-end"]')).not.toBeNull();
    expect(doc.getElementById('ch-3-end')).not.toBeNull();
    expect(doc.getElementById('ch-2-s21')).not.toBeNull();
    expect(doc.querySelector('nav a[href="#ch-1"]')).not.toBeNull();
    expect(doc.querySelector('nav a[href="#ch-2-s21"]')).not.toBeNull();
    expect(doc.querySelector('a[href="https://example.org/"]')).not.toBeNull();
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelectorAll('style')).toHaveLength(1);
    expect(doc.querySelector('style')!.textContent).toContain('data:');
    expect(doc.querySelector('style')!.textContent).not.toContain('plain.woff');
    expect(toHtml({ ...book, meta: { ...book.meta, title: 'A <b> & "c"' } })).toContain(
      '<title>A &lt;b&gt; &amp; "c"</title>',
    );
  });

  it('forbids the page from loading anything outside itself', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    for (const html of [toHtml(book), toHtml(book, { print: true })]) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
      expect(csp?.getAttribute('content')).toBe(
        "default-src 'none'; img-src data:; font-src data:; media-src data:; style-src 'unsafe-inline'",
      );
      expect(doc.head.firstElementChild!.getAttribute('charset')).toBe('utf-8');
    }
  });

  it('adds page rules for printing', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    const print = toHtml(book, { print: true });
    expect(print).toContain('@page');
    expect(print).toContain('break-before: page');
    expect(print).toContain('<meta name="color-scheme" content="light">');
    expect(toHtml(book)).not.toContain('@page');
    const doc = new DOMParser().parseFromString(print, 'text/html');
    expect(doc.getElementById('print-options')!.textContent).toContain(printCss(DEFAULT_PRINT));
  });

  it('writes the page rules the reader picks', () => {
    const a5 = printCss({ ...DEFAULT_PRINT, page: 'a5', text: 'large', margins: 'wide' });
    expect(a5).toContain('@page { size: A5; margin: 2.25cm }');
    expect(a5).toContain('font-size: 13.5pt');
    expect(a5).toContain('width: 148mm');
    expect(a5).not.toContain('body > nav { display: none }');

    const plain = printCss({ ...DEFAULT_PRINT, breaks: false, contents: false });
    expect(plain).not.toContain('break-before');
    expect(plain).toContain('body > nav { display: none }');
  });

  it('leaves the pictures out of a copy without them, and keeps every word', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    const full = toHtml(book, { print: true });
    const plain = toHtml(book, { print: true, pictures: false });
    expect(full).toContain('data:image/');
    expect(plain).not.toContain('data:image/');
    expect(plain).not.toContain('<img');
    expect(plain).toContain('data:font/');
    const words = (html: string) =>
      new DOMParser().parseFromString(html, 'text/html').body.textContent!.replace(/\s+/g, ' ');
    expect(words(plain)).toBe(words(full));
  });
});
