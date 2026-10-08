import { describe, expect, it } from 'vitest';
import { imageSize } from '../../../../src/core/convert/image-size';
import { makePng } from '../../../fixtures/png';

describe('imageSize', () => {
  it('reads PNG, JPEG and GIF headers', () => {
    expect(imageSize(makePng(4, 2), 'image/png')).toEqual({ width: 4, height: 2 });
    expect(
      imageSize(
        new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40]),
        'image/jpeg',
      ),
    ).toEqual({ width: 64, height: 32 });
    expect(
      imageSize(
        new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x05, 0x00, 0x07, 0x00]),
        'image/gif',
      ),
    ).toEqual({ width: 5, height: 7 });
  });

  it('returns null for data it cannot read', () => {
    expect(imageSize(new Uint8Array([1, 2, 3]), 'image/png')).toBeNull();
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00]), 'image/jpeg')).toBeNull();
    expect(imageSize(makePng(4, 2), 'image/svg+xml')).toBeNull();
  });

  it('skips JPEG segments before the frame header', () => {
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46];
    const sof2 = [0xff, 0xc2, 0x00, 0x11, 0x08, 0x01, 0x00, 0x02, 0x00];
    expect(imageSize(new Uint8Array([0xff, 0xd8, ...app0, ...sof2]), 'image/jpeg')).toEqual({
      width: 512,
      height: 256,
    });
  });
});
