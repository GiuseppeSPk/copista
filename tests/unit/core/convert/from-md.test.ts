import { describe, expect, it } from 'vitest';
import { fromMarkdown, parseFrontMatter } from '../../../../src/core/convert/from-md';

const enc = (s: string) => new TextEncoder().encode(s);

describe('fromMarkdown', () => {
  it('splits at level-one headings and sanitizes the result', async () => {
    const m = await fromMarkdown(
      enc(
        '# One\n\nHello *there*.\n\n![pic](https://e.invalid/p.png)\n\n# Two\n\n- a\n- b\n\n<script>x</script>',
      ),
      { title: 'M', author: 'A' },
    );
    expect(m.chapters.map((c) => c.title)).toEqual(['One', 'Two']);
    expect(m.chapters[0]!.html).toContain('<em>there</em>');
    expect(m.chapters[0]!.html).not.toContain('e.invalid');
    expect(m.chapters[1]!.html).toContain('<li>a</li>');
    expect(m.chapters[1]!.html).not.toContain('<script');
  });

  it('splits at level-two headings when there is no level-one heading', async () => {
    const m = await fromMarkdown(enc('## A\n\nx\n\n## B\n\ny'), { title: 'M', author: 'A' });
    expect(m.chapters.map((c) => c.title)).toEqual(['A', 'B']);
    expect(m.chapters[0]!.html).toMatch(/^<h2[^>]*>A<\/h2>/);
  });

  it('takes missing metadata from the front matter, then from defaults', async () => {
    const fm = await fromMarkdown(
      enc('---\ntitle: From Front\nauthor: Bo Sample\n---\n# One\n\nx'),
      {},
    );
    expect(fm.meta).toMatchObject({ title: 'From Front', authors: ['Bo Sample'] });
    expect(fm.chapters[0]!.html).not.toContain('From Front');
    const given = await fromMarkdown(enc('---\ntitle: Ignored\n---\nx'), { title: 'Given' });
    expect(given.meta).toMatchObject({ title: 'Given', authors: ['Unknown'] });
    const bare = await fromMarkdown(enc('x'), {});
    expect(bare.meta.title).toBe('Untitled');
  });

  it('moves inline images into the book and drops images it cannot carry', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const m = await fromMarkdown(
      enc(
        `# P\n\n![dot](${png}) ![again](${png}) ![local](pic.png) ![bmp](data:image/bmp;base64,Qk0=)`,
      ),
      { title: 'M', author: 'A' },
    );
    const html = m.chapters[0]!.html;
    expect(html.match(/<img [^>]*src="images\/img001\.png"/g)).toHaveLength(2);
    expect(html).not.toContain('pic.png');
    expect(html).not.toContain('bmp');
    expect([...m.resources.keys()]).toEqual(['images/img001.png']);
    expect(m.resources.get('images/img001.png')).toMatchObject({
      mediaType: 'image/png',
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
  });

  it('points fragment links at the chapter that holds the target', async () => {
    const m = await fromMarkdown(
      enc('# One\n\nSee <a href="#n1">note</a>.\n\n# Two\n\n<p id="n1">The note.</p>\n'),
      {},
    );
    expect(m.chapters[0]!.html).toContain('<a href="text/c002.xhtml#n1">note</a>');
  });
});

describe('parseFrontMatter', () => {
  it('reads key: value lines and leaves the body', () => {
    expect(parseFrontMatter('---\ntitle: A: B\nlanguage: fr\n---\nBody')).toEqual({
      fields: { title: 'A: B', language: 'fr' },
      body: 'Body',
    });
    expect(parseFrontMatter('No front matter\n---\n')).toEqual({
      fields: {},
      body: 'No front matter\n---\n',
    });
  });
});
