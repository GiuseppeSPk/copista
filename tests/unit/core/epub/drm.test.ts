import { describe, expect, it } from 'vitest';
import { detectDrm } from '../../../../src/core/epub/drm';
import { openZip, readText } from '../../../../src/core/epub/zip';
import { NotAnEpubError } from '../../../../src/core/errors';
import { EPUB, OTHER } from '../../../fixtures/catalog';
import { encryption, epubZip } from '../../../fixtures/epub-builder';

describe('openZip', () => {
  it('rejects data that is not a zip', () => {
    expect(() => openZip(OTHER.notAZip())).toThrow(NotAnEpubError);
    expect(() => openZip(OTHER.pdf())).toThrow(NotAnEpubError);
    expect(() => openZip(new Uint8Array())).toThrow(NotAnEpubError);
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
