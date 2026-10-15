import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FINISH,
  Speaker,
  TODAY,
  finishPiece,
  shapeTone,
  trimSilence,
} from '../../../src/voice/audio';

const ones = (n: number): Float32Array => new Float32Array(n).fill(1);

describe('the finish of a piece', () => {
  it('adds the pause for what comes next as silence after the spoken samples', () => {
    const out = finishPiece(ones(1000), 1000, 'paragraph', {
      ...TODAY,
      pauses: { ...TODAY.pauses, paragraph: 0.6 },
    });
    expect(out.length).toBe(1600);
    expect(out.subarray(0, 1000).every((v) => v === 1)).toBe(true);
    expect(out.subarray(1000).every((v) => v === 0)).toBe(true);
  });

  it('fades the last spoken samples down to nothing', () => {
    const out = finishPiece(ones(1000), 1000, 'piece', { ...TODAY, fadeMs: 15 });
    expect(out[999]).toBe(0);
    expect(out[984]).toBe(1);
    for (let i = 985; i <= 999; i++) expect(out[i]!).toBeLessThan(out[i - 1]!);
  });

  it('reads with the finish chosen by ear on 15 October: 0.3 s after every piece, a 15 ms fade and the warmer tone; and the silence trimmed', () => {
    expect(DEFAULT_FINISH).toEqual({
      pauses: { piece: 0.3, paragraph: 0.3, heading: 0.3, chapter: 0.3 },
      fadeMs: 15,
      tone: true,
      trim: true,
    });
  });

  it('trims the silence before the pause, so the pause is the one set', () => {
    const spoken = new Float32Array(3000);
    spoken.fill(0.5, 1000, 2000);
    const out = finishPiece(spoken, 1000, 'piece', { ...TODAY, trim: true });
    expect(out.length).toBe(30 + 1000 + 80 + 300);
  });

  it('keeps today’s length: the spoken samples and 0.3 s, whatever follows', () => {
    for (const ends of ['piece', 'paragraph', 'heading', 'chapter'] as const) {
      expect(finishPiece(ones(44100), 44100, ends, TODAY).length).toBe(44100 + 13230);
    }
  });
});

describe('the silence around the voice', () => {
  const voiced = (before: number, voice: number, after: number): Float32Array => {
    const xs = new Float32Array(before + voice + after);
    xs.fill(0.2, before, before + voice);
    return xs;
  };

  it('cuts the silence at both ends, keeping 30 ms before the voice and 80 ms after', () => {
    const out = trimSilence(voiced(500, 1000, 700), 1000);
    expect(out.length).toBe(30 + 1000 + 80);
    expect(out[29]).toBe(0);
    expect(out[30]).toBeCloseTo(0.2);
    expect(out[1029]).toBeCloseTo(0.2);
    expect(out[1030]).toBe(0);
  });

  it('keeps a quiet sound above -45 dBFS, and the pauses inside the voice', () => {
    const xs = voiced(0, 1000, 0);
    xs.fill(0, 400, 600);
    xs.fill(0.01, 900, 1000);
    expect(trimSilence(xs, 1000).length).toBe(1000);
  });

  it('leaves less margin when the voice starts or ends at the edge', () => {
    expect(trimSilence(voiced(10, 1000, 20), 1000).length).toBe(1030);
  });

  it('gives back a piece with no voice as it was', () => {
    const quiet = new Float32Array(500).fill(0.001);
    expect(trimSilence(quiet, 1000)).toBe(quiet);
    expect(trimSilence(new Float32Array(0), 1000)).toHaveLength(0);
  });
});

const sine = (hz: number, level: number, rate = 44100, seconds = 0.5): Float32Array =>
  Float32Array.from(
    { length: rate * seconds },
    (_, i) => level * Math.sin((2 * Math.PI * hz * i) / rate),
  );

const rms = (xs: Float32Array): number => Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / xs.length);

describe('the warmth on the tone', () => {
  it('keeps the length', () => {
    expect(shapeTone(sine(300, 0.3), 44100).length).toBe(22050);
  });

  it('never peaks above -1 dBFS', () => {
    const out = shapeTone(sine(200, 1), 44100);
    expect(Math.max(...out.map(Math.abs))).toBeLessThanOrEqual(0.891);
  });

  it('lifts a low voice more than a high one of the same level', () => {
    const low = shapeTone(sine(200, 0.05), 44100).subarray(4410);
    const high = shapeTone(sine(4000, 0.05), 44100).subarray(4410);
    expect(rms(low)).toBeGreaterThan(rms(high) * 1.1);
  });

  it('is off today, and the finish applies it to the spoken part when on', () => {
    expect(TODAY.tone).toBe(false);
    const spoken = sine(300, 0.3, 1000, 1);
    const out = finishPiece(spoken, 1000, 'piece', { ...TODAY, tone: true });
    expect(out.subarray(0, 1000)).toEqual(shapeTone(spoken, 1000));
  });
});

describe('the speaker', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Audio elements that keep their source and play at once, and blob URLs that are counted. */
  function stubAudio() {
    const live = new Set<string>();
    let made = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => {
        const url = `blob:${++made}`;
        live.add(url);
        return url;
      },
      revokeObjectURL: (url: string) => live.delete(url),
    });
    vi.stubGlobal(
      'Audio',
      class {
        src = '';
        play = () => Promise.resolve();
        pause = () => {};
        addEventListener = () => {};
        removeEventListener = () => {};
        removeAttribute = () => (this.src = '');
      },
    );
    return live;
  }

  it('keeps no more than one sound in memory, however often it is unlocked', () => {
    const live = stubAudio();
    const speaker = new Speaker();
    speaker.unlock();
    speaker.unlock();
    void speaker.play(new Float32Array(10), 8000, new AbortController().signal);
    expect(live.size).toBe(1);
    speaker.release();
    expect(live.size).toBe(0);
  });

  it('keeps the speed chosen for every piece after, as a new source sets the rate back', () => {
    stubAudio();
    const made: { playbackRate: number }[] = [];
    vi.stubGlobal(
      'Audio',
      class {
        #src = '';
        defaultPlaybackRate = 1;
        playbackRate = 1;
        constructor() {
          made.push(this);
        }
        get src() {
          return this.#src;
        }
        set src(url: string) {
          this.#src = url;
          this.playbackRate = this.defaultPlaybackRate;
        }
        play = () => Promise.resolve();
        pause = () => {};
        addEventListener = () => {};
        removeEventListener = () => {};
        removeAttribute = () => (this.#src = '');
      },
    );
    const speaker = new Speaker();
    speaker.unlock();
    speaker.setRate(1.5);
    expect(made[0]!.playbackRate).toBe(1.5);
    void speaker.play(new Float32Array(10), 8000, new AbortController().signal);
    void speaker.play(new Float32Array(10), 8000, new AbortController().signal);
    expect(made[0]!.playbackRate).toBe(1.5);
  });
});
