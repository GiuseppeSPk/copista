import { describe, expect, it } from 'vitest';
import { fromDocx } from '../../../src/core/convert/from-docx';
import { readEpub } from '../../../src/core/epub/read';
import { DrmProtectedError, UnsupportedFormatError } from '../../../src/core/errors';
import {
  convert,
  convertBook,
  inspect,
  outputFileName,
} from '../../../src/rooms/scriptorium/index';
import { DOCX, EPUB, OTHER } from '../../fixtures/catalog';

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const f = (data: Uint8Array, name: string): File =>
  new File([data as Uint8Array<ArrayBuffer>], name);

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('scriptorium', () => {
  it('offers every other format and asks for metadata only when the file has none', async () => {
    expect(await inspect(f(enc('# T'), 'a.md'))).toEqual({
      format: 'md',
      needsMeta: true,
      targets: ['epub', 'docx', 'txt', 'html', 'pdf'],
    });
    expect((await inspect(f(enc('---\ntitle: X\n---\n# T'), 'a.md'))).needsMeta).toBe(false);
    expect(await inspect(f(EPUB.epub3Nav(), 'b.epub'))).toEqual({
      format: 'epub',
      needsMeta: false,
      targets: ['docx', 'md', 'txt', 'html', 'pdf'],
    });
    expect(await inspect(f(DOCX.basic(), 'c.docx'))).toEqual({
      format: 'docx',
      needsMeta: false,
      targets: ['epub', 'md', 'txt', 'html', 'pdf'],
    });
    expect(await inspect(f(enc('Hi.'), 'd.txt'))).toEqual({
      format: 'txt',
      needsMeta: true,
      targets: ['epub', 'docx', 'md', 'html', 'pdf'],
    });
  });

  it('converts an EPUB to a Word document named after the book', async () => {
    const docx = await convert(f(EPUB.epub3Nav(), 'b.epub'), 'docx');
    expect(docx).toMatchObject({ kind: 'file', fileName: 'Fixture Three.docx' });
    if (docx.kind !== 'file') throw new Error('expected a file');
    expect(docx.blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect((await fromDocx(await bytesOf(docx.blob))).chapters).toHaveLength(3);
  });

  it('converts an EPUB to Markdown, text and HTML with their MIME types', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    const expected = {
      md: 'text/markdown;charset=utf-8',
      txt: 'text/plain;charset=utf-8',
      html: 'text/html;charset=utf-8',
    } as const;
    for (const [target, type] of Object.entries(expected) as [keyof typeof expected, string][]) {
      const out = await convertBook(book, target);
      if (out.kind !== 'file') throw new Error('expected a file');
      expect(out.fileName).toBe(`Fixture Three.${target}`);
      expect(out.blob.type).toBe(type);
      expect(new TextDecoder().decode(await bytesOf(out.blob))).toContain('Chapter Two');
    }
  });

  it('turns a text file into an EPUB with the metadata given', async () => {
    const epub = await convert(f(enc('CHAPTER I\n\nHi.'), 'night.txt'), 'epub', {
      title: 'Night',
      author: 'Ada Example',
    });
    if (epub.kind !== 'file') throw new Error('expected a file');
    expect(epub.fileName).toBe('Night.epub');
    expect(epub.blob.type).toBe('application/epub+zip');
    const book = await readEpub(await bytesOf(epub.blob));
    expect(book.meta.title).toBe('Night');
    expect(book.meta.authors).toEqual(['Ada Example']);
  });

  it('falls back to the file name and an unknown author when no metadata is given', async () => {
    const untitled = await convert(f(enc('Hi.'), 'notes.txt'), 'epub');
    expect(untitled.kind === 'file' && untitled.fileName).toBe('notes.epub');
    if (untitled.kind !== 'file') throw new Error('expected a file');
    const book = await readEpub(await bytesOf(untitled.blob));
    expect(book.meta).toMatchObject({ title: 'notes', authors: ['Unknown'] });

    const md = await convert(f(enc('# One\n\nText.'), 'draft.v2.md'), 'epub');
    expect(md.kind === 'file' && md.fileName).toBe('draft.v2.epub');
    const fromFront = await convert(f(enc('---\ntitle: Front\n---\n# One'), 'x.md'), 'epub');
    expect(fromFront.kind === 'file' && fromFront.fileName).toBe('Front.epub');
  });

  it('converts a Word document to an EPUB', async () => {
    const epub = await convert(f(DOCX.basic(), 'basic.docx'), 'epub');
    if (epub.kind !== 'file') throw new Error('expected a file');
    expect((await readEpub(await bytesOf(epub.blob))).chapters.length).toBeGreaterThan(0);
  });

  it('prepares a print view for PDF', async () => {
    const pdf = await convert(f(EPUB.epub3Nav(), 'b.epub'), 'pdf');
    expect(pdf.kind === 'print' && pdf.html.includes('@page')).toBe(true);
  });

  it('makes safe file names', () => {
    expect(outputFileName('A/B: C?', 'epub')).toBe('A-B- C-.epub');
    expect(outputFileName('   ', 'txt')).toBe('book.txt');
    expect(outputFileName('a\u0007b  \n c', 'md')).toBe('a-b c.md');
    expect(outputFileName('x'.repeat(150), 'html')).toBe('x'.repeat(100) + '.html');
  });

  it('rejects protected books and formats it cannot read', async () => {
    await expect(convert(f(EPUB.drmAdept(), 'd.epub'), 'docx')).rejects.toBeInstanceOf(
      DrmProtectedError,
    );
    await expect(convert(f(OTHER.legacyDoc(), 'old.doc'), 'epub')).rejects.toMatchObject({
      format: 'doc',
    });
    await expect(inspect(f(OTHER.legacyDoc(), 'old.doc'))).rejects.toBeInstanceOf(
      UnsupportedFormatError,
    );
  });
});
