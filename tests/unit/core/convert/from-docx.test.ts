import { describe, expect, it } from 'vitest';
import { fromDocx } from '../../../../src/core/convert/from-docx';
import { MalformedBookError } from '../../../../src/core/errors';
import { DOCX, EPUB } from '../../../fixtures/catalog';

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

  it('names a document without metadata after its file', async () => {
    const plain = await fromDocx(DOCX.noHeadings(), { fileName: 'Report.docx' });
    expect(plain.meta.title).toBe('Report');
    expect(plain.chapters).toHaveLength(1);
  });

  it('rejects a zip that is not a Word document', async () => {
    await expect(fromDocx(EPUB.zipNotEpub())).rejects.toBeInstanceOf(MalformedBookError);
  });
});
