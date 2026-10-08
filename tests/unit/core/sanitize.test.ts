import { describe, expect, it } from 'vitest';
import { sanitizeCss, sanitizeHtml } from '../../../src/core/sanitize';

describe('sanitizeHtml', () => {
  it('keeps content and removes everything active or external', () => {
    const dirty =
      '<p>Safe text survives</p><script>window.__pwned=1</script><img src="OEBPS/x.png" onerror="window.__pwned=2">' +
      '<a href="javascript:alert(1)">j</a><img src="https://tracker.invalid/p.png" alt="t"><form action="https://e.invalid"><input></form>' +
      '<iframe src="https://e.invalid"></iframe><object data="x"></object><style>p{}</style>' +
      '<p style="color:red;background:url(https://e.invalid/s.png)">s</p><a href="https://example.org/">ext</a>' +
      '<img src="data:image/png;base64,iVBORw0KGgo="><aside epub:type="footnote" id="n1">note</aside>' +
      '<svg><use xlink:href="https://e.invalid/a.svg#x"></use></svg>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain('<p>Safe text survives</p>');
    for (const bad of [
      '<script',
      'onerror',
      'javascript:',
      'tracker.invalid',
      '<form',
      '<input',
      '<iframe',
      '<object',
      '<style',
      'e.invalid',
    ]) {
      expect(clean).not.toContain(bad);
    }
    expect(clean).toContain('<img src="OEBPS/x.png">');
    expect(clean).toContain('<img alt="t">');
    expect(clean).toContain('href="https://example.org/"');
    expect(clean).toContain('color:red');
    expect(clean).toContain('src="data:image/png;base64,');
    expect(clean).toContain('epub:type="footnote"');
  });

  it('treats protocol-relative and odd-scheme references as external', () => {
    const clean = sanitizeHtml(
      '<img src="//e.invalid/a.png" alt="a"><img src="\\\\e.invalid\\b.png" alt="b">' +
        '<img srcset="OEBPS/s.png 1x, https://e.invalid/s.png 2x" alt="c">' +
        '<a href="ftp://e.invalid/f">f</a><a href="OEBPS/ch2.xhtml#n1">n</a><a href="mailto:a@example.org">m</a>',
    );
    expect(clean).not.toContain('e.invalid');
    expect(clean).toContain('<img alt="a"><img alt="b"><img alt="c">');
    expect(clean).toContain('href="OEBPS/ch2.xhtml#n1"');
    expect(clean).toContain('href="mailto:a@example.org"');
  });

  it('drops external references from legacy and SVG presentation attributes', () => {
    const clean = sanitizeHtml(
      '<table background="https://e.invalid/t.png"><tr><td background="OEBPS/t.png">t</td></tr></table>' +
        '<svg><rect fill="url(https://e.invalid/p#g)" stroke="url(#local)" ' +
        'filter="u\\72l(https://e.invalid/f)" mask="url( \'https://e.invalid/m\' )"/></svg>' +
        '<p action="https://e.invalid/a">p</p>',
    );
    expect(clean).not.toContain('e.invalid');
    expect(clean).toContain('<td background="OEBPS/t.png">');
    expect(clean).toContain('stroke="url(&quot;#local&quot;)"');
    expect(clean).toContain('<p>p</p>');
  });
});

describe('sanitizeCss', () => {
  it('drops external imports, external urls and script-like properties', () => {
    const css = sanitizeCss(
      '@import url(https://e.invalid/x.css); @import url("OEBPS/css/b.css"); p{color:red} a{width:expression(alert(1));-moz-binding:url(x)}',
    );
    expect(css).not.toContain('e.invalid');
    expect(css).toContain('@import url("OEBPS/css/b.css")');
    expect(css).toContain('p{color:red}');
    for (const bad of ['expression(', '-moz-binding']) expect(css).not.toContain(bad);
  });

  it.each([
    '@import"https://e.invalid/a.css";',
    '@import/**/"https://e.invalid/a.css";',
    '@\\69mport "https://e.invalid/a.css";',
    '@IMPORT url(https://e.invalid/a.css) screen;',
    'p{background:\\75 rl(https://e.invalid/a.png)}',
    'p{background:url("https://e.invalid/a\\".png")}',
    "p{background:image-set('https://e.invalid/a.png' 1x)}",
    'p{background:-webkit-image-set("https://e.invalid/a.png" 1x)}',
    '@font-face{src:src("https://e.invalid/f.woff")}',
    'p{background:url(https\\3a //e.invalid/a.png)}',
    'p{background:url("https\\3a //e.invalid/a.png")}',
    'p{background:url(//e.invalid/a.png)}',
    'p{background:url(/**/https://e.invalid/a.png)}',
  ])('leaves no external reference in %s', (input) => {
    expect(sanitizeCss(input)).not.toContain('e.invalid');
  });

  it('keeps internal references written with comments and escapes', () => {
    const css = sanitizeCss(
      '@import/**/"OEBPS/b.css"; p{b\\61 ckground:url( OEBPS/i.png )/* note */;color:red}',
    );
    expect(css).toContain('@import url("OEBPS/b.css")');
    expect(css).toContain('background:url("OEBPS/i.png")');
    expect(css).toContain('color:red');
    expect(css).not.toContain('note');
  });
});
