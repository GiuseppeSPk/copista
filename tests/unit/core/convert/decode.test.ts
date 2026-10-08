import { describe, expect, it } from 'vitest';
import { decodeText } from '../../../../src/core/convert/decode';

const enc = (s: string) => new TextEncoder().encode(s);

describe('decodeText', () => {
  it('honours a UTF-8 byte order mark', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x43, 0x61, 0x66, 0xc3, 0xa9]))).toBe(
      'Café',
    );
  });

  it('falls back to Windows-1252 when the bytes are not UTF-8', () => {
    expect(decodeText(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x71, 0x94]))).toBe(
      'Café “q”',
    );
  });

  it('decodes UTF-16 in both byte orders', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x43, 0x00, 0xe9, 0x00]))).toBe('Cé');
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x43, 0x00, 0xe9]))).toBe('Cé');
  });

  it('turns every line ending into a newline', () => {
    expect(decodeText(enc('a\r\nb\rc'))).toBe('a\nb\nc');
  });
});
