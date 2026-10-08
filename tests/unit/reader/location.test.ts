import { describe, expect, it } from 'vitest';
import { readEpub } from '../../../src/core/epub/read';
import {
  bookPercent,
  chapterForHref,
  clampPosition,
  fractionForPage,
  pageForFraction,
} from '../../../src/reader/location';
import { EPUB } from '../../fixtures/catalog';

describe('reading positions', () => {
  it('maps every page to a fraction and back', () => {
    for (let n = 1; n <= 200; n++)
      for (let p = 0; p < n; p++) expect(pageForFraction(fractionForPage(p, n), n)).toBe(p);
  });

  it('keeps out-of-range fractions on a real page', () => {
    expect(pageForFraction(1, 10)).toBe(9);
    expect(pageForFraction(-0.2, 10)).toBe(0);
    expect(pageForFraction(Number.NaN, 10)).toBe(0);
    expect(pageForFraction(0.5, 0)).toBe(0);
  });

  it('weights the book percentage by chapter length', () => {
    expect(bookPercent({ spineIndex: 1, fraction: 0.5 }, [100, 100, 200])).toBe(38);
    expect(bookPercent({ spineIndex: 2, fraction: 1 }, [100, 100, 200])).toBe(100);
    expect(bookPercent({ spineIndex: 0, fraction: 0 }, [])).toBe(0);
    expect(bookPercent({ spineIndex: 1, fraction: 0.5 }, [0, 0])).toBe(75);
  });

  it('clamps positions into the book', () => {
    expect(clampPosition({ spineIndex: 9, fraction: 2 }, 3)).toEqual({
      spineIndex: 2,
      fraction: 1,
    });
    expect(clampPosition({ spineIndex: -1, fraction: -1 }, 3)).toEqual({
      spineIndex: 0,
      fraction: 0,
    });
    expect(clampPosition({ spineIndex: Number.NaN, fraction: Number.NaN }, 3)).toEqual({
      spineIndex: 0,
      fraction: 0,
    });
  });

  it('finds the chapter a link points to', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    expect(chapterForHref(book, 'OEBPS/text/ch3.xhtml#end')).toEqual({
      spineIndex: 2,
      fragment: 'end',
    });
    expect(chapterForHref(book, 'OEBPS/text/ch1.xhtml')).toEqual({ spineIndex: 0 });
    expect(chapterForHref(book, 'OEBPS/text/nope.xhtml')).toBeNull();
  });
});
