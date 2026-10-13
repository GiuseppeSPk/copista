import { describe, expect, it } from 'vitest';
import { fromDocx } from '../../../../src/core/convert/from-docx';
import { MalformedBookError } from '../../../../src/core/errors';
import { DOCX, EPUB } from '../../../fixtures/catalog';
import { docxZip, footnoteRef, paragraph, run } from '../../../fixtures/docx-builder';

describe('fromDocx', () => {
  it('turns a Word document into chapters, images and metadata', async () => {
    const b = await fromDocx(DOCX.basic());
    expect(b.meta).toMatchObject({ title: 'Docx Fixture', authors: ['Ada Example'] });
    expect(b.chapters.map((c) => c.title)).toEqual(['Part One', 'Part Two']);
    const h = b.chapters[0]!.html;
    for (const s of [
      '<strong>bold</strong>',
      '<em>italic</em>',
      '<ul><li>first</li><li>second</li></ul>',
      '<ol><li>one</li><li>two</li></ol>',
      '<table',
    ])
      expect(h).toContain(s);
    const src = /src="([^"]+)"/.exec(h)![1]!;
    expect(b.resources.get(src)).toMatchObject({ mediaType: 'image/png' });
  });

  it('keeps quotations, underlining and footnote marks', async () => {
    const b = await fromDocx(
      docxZip({
        body:
          paragraph(run('Said')) +
          paragraph(run('To be or not.'), 'Quote') +
          paragraph(run('Loud.'), 'IntenseQuote') +
          paragraph(run('A ') + run('marked', { underline: true }) + run(' word') + footnoteRef(1)),
        footnotes: { 1: paragraph(run('The note.')) },
      }),
    );
    const h = b.chapters[0]!.html;
    // Quotation paragraphs in a row are one quotation.
    expect(h).toContain('<p>Said</p><blockquote><p>To be or not.</p><p>Loud.</p></blockquote>');
    expect(h).toContain(
      'A <u>marked</u> word<sup><a href="text/c001.xhtml#footnote-1" id="footnote-ref-1">[1]</a></sup>',
    );
    expect(h).toContain('The note.');
  });

  it('names a document without metadata after its file', async () => {
    const plain = await fromDocx(DOCX.noHeadings(), { fileName: 'Report.docx' });
    expect(plain.meta.title).toBe('Report');
    expect(plain.chapters).toHaveLength(1);
  });

  it('rejects a zip that is not a Word document', async () => {
    await expect(fromDocx(EPUB.zipNotEpub())).rejects.toBeInstanceOf(MalformedBookError);
  });
});
