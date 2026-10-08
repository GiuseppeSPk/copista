import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { detectDrm } from '../../../../src/core/epub/drm';
import { openZip, readText } from '../../../../src/core/epub/zip';
import { MalformedBookError, NotAnEpubError } from '../../../../src/core/errors';
import { EPUB, OTHER } from '../../../fixtures/catalog';
import { encryption, epubZip } from '../../../fixtures/epub-builder';

describe('openZip', () => {
  it('rejects data that is not a zip', () => {
    expect(() => openZip(OTHER.notAZip())).toThrow(NotAnEpubError);
    expect(() => openZip(OTHER.pdf())).toThrow(NotAnEpubError);
    expect(() => openZip(new Uint8Array())).toThrow(NotAnEpubError);
  });

  /** A stored archive whose headers claim each entry unpacks to `claimed` bytes. */
  function forgedZip(names: string[], claimed: number): Uint8Array {
    const zip = zipSync(
      Object.fromEntries(names.map((name) => [name, [strToU8('x'), { level: 0 }]])),
    );
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    for (let at = 0; at + 4 <= zip.length; at++) {
      const signature = view.getUint32(at, true);
      if (signature === 0x04034b50) view.setUint32(at + 22, claimed, true);
      if (signature === 0x02014b50) view.setUint32(at + 24, claimed, true);
    }
    return zip;
  }

  it('refuses an archive that would unpack to more than the limits', () => {
    expect(() => openZip(forgedZip(['a.bin'], 300 * 1024 * 1024))).toThrow(MalformedBookError);
    const many = Array.from({ length: 6 }, (_, i) => `part${i}.bin`);
    expect(() => openZip(forgedZip(many, 190 * 1024 * 1024))).toThrow(MalformedBookError);
    expect(readText(openZip(forgedZip(['a.bin'], 1)), 'a.bin')).toBe('x');
  });

  it('reads UTF-8 and UTF-16 text and strips the byte order mark', () => {
    const zip = openZip(
      epubZip({
        'a.txt': new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]),
        'b.txt': new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]),
        'c.txt': 'caffè',
      }),
    );
    expect(readText(zip, 'a.txt')).toBe('hi');
    expect(readText(zip, 'b.txt')).toBe('hi');
    expect(readText(zip, 'c.txt')).toBe('caffè');
    expect(readText(zip, 'missing.txt')).toBeUndefined();
  });
});

describe('detectDrm', () => {
  it('follows the rules of spec 6.4', () => {
    expect(detectDrm(openZip(EPUB.drmAdept()))).toEqual({ protected: true, scheme: 'adobe-adept' });
    expect(detectDrm(openZip(EPUB.drmFairplay()))).toEqual({
      protected: true,
      scheme: 'apple-fairplay',
    });
    expect(detectDrm(openZip(EPUB.drmEncryption()))).toEqual({
      protected: true,
      scheme: 'unknown-encryption',
    });
    expect(detectDrm(openZip(EPUB.fontObfuscation()))).toEqual({
      protected: false,
      obfuscatedFonts: ['OEBPS/fonts/obf.otf'],
    });
    expect(detectDrm(openZip(EPUB.epub3Nav()))).toEqual({ protected: false, obfuscatedFonts: [] });
  });

  it('decodes percent-encoded cipher references and accepts the Adobe font algorithm', () => {
    const zip = openZip(
      epubZip({
        'META-INF/encryption.xml': encryption([
          { uri: 'OEBPS/fonts/My%20Font.otf', algorithm: 'http://ns.adobe.com/pdf/enc#RC' },
        ]),
      }),
    );
    expect(detectDrm(zip)).toEqual({
      protected: false,
      obfuscatedFonts: ['OEBPS/fonts/My Font.otf'],
    });
  });

  it('treats an unreadable encryption.xml as protected', () => {
    const zip = openZip(epubZip({ 'META-INF/encryption.xml': '<encryption><unclosed' }));
    expect(detectDrm(zip)).toEqual({ protected: true, scheme: 'unknown-encryption' });
  });
});
