/**
 * The voice as one stream that never ends: samples written as FLAC frames, stored without
 * compression, in fragmented MP4, the form Media Source takes in Chromium and Firefox. Every
 * frame holds FRAME samples, so the whole stream lies on one grid of frames and a piece can
 * be put in place of the silence at any frame of it.
 */

/** Samples in every frame. */
export const FRAME = 1024;

/** The type the Media Source is asked for. */
export const STREAM_TYPE = 'audio/mp4; codecs="flac"';

const TRACK = 1;

/** FLAC's codes for the common rates, written in the frame header itself. */
const RATE_CODES: Record<number, number> = {
  88200: 1,
  176400: 2,
  192000: 3,
  8000: 4,
  16000: 5,
  22050: 6,
  24000: 7,
  32000: 8,
  44100: 9,
  48000: 10,
  96000: 11,
};

/** FLAC's code for a block of 1024 samples. */
const BLOCK_CODE = 10;

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const u8 = (...bytes: number[]): Uint8Array => Uint8Array.from(bytes);
const u16 = (n: number): Uint8Array => u8((n >>> 8) & 255, n & 255);
const u24 = (n: number): Uint8Array => u8((n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const u32 = (n: number): Uint8Array =>
  u8((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const u64 = (n: number): Uint8Array => concat([u32(Math.floor(n / 2 ** 32)), u32(n >>> 0)]);
const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const zeros = (n: number): Uint8Array => new Uint8Array(n);

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const body = concat(parts);
  return concat([u32(body.length + 8), ascii(type), body]);
}

function fullBox(type: string, version: number, flags: number, ...parts: Uint8Array[]): Uint8Array {
  return box(type, u8(version), u24(flags), ...parts);
}

/** CRC-8 of a FLAC frame header: polynomial x^8 + x^2 + x + 1, starting from zero. */
export function crc8(bytes: Uint8Array, end = bytes.length): number {
  let crc = 0;
  for (let i = 0; i < end; i++) {
    crc ^= bytes[i]!;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

/** CRC-16 of a whole FLAC frame: polynomial x^16 + x^15 + x^2 + 1, starting from zero. */
export function crc16(bytes: Uint8Array, end = bytes.length): number {
  let crc = 0;
  for (let i = 0; i < end; i++) {
    crc ^= bytes[i]! << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/** A frame's number as FLAC writes it, in the manner of UTF-8 (up to 31 bits). */
export function codedNumber(n: number): number[] {
  if (n < 0x80) return [n];
  const tail: number[] = [];
  let rest = n;
  // Each following byte holds six bits; the first holds what is left, one bit fewer for each.
  do {
    tail.unshift(0x80 | (rest & 0x3f));
    rest = Math.floor(rest / 64);
  } while (rest >= 1 << (6 - tail.length));
  const lead = (0xff << (7 - tail.length)) & 0xff;
  return [lead | rest, ...tail];
}

/** The STREAMINFO block: frames of FRAME samples, one channel of 16 bits, length not known. */
function streamInfo(rate: number): Uint8Array {
  return concat([
    u16(FRAME),
    u16(FRAME),
    u24(0),
    u24(0),
    // 20 bits of rate, 3 of channels less one, 5 of bits per sample less one, 4 of length.
    u32(rate * 4096 + (0 << 9) + (15 << 4)),
    u32(0),
    zeros(16),
  ]);
}

/** The header of a frame: the rate is written out in it when FLAC has no code for it. */
function frameHeader(index: number, rate: number): Uint8Array {
  const code = RATE_CODES[rate] ?? (rate < 65536 ? 13 : 0);
  const head = [0xff, 0xf8, (BLOCK_CODE << 4) | code, 0x08, ...codedNumber(index)];
  if (code === 13) head.push((rate >>> 8) & 255, rate & 255);
  const bytes = Uint8Array.from([...head, 0]);
  bytes[bytes.length - 1] = crc8(bytes, bytes.length - 1);
  return bytes;
}

/** One frame: a constant subframe where every sample is the same, as in silence, else verbatim. */
function frame(samples: Float32Array, from: number, index: number, rate: number): Uint8Array {
  const header = frameHeader(index, rate);
  const values = new Int16Array(FRAME);
  let same = true;
  for (let i = 0; i < FRAME; i++) {
    const s = samples[from + i] ?? 0;
    values[i] = Math.round(Math.max(-1, Math.min(1, s)) * 32767);
    if (values[i] !== values[0]) same = false;
  }
  const body = same ? 3 : 1 + FRAME * 2;
  const out = new Uint8Array(header.length + body + 2);
  out.set(header);
  const view = new DataView(out.buffer);
  let at = header.length;
  out[at++] = same ? 0x00 : 0x02;
  for (let i = 0; i < (same ? 1 : FRAME); i++, at += 2) view.setInt16(at, values[i]!);
  view.setUint16(at, crc16(out, at));
  return out;
}

/** How many frames the samples fill, the last one made up with silence. */
export function framesFor(samples: number): number {
  return Math.ceil(samples / FRAME);
}

/** The start of the stream: what the track is, given once before any sound. */
export function initSegment(rate: number): Uint8Array<ArrayBuffer> {
  const matrix = concat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));
  const sampleEntry = box(
    'fLaC',
    zeros(6),
    u16(1),
    zeros(8),
    u16(1),
    u16(16),
    zeros(4),
    u32(rate < 65536 ? rate * 65536 : 0),
    fullBox('dfLa', 0, 0, u8(0x80), u24(34), streamInfo(rate)),
  );
  const stbl = box(
    'stbl',
    fullBox('stsd', 0, 0, u32(1), sampleEntry),
    fullBox('stts', 0, 0, u32(0)),
    fullBox('stsc', 0, 0, u32(0)),
    fullBox('stsz', 0, 0, u32(0), u32(0)),
    fullBox('stco', 0, 0, u32(0)),
  );
  const minf = box(
    'minf',
    fullBox('smhd', 0, 0, u16(0), u16(0)),
    box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
    stbl,
  );
  const mdia = box(
    'mdia',
    fullBox('mdhd', 0, 0, u32(0), u32(0), u32(rate), u32(0), u16(0x55c4), u16(0)),
    fullBox('hdlr', 0, 0, u32(0), ascii('soun'), zeros(12), ascii('Voice\0')),
    minf,
  );
  const tkhd = fullBox(
    'tkhd',
    0,
    3,
    u32(0),
    u32(0),
    u32(TRACK),
    u32(0),
    u32(0),
    zeros(8),
    u16(0),
    u16(0),
    u16(0x0100),
    u16(0),
    matrix,
    u32(0),
    u32(0),
  );
  const mvhd = fullBox(
    'mvhd',
    0,
    0,
    u32(0),
    u32(0),
    u32(1000),
    u32(0),
    u32(0x00010000),
    u16(0x0100),
    zeros(10),
    matrix,
    zeros(24),
    u32(TRACK + 1),
  );
  const mvex = box('mvex', fullBox('trex', 0, 0, u32(TRACK), u32(1), u32(0), u32(0), u32(0)));
  return concat([
    box('ftyp', ascii('iso6'), u32(0), ascii('iso6'), ascii('mp41')),
    box('moov', mvhd, box('trak', tkhd, mdia), mvex),
  ]);
}

/**
 * Sound for the stream, starting at frame `at` of it. `sequence` counts the segments, as
 * MP4 asks; the frames are numbered by their place in the stream.
 */
export function mediaSegment(
  samples: Float32Array,
  at: number,
  rate: number,
  sequence: number,
): Uint8Array<ArrayBuffer> {
  const count = framesFor(samples.length);
  const frames: Uint8Array[] = [];
  for (let i = 0; i < count; i++) frames.push(frame(samples, i * FRAME, at + i, rate));
  const moof = (offset: number): Uint8Array =>
    box(
      'moof',
      fullBox('mfhd', 0, 0, u32(sequence)),
      box(
        'traf',
        // The sound follows straight after this box.
        fullBox('tfhd', 0, 0x020000, u32(TRACK)),
        fullBox('tfdt', 1, 0, u64(at * FRAME)),
        fullBox(
          'trun',
          0,
          0x000301,
          u32(count),
          u32(offset),
          ...frames.flatMap((f) => [u32(FRAME), u32(f.length)]),
        ),
      ),
    );
  const size = moof(0).length;
  return concat([moof(size + 8), box('mdat', ...frames)]);
}
