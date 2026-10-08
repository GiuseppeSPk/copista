import { describe, expect, it } from 'vitest';
import { bookFromSections } from '../../../src/core/convert/build';
import { readEpub } from '../../../src/core/epub/read';
import type { Resource } from '../../../src/core/model/book';
import { ResourceUrls } from '../../../src/reader/resources';
import { EPUB } from '../../fixtures/catalog';

function recorder() {
  const created: Blob[] = [];
  const revoked: string[] = [];
  const create = (blob: Blob) => {
    created.push(blob);
    return `blob:test/${created.length}`;
  };
  const blobOf = (url: string) => created[Number(url.split('/')[1]) - 1]!;
  return { created, revoked, create, revoke: (url: string) => revoked.push(url), blobOf };
}

const css = (href: string, text: string): [string, Resource] => [
  href,
  { href, mediaType: 'text/css', data: new TextEncoder().encode(text) },
];

describe('ResourceUrls', () => {
  it('serves each resource once and revokes every URL on dispose', async () => {
    const book = await readEpub(EPUB.epub3Nav());
    const { created, revoked, create, revoke, blobOf } = recorder();
    const urls = new ResourceUrls(book, create, revoke);
    const img = urls.urlFor('OEBPS/images/cover.png');
    expect(img).toMatch(/^blob:test\/\d+$/);
    expect(urls.urlFor('OEBPS/images/cover.png')).toBe(img);
    expect(urls.urlFor('missing.png')).toBeNull();
    const sheet = blobOf(urls.urlFor('OEBPS/css/book.css')!);
    expect(sheet.type).toBe('text/css');
    expect(await sheet.text()).toMatch(/url\("blob:test\/\d+"\)/);
    urls.dispose();
    expect(revoked).toHaveLength(created.length);
    expect(new Set(revoked).size).toBe(created.length);
  });

  it('rewrites missing references to about:invalid and survives import cycles', async () => {
    const book = bookFromSections(
      [{ html: '<p>x</p>' }],
      { title: 'Cycle', author: 'Ada Example' },
      new Map([
        css('a.css', '@import url("b.css"); p { background: url("gone.png") }'),
        css('b.css', '@import url("a.css");'),
      ]),
    );
    const { create, blobOf } = recorder();
    const urls = new ResourceUrls(book, create, () => {});
    const a = await blobOf(urls.urlFor('a.css')!).text();
    expect(a).toMatch(/@import url\("blob:test\/\d+"\)/);
    expect(a).toContain('url("about:invalid")');
    expect(await blobOf(urls.urlFor('b.css')!).text()).toContain('about:invalid');
  });
});
