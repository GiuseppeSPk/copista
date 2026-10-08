import { describe, expect, it } from 'vitest';
import { mapCssUrls, mapHtmlRefs } from '../../../src/core/refs';

const k = (r: string): string => (r.includes(':') ? r : 'K/' + r);

describe('mapHtmlRefs', () => {
  it('rewrites src and href', () => {
    expect(
      mapHtmlRefs(
        '<p><img src="a.png"><a href="b.xhtml#x">b</a><a href="https://e.org">e</a></p>',
        k,
      ),
    ).toBe('<p><img src="K/a.png"><a href="K/b.xhtml#x">b</a><a href="https://e.org">e</a></p>');
  });

  it('removes the attribute when the mapper returns null', () => {
    expect(mapHtmlRefs('<img src="x.png" alt="x">', () => null)).toBe('<img alt="x">');
  });

  it('rewrites each srcset candidate', () => {
    expect(mapHtmlRefs('<img srcset="a.png 1x, b.png 2x">', k)).toBe(
      '<img srcset="K/a.png 1x, K/b.png 2x">',
    );
  });

  it('rewrites xlink:href in SVG', () => {
    expect(mapHtmlRefs('<svg><image xlink:href="c.jpg"></image></svg>', k)).toContain(
      'xlink:href="K/c.jpg"',
    );
  });
});

describe('mapCssUrls', () => {
  it('rewrites url() in every quote style', () => {
    expect(
      mapCssUrls('a{background:url(\'i.png\')} @font-face{src:url(f.otf) format("opentype")}', k),
    ).toBe('a{background:url("K/i.png")} @font-face{src:url("K/f.otf") format("opentype")}');
  });

  it('rewrites @import with a bare string', () => {
    expect(mapCssUrls('@import "s.css";', k)).toBe('@import url("K/s.css");');
  });

  it('neutralizes a url the mapper rejects', () => {
    expect(mapCssUrls('a{background:url(http://e.org/x.png)}', () => null)).toBe(
      'a{background:url("about:invalid")}',
    );
  });
});
