import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('parses namespaced XML', () => {
    const doc = new DOMParser().parseFromString(
      '<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>T</dc:title></metadata></package>',
      'application/xml',
    );
    expect(
      doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]?.textContent,
    ).toBe('T');
  });

  it('reports malformed XML with a parsererror element', () => {
    const doc = new DOMParser().parseFromString('<a><b></a>', 'application/xml');
    expect(doc.getElementsByTagName('parsererror').length).toBeGreaterThan(0);
  });

  it('has WebCrypto, Blob and File', async () => {
    expect(typeof crypto.subtle.digest).toBe('function');
    expect(await new Blob(['x']).text()).toBe('x');
    expect(new Uint8Array(await new File([new Uint8Array([1])], 'a').arrayBuffer())).toEqual(
      new Uint8Array([1]),
    );
  });
});
