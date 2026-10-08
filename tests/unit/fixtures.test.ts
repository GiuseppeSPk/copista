import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { DOCX, EPUB, OTHER } from '../fixtures/catalog';
import { makePng } from '../fixtures/png';

describe('fixtures', () => {
  it('builds every fixture', () => {
    for (const build of [...Object.values(EPUB), ...Object.values(DOCX), ...Object.values(OTHER)]) {
      expect(build().length).toBeGreaterThan(0);
    }
  });

  it('builds the same bytes whatever the clock says', () => {
    vi.useFakeTimers({ now: new Date(2026, 0, 1, 12, 0, 0) });
    const first = EPUB.epub3Nav();
    vi.setSystemTime(new Date(2026, 5, 1, 9, 30, 7));
    const second = EPUB.epub3Nav();
    vi.useRealTimers();
    expect(second).toEqual(first);
  });

  it('puts mimetype first in a normal EPUB', () => {
    expect(Object.keys(unzipSync(EPUB.epub3Nav()))[0]).toBe('mimetype');
  });

  it('keeps odd file names verbatim', () => {
    expect(Object.keys(unzipSync(EPUB.oddNames()))).toContain('OEBPS/Text Files/capítulo 1.xhtml');
  });

  it('makes a PNG with the requested size', () => {
    const png = makePng(4, 2);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(new DataView(png.buffer, png.byteOffset).getUint32(16)).toBe(4);
    expect(new DataView(png.buffer, png.byteOffset).getUint32(20)).toBe(2);
  });
});
