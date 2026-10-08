import { describe, expect, it } from 'vitest';
import { readEpub } from '../../../../src/core/epub/read';
import { MalformedBookError, NotAnEpubError } from '../../../../src/core/errors';
import { bigEpub, EPUB, OTHER, textOf } from '../../../fixtures/catalog';

const decode = (data: Uint8Array) => new TextDecoder().decode(data);

describe('readEpub', () => {
  it('reads metadata, chapters, stylesheets and the cover of an EPUB 3 book', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    expect(book.meta).toEqual({
      title: 'Fixture Three',
      authors: ['Ada Example', 'Bo Sample'],
      language: 'en',
      identifier: 'urn:uuid:00000000-0000-4000-8000-000000000003',
      layout: 'reflowable',
    });
    expect(book.chapters.map((c) => c.href)).toEqual([
      'OEBPS/text/ch1.xhtml',
      'OEBPS/text/ch2.xhtml',
      'OEBPS/text/ch3.xhtml',
    ]);
    expect(book.chapters[1]!.html).toContain('src="OEBPS/images/cover.png"');
    expect(book.chapters[1]!.html).toContain('href="OEBPS/text/ch3.xhtml#end"');
    expect(book.chapters[0]!.stylesheets).toEqual(['OEBPS/css/book.css']);
    expect(decode(book.resources.get('OEBPS/css/book.css')!.data)).toContain(
      'url("OEBPS/fonts/plain.woff")',
    );
    expect(book.cover).toBe('OEBPS/images/cover.png');
    expect(book.warnings).toEqual([]);
  });

  it('finds EPUB 2 covers and handles odd file names', async () => {
    expect((await readEpub(EPUB.epub2Ncx())).cover).toBe('OEBPS/images/cover.png');
    const odd = await readEpub(EPUB.oddNames());
    expect(odd.chapters.map((c) => c.href)).toEqual([
      'OEBPS/Text Files/capítulo 1.xhtml',
      'OEBPS/Text Files/50%.xhtml',
    ]);
    expect(odd.chapters[0]!.html).toContain('src="OEBPS/Images/deep/nested/fig 1.png"');
    expect(odd.resources.has('OEBPS/Images/deep/nested/fig 1.png')).toBe(true);
    expect((await readEpub(EPUB.noCover())).cover).toBeUndefined();
    expect((await readEpub(EPUB.noTitle(), { fileName: 'My Book.epub' })).meta.title).toBe(
      'My Book',
    );
  });

  it('ignores obfuscated fonts and refuses protected or invalid files', async () => {
    const fonts = await readEpub(EPUB.fontObfuscation());
    expect(fonts.resources.has('OEBPS/fonts/obf.otf')).toBe(false);
    expect(fonts.warnings).toContain('obfuscated-fonts-ignored');
    await expect(readEpub(EPUB.drmAdept())).rejects.toMatchObject({
      name: 'DrmProtectedError',
      scheme: 'adobe-adept',
    });
    await expect(readEpub(OTHER.notAZip())).rejects.toBeInstanceOf(NotAnEpubError);
    await expect(readEpub(EPUB.zipNotEpub())).rejects.toBeInstanceOf(NotAnEpubError);
    await expect(readEpub(EPUB.emptySpine())).rejects.toBeInstanceOf(MalformedBookError);
  });

  it('is lenient with broken packages and markup', async () => {
    expect((await readEpub(EPUB.noContainer())).chapters).toHaveLength(1);
    const broken = await readEpub(EPUB.brokenXhtml());
    expect(broken.warnings).toContain('html-fallback');
    expect(textOf(broken.chapters[0]!.html)).toContain(' ');
    expect(textOf(broken.chapters[0]!.html)).toContain('—');
    expect(textOf((await readEpub(EPUB.epub2Entities())).chapters[0]!.html)).toContain(
      'Café au lait',
    );
    const fixed = await readEpub(EPUB.fixedLayout());
    expect(fixed.meta.layout).toBe('pre-paginated');
    expect(fixed.warnings).toContain('fixed-layout');
    const missing = await readEpub(EPUB.missingFiles());
    expect(missing.chapters).toHaveLength(1);
    expect(missing.warnings).toContain('missing-resource');
  });

  it('removes scripts and external references from chapters and stylesheets', async () => {
    const mal = await readEpub(EPUB.malicious());
    const all =
      mal.chapters[0]!.html +
      mal.chapters[0]!.inlineCss +
      [...mal.resources.values()]
        .filter((r) => r.mediaType === 'text/css')
        .map((r) => decode(r.data))
        .join('');
    for (const bad of ['<script', 'onerror', 'javascript:', 'e.invalid', 'tracker.invalid']) {
      expect(all).not.toContain(bad);
    }
    expect(mal.chapters[0]!.html).toContain('Safe text survives');
  });

  it('opens a 200-chapter book with a 20 MB image within 20 s', async () => {
    const big = await readEpub(bigEpub());
    expect(big.chapters).toHaveLength(200);
  }, 20_000);
});
