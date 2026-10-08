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
});
