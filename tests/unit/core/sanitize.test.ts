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
});
