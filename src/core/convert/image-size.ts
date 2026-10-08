export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(data: Uint8Array, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, i) => data[offset + i] === byte);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

function sized(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function pngSize(data: Uint8Array): ImageSize | null {
  if (data.length < 24 || !startsWith(data, PNG_SIGNATURE)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return sized(view.getUint32(16), view.getUint32(20));
}

function gifSize(data: Uint8Array): ImageSize | null {
  if (data.length < 10 || !startsWith(data, ascii('GIF8'))) return null;
  return sized(data[6]! | (data[7]! << 8), data[8]! | (data[9]! << 8));
}

/** Walks the JPEG segments up to the first frame header (SOF0–SOF15). */
function jpegSize(data: Uint8Array): ImageSize | null {
  if (!startsWith(data, [0xff, 0xd8])) return null;
  let pos = 2;
  while (pos + 1 < data.length) {
    if (data[pos] !== 0xff) return null;
    const marker = data[pos + 1]!;
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (pos + 8 >= data.length) return null;
      return sized((data[pos + 7]! << 8) | data[pos + 8]!, (data[pos + 5]! << 8) | data[pos + 6]!);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      pos += 2;
      continue;
    }
    if (pos + 3 >= data.length) return null;
    pos += 2 + ((data[pos + 2]! << 8) | data[pos + 3]!);
  }
  return null;
}

function webpSize(data: Uint8Array): ImageSize | null {
  if (data.length < 30 || !startsWith(data, ascii('RIFF')) || !startsWith(data, ascii('WEBP'), 8))
    return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (startsWith(data, ascii('VP8X'), 12)) {
    const uint24 = (at: number) => data[at]! | (data[at + 1]! << 8) | (data[at + 2]! << 16);
    return sized(uint24(24) + 1, uint24(27) + 1);
  }
  if (startsWith(data, ascii('VP8 '), 12)) {
    return sized(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  }
  if (startsWith(data, ascii('VP8L'), 12)) {
    const bits = view.getUint32(21, true);
    return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  return null;
}

/**
 * The pixel size recorded in a PNG, JPEG, GIF or WebP header, or null when
 * the type is another one or the header cannot be read.
 */
export function imageSize(data: Uint8Array, mediaType: string): ImageSize | null {
  switch (mediaType.toLowerCase()) {
    case 'image/png':
      return pngSize(data);
    case 'image/jpeg':
      return jpegSize(data);
    case 'image/gif':
      return gifSize(data);
    case 'image/webp':
      return webpSize(data);
    default:
      return null;
  }
}
