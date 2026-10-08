import { describe, expect, it } from 'vitest';
import { relativeHref, resolveHref } from '../../../src/core/paths';

describe('resolveHref', () => {
  it('resolves relative paths and decodes percent-encoding', () => {
    expect(resolveHref('OEBPS/text/ch1.xhtml', '../images/a%20b.png')).toEqual({
      path: 'OEBPS/images/a b.png',
    });
    expect(resolveHref('content.opf', 'Caf%C3%A9/%C3%A0.xhtml')).toEqual({ path: 'Café/à.xhtml' });
    expect(resolveHref('a/b.xhtml', '50%25.xhtml')).toEqual({ path: 'a/50%.xhtml' });
  });

  it('keeps a segment literal when it is not valid percent-encoding', () => {
    expect(resolveHref('a/b.xhtml', 'bad%zz.png')).toEqual({ path: 'a/bad%zz.png' });
  });

  it('splits off the fragment', () => {
    expect(resolveHref('OEBPS/text/ch1.xhtml', 'ch2.xhtml#sec-2')).toEqual({
      path: 'OEBPS/text/ch2.xhtml',
      fragment: 'sec-2',
    });
    expect(resolveHref('OEBPS/text/ch1.xhtml', '#note')).toEqual({
      path: 'OEBPS/text/ch1.xhtml',
      fragment: 'note',
    });
  });

  it('drops the query, clamps at the root and strips a leading slash', () => {
    expect(resolveHref('a/b.xhtml', 'img.png?v=2')).toEqual({ path: 'a/img.png' });
    expect(resolveHref('a/b.xhtml', '../../../x.png')).toEqual({ path: 'x.png' });
    expect(resolveHref('a/b.xhtml', '/root.png')).toEqual({ path: 'root.png' });
  });

  it('returns null for external references', () => {
    for (const ext of [
      'https://example.org/x',
      'mailto:a@b.c',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
    ]) {
      expect(resolveHref('a.xhtml', ext)).toBeNull();
    }
  });
});

describe('relativeHref', () => {
  it('builds an encoded relative path between two book files', () => {
    expect(relativeHref('EPUB/text/c001.xhtml', 'EPUB/res/a b.png')).toBe('../res/a%20b.png');
    expect(relativeHref('EPUB/text/c001.xhtml', 'EPUB/text/c002.xhtml')).toBe('c002.xhtml');
    expect(relativeHref('EPUB/content.opf', 'EPUB/text/c001.xhtml')).toBe('text/c001.xhtml');
  });
});
