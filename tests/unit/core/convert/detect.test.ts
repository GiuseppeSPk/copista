import { describe, expect, it } from 'vitest';
import { detectFormat } from '../../../../src/core/convert/detect';
import { DOCX, EPUB, OTHER } from '../../../fixtures/catalog';

const enc = (s: string) => new TextEncoder().encode(s);

describe('detectFormat', () => {
  it('recognises EPUB and .docx by their contents, not their names', () => {
    expect(detectFormat(EPUB.epub3Nav(), 'x.bin')).toBe('epub');
    expect(detectFormat(DOCX.basic(), 'x.zip')).toBe('docx');
  });

  it('recognises Markdown by extension and anything else readable as text', () => {
    expect(detectFormat(enc('# Hi'), 'notes.markdown')).toBe('md');
    expect(detectFormat(enc('# Hi'), 'NOTES.MD')).toBe('md');
    expect(detectFormat(enc('plain'), 'notes')).toBe('txt');
    expect(detectFormat(new Uint8Array([0xff, 0xfe, 0x41, 0x00]), 'u16.txt')).toBe('txt');
  });

  it('names the formats it cannot convert', () => {
    expect(() => detectFormat(OTHER.legacyDoc(), 'old.doc')).toThrow(
      expect.objectContaining({ format: 'doc' }),
    );
    expect(() => detectFormat(OTHER.pdf(), 'a.pdf')).toThrow(
      expect.objectContaining({ format: 'pdf' }),
    );
    expect(() => detectFormat(EPUB.zipNotEpub(), 'a.zip')).toThrow(
      expect.objectContaining({ format: 'zip' }),
    );
    expect(() => detectFormat(new Uint8Array([0x89, 0x50, 0x00, 0x00]), 'a.png')).toThrow(
      expect.objectContaining({ format: 'unknown' }),
    );
  });
});
