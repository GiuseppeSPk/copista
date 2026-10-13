import { describe, expect, it } from 'vitest';
import {
  fromMarkdown,
  parseFrontMatter,
  picturesNamed,
} from '../../../../src/core/convert/from-md';

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

  it('takes the pictures it names from the files chosen with it', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const m = await fromMarkdown(
      enc(
        '![a](illustrazione.png) ![b](img/Illustrazione.PNG) ' +
          '<img src="./my%20pic.jpg" alt="c"> ![d](missing.png)',
      ),
      { title: 'T' },
      [
        { name: 'illustrazione.png', data: png },
        { name: 'my pic.jpg', data: png },
        { name: 'unused.gif', data: png },
      ],
    );
    const html = m.chapters[0]!.html;
    expect(html.match(/src="images\/pic001\.png"/g)).toHaveLength(2);
    expect(html).toContain('src="images/pic002.jpg"');
    expect(html).not.toContain('missing.png');
    expect([...m.resources.keys()]).toEqual(['images/pic001.png', 'images/pic002.jpg']);
    expect(m.resources.get('images/pic002.jpg')).toMatchObject({ mediaType: 'image/jpeg' });
  });

  it('points fragment links at the chapter that holds the target', async () => {
    const m = await fromMarkdown(
      enc('# One\n\nSee <a href="#n1">note</a>.\n\n# Two\n\n<p id="n1">The note.</p>\n'),
      {},
    );
    expect(m.chapters[0]!.html).toContain('<a href="text/c002.xhtml#n1">note</a>');
  });

  it('turns footnotes into numbered notes at the end, linked both ways', async () => {
    const m = await fromMarkdown(
      enc(
        '# One\n\nFirst[^a] and second.[^b] Again[^a].\n\n`code [^a]`\n\n' +
          '[^b]: The *second* note,\n    on two lines.\n\n# Two\n\nEnd.\n\n[^a]: The first note.\n',
      ),
      {},
    );
    const [one, two] = m.chapters.map((c) => c.html);
    expect(one).toContain(
      'First<sup><a href="text/c002.xhtml#footnote-1" id="footnote-ref-1">[1]</a></sup> and second.' +
        '<sup><a href="text/c002.xhtml#footnote-2" id="footnote-ref-2">[2]</a></sup>' +
        ' Again<sup><a href="text/c002.xhtml#footnote-1">[1]</a></sup>.',
    );
    expect(one).toContain('<code>code [^a]</code>');
    expect(one).not.toContain('second</em> note');
    expect(two).toContain(
      '<ol class="footnotes"><li id="footnote-1"><p>The first note. ' +
        '<a href="text/c001.xhtml#footnote-ref-1">↑</a></p></li>' +
        '<li id="footnote-2"><p>The <em>second</em> note,\non two lines. ' +
        '<a href="text/c001.xhtml#footnote-ref-2">↑</a></p></li></ol>',
    );
  });

  it('leaves a footnote mark with no note as it is', async () => {
    const m = await fromMarkdown(enc('Text[^x].'), { title: 'T' });
    expect(m.chapters[0]!.html).toContain('Text[^x].');
  });

  it('shows task list boxes as ticked or empty marks', async () => {
    const m = await fromMarkdown(enc('- [ ] To buy\n- [x] Bought\n'), { title: 'T' });
    expect(m.chapters[0]!.html).toContain('<li>☐ To buy</li>');
    expect(m.chapters[0]!.html).toContain('<li>☑ Bought</li>');
  });
});

describe('picturesNamed', () => {
  it('lists the pictures a Markdown file names by a relative path', () => {
    expect(
      picturesNamed(
        enc(
          '![a](img/x.png) ![b](https://e.invalid/y.png) ![c](data:image/png;base64,AA==) ' +
            '![again](x.png) <img src="my%20pic.jpg">',
        ),
      ),
    ).toEqual(['x.png', 'my pic.jpg']);
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
