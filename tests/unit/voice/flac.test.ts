import { describe, expect, it } from 'vitest';
import {
  FRAME,
  codedNumber,
  crc16,
  crc8,
  framesFor,
  initSegment,
  mediaSegment,
} from '../../../src/voice/flac';

const RATE = 44100;
const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

/** The boxes at the top of the bytes, by type, with where each one's body starts and ends. */
interface Box {
  type: string;
  start: number;
  body: number;
  end: number;
}

function boxes(bytes: Uint8Array, from = 0, to = bytes.length): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Box[] = [];
  for (let at = from; at < to;) {
    const size = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    out.push({ type, start: at, body: at + 8, end: at + size });
    at += size;
  }
  return out;
}

function find(bytes: Uint8Array, path: string[], from = 0, to = bytes.length): Box {
  const [head, ...rest] = path;
  const box = boxes(bytes, from, to).find((b) => b.type === head);
  if (!box) throw new Error(`no ${head}`);
  return rest.length ? find(bytes, rest, box.body, box.end) : box;
}

/** Reads the frames back as a decoder would, checking each one's sums on the way. */
function decode(data: Uint8Array, count: number): { index: number; samples: Int16Array }[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const frames: { index: number; samples: Int16Array }[] = [];
  let at = 0;
  for (let n = 0; n < count; n++) {
    const start = at;
    expect([data[at], data[at + 1]]).toEqual([0xff, 0xf8]);
    expect(data[at + 2]! >> 4).toBe(10);
    at += 4;
    // The frame's number, written in the manner of UTF-8.
    const first = data[at++]!;
    let more = 0;
    while (first & (0x80 >> more)) more++;
    let index = more === 0 ? first : first & (0xff >> (more + 1));
    for (let i = 1; i < more; i++) index = index * 64 + (data[at++]! & 0x3f);
    expect(crc8(data.subarray(start, at))).toBe(data[at]);
    at++;
    const kind = data[at++];
    const samples = new Int16Array(FRAME);
    if (kind === 0x00) {
      samples.fill(view.getInt16(at));
      at += 2;
    } else {
      expect(kind).toBe(0x02);
      for (let i = 0; i < FRAME; i++, at += 2) samples[i] = view.getInt16(at);
    }
    expect(crc16(data.subarray(start, at))).toBe(view.getUint16(at));
    at += 2;
    frames.push({ index, samples });
  }
  expect(at).toBe(data.length);
  return frames;
}

describe('the sums FLAC checks', () => {
  it('give the standard checks for the digits one to nine', () => {
    expect(crc8(ascii('123456789'))).toBe(0xf4);
    expect(crc16(ascii('123456789'))).toBe(0xfee8);
  });

  it('can stop short of the end', () => {
    const bytes = ascii('123456789!');
    expect(crc8(bytes, 9)).toBe(0xf4);
    expect(crc16(bytes, 9)).toBe(0xfee8);
  });
});

describe('a frame’s number', () => {
  it('is written in the manner of UTF-8', () => {
    expect(codedNumber(0)).toEqual([0]);
    expect(codedNumber(0x7f)).toEqual([0x7f]);
    expect(codedNumber(0x80)).toEqual([0xc2, 0x80]);
    expect(codedNumber(0x7ff)).toEqual([0xdf, 0xbf]);
    expect(codedNumber(0x800)).toEqual([0xe0, 0xa0, 0x80]);
    expect(codedNumber(0xffff)).toEqual([0xef, 0xbf, 0xbf]);
    expect(codedNumber(0x10000)).toEqual([0xf0, 0x90, 0x80, 0x80]);
  });
});

describe('the start of the stream', () => {
  it('describes one track of FLAC at the rate given', () => {
    const init = initSegment(RATE);
    expect(boxes(init).map((b) => b.type)).toEqual(['ftyp', 'moov']);
    const view = new DataView(init.buffer);
    const mdhd = find(init, ['moov', 'trak', 'mdia', 'mdhd']);
    expect(view.getUint32(mdhd.body + 12)).toBe(RATE);
    const stsd = find(init, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd']);
    const entry = boxes(init, stsd.body + 8, stsd.end)[0]!;
    expect(entry.type).toBe('fLaC');
    expect(view.getUint32(entry.body + 24)).toBe(RATE * 65536);
    const dfla = boxes(init, entry.body + 28, entry.end)[0]!;
    expect(dfla.type).toBe('dfLa');
    // STREAMINFO: blocks of FRAME samples, the rate, one channel of 16 bits.
    const info = dfla.body + 8;
    expect(view.getUint16(info)).toBe(FRAME);
    expect(view.getUint16(info + 2)).toBe(FRAME);
    const packed = view.getUint32(info + 10);
    expect(packed >>> 12).toBe(RATE);
    expect((packed >>> 9) & 7).toBe(0);
    expect((packed >>> 4) & 31).toBe(15);
    expect(find(init, ['moov', 'mvex', 'trex']).end).toBeLessThanOrEqual(init.length);
  });
});

describe('a piece of the stream', () => {
  const tone = Float32Array.from({ length: FRAME * 2 + 100 }, (_, i) =>
    Math.sin((2 * Math.PI * 440 * i) / RATE),
  );

  it('fills whole frames, the last one made up with silence', () => {
    expect(framesFor(0)).toBe(0);
    expect(framesFor(1)).toBe(1);
    expect(framesFor(FRAME)).toBe(1);
    expect(framesFor(FRAME + 1)).toBe(2);
  });

  it('places its frames at the frame given, with their sizes and where they start', () => {
    const segment = mediaSegment(tone, 50, RATE, 7);
    expect(boxes(segment).map((b) => b.type)).toEqual(['moof', 'mdat']);
    const view = new DataView(segment.buffer);
    expect(view.getUint32(find(segment, ['moof', 'mfhd']).body + 4)).toBe(7);
    const tfdt = find(segment, ['moof', 'traf', 'tfdt']);
    expect(segment[tfdt.body]).toBe(1);
    expect(view.getUint32(tfdt.body + 8)).toBe(50 * FRAME);
    const trun = find(segment, ['moof', 'traf', 'trun']);
    const count = view.getUint32(trun.body + 4);
    expect(count).toBe(3);
    const mdat = find(segment, ['mdat']);
    // The sound starts just after the mdat's header, counted from the start of the moof.
    expect(view.getUint32(trun.body + 8)).toBe(mdat.body);
    let total = 0;
    for (let i = 0; i < count; i++) {
      expect(view.getUint32(trun.body + 12 + i * 8)).toBe(FRAME);
      total += view.getUint32(trun.body + 16 + i * 8);
    }
    expect(total).toBe(mdat.end - mdat.body);
  });

  it('keeps the samples as they were, to sixteen bits', () => {
    const segment = mediaSegment(tone, 50, RATE, 1);
    const mdat = find(segment, ['mdat']);
    const frames = decode(segment.subarray(mdat.body, mdat.end), 3);
    expect(frames.map((f) => f.index)).toEqual([50, 51, 52]);
    const heard = new Float32Array(FRAME * 3);
    frames.forEach((f, n) =>
      heard.set(
        Float32Array.from(f.samples, (s) => s / 32767),
        n * FRAME,
      ),
    );
    for (let i = 0; i < tone.length; i++) expect(Math.abs(heard[i]! - tone[i]!)).toBeLessThan(1e-4);
    expect(heard.subarray(tone.length).every((v) => v === 0)).toBe(true);
  });

  it('writes silence in a few bytes a frame', () => {
    const segment = mediaSegment(new Float32Array(FRAME * 130), 200, RATE, 1);
    const mdat = find(segment, ['mdat']);
    const frames = decode(segment.subarray(mdat.body, mdat.end), 130);
    expect(frames.every((f) => f.samples.every((s) => s === 0))).toBe(true);
    expect(frames.at(-1)!.index).toBe(329);
    // Seven bytes of header, three of the one sample, two of the sum.
    expect(mdat.end - mdat.body).toBe(130 * 12);
  });

  it('writes a rate FLAC has no code for into the header', () => {
    const segment = mediaSegment(tone, 0, 22000, 1);
    const mdat = find(segment, ['mdat']);
    const data = segment.subarray(mdat.body);
    expect(data[2]! & 15).toBe(13);
    // Sync, codes, number 0, the rate in Hz, then the header's sum.
    expect((data[5]! << 8) | data[6]!).toBe(22000);
    expect(crc8(data.subarray(0, 7))).toBe(data[7]);
  });
});
