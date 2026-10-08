/** Windows-1252 bytes 0x80-0x9F; the rest of the code page matches Latin-1. */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
  0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
  0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

/** Decoded by hand: some TextDecoder builds treat 'windows-1252' as Latin-1. */
function decodeWindows1252(data: Uint8Array): string {
  let text = '';
  for (let start = 0; start < data.length; start += 8192) {
    const codes = Array.from(data.subarray(start, start + 8192), (byte) =>
      byte >= 0x80 && byte < 0xa0 ? CP1252_HIGH[byte - 0x80]! : byte,
    );
    text += String.fromCharCode(...codes);
  }
  return text;
}

/**
 * Decodes a text file whose encoding nobody declared: a byte order mark wins;
 * otherwise UTF-8 if the bytes are valid UTF-8, else Windows-1252, the usual
 * encoding of older Western text files. Line endings become '\n'.
 */
export function decodeText(data: Uint8Array): string {
  let text: string;
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    text = new TextDecoder('utf-8').decode(data);
  } else if (data[0] === 0xff && data[1] === 0xfe) {
    text = new TextDecoder('utf-16le').decode(data);
  } else if (data[0] === 0xfe && data[1] === 0xff) {
    text = new TextDecoder('utf-16be').decode(data);
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch {
      text = decodeWindows1252(data);
    }
  }
  return text.replace(/\r\n?/g, '\n');
}
