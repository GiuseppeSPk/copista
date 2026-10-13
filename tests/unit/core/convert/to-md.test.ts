import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../../../../src/core/convert/from-md';
import { toMarkdown } from '../../../../src/core/convert/to-md';
import { readEpub } from '../../../../src/core/epub/read';
import { writeEpub } from '../../../../src/core/epub/write';
import { EPUB } from '../../../fixtures/catalog';

const enc = (s: string) => new TextEncoder().encode(s);

describe('toMarkdown', () => {
  it('survives a Markdown to EPUB to Markdown round trip', async () => {
    const src = '# One\n\nHello **bold** and *it*.\n\n## Sub\n\n- a\n- b\n\n# Two\n\nEnd.';
    const back = toMarkdown(
      await readEpub(
        writeEpub(await fromMarkdown(enc(src), { title: 'RT', author: 'Ada Example' })),
      ),
    );
    expect(back.startsWith('---\ntitle: RT\nauthor: Ada Example\nlanguage: en\n---\n')).toBe(true);
    expect(back.match(/^#{1,2} .+$/gm)).toEqual(['# One', '## Sub', '# Two']);
    expect(back).toContain('Hello **bold** and *it*.');
    expect(back).toMatch(/^-\s+a$/m);
    expect((await fromMarkdown(enc(back), {})).meta.title).toBe('RT');
  });

  it('turns images into labels and internal links into their text', async () => {
    const md = toMarkdown(await readEpub(EPUB.epub3Nav()));
    expect(md).toContain('[Image: Cover]');
    expect(md).toContain('Read on to the next part, or see [ext](https://example.org/).');
    expect(md).not.toContain('xhtml');
    expect(md.endsWith('The end.\n')).toBe(true);
  });

  it('writes a simple table as a pipe table and keeps any other as HTML', async () => {
    const book = await fromMarkdown(enc('# T\n\nx'), { title: 'T' });
    book.chapters[0]!.html =
      '<table><tr><th>Name</th><th>Note</th></tr>' +
      '<tr><td><p>Pin <b>occhio</b> <img width="20" alt="badge"></p></td><td>a | b</td></tr>' +
      '<tr><td>alone</td></tr></table>' +
      '<table><tr><td colspan="2"><a href="c2.xhtml">wide</a></td></tr></table>';
    const md = toMarkdown(book);
    expect(md).toContain(
      '| Name | Note |\n| --- | --- |\n| Pin **occhio** | a \\| b |\n| alone |  |\n\n<table>',
    );
    expect(md).toContain('<td colspan="2">wide</td>');
    const back = (await fromMarkdown(enc(md), {})).chapters[0]!.html;
    expect(back).toMatch(/<th>Name<\/th>/);
    expect(back).toMatch(/<td>a \| b<\/td>/);
  });

  it('leaves out rows, columns and links that hold nothing but an icon', async () => {
    const book = await fromMarkdown(enc('# T\n\nx'), { title: 'T' });
    const icon = '<a href="https://e.invalid/i"><img width="16" alt="i"></a>';
    book.chapters[0]!.html =
      `<p>${icon} Done.</p><table><tr><td>${icon}</td></tr>` +
      `<tr><td>${icon}</td><td>Recited</td></tr></table><table><tr><td>${icon}</td></tr></table>`;
    expect(toMarkdown(book).endsWith('\n\nDone.\n\n| Recited |\n| --- |\n')).toBe(true);
  });
});
