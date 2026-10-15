import type { Ending } from './text';

/** How a piece ends: the pause after it, by what comes next, and a fade over its last moment. */
export interface Finish {
  /** Seconds of silence after a piece. */
  pauses: Record<Ending, number>;
  fadeMs: number;
  /** A gentle warmth on the tone, through `shapeTone`. */
  tone: boolean;
}

/** The finish the voice had when the pause was made in the worker: 0.3 s after every piece. */
export const TODAY: Finish = {
  pauses: { piece: 0.3, paragraph: 0.3, heading: 0.3, chapter: 0.3 },
  fadeMs: 0,
  tone: false,
};

/** The finish the voice reads with, chosen by ear in the blind tests of 15 October: a fade and the warmer tone. */
export const DEFAULT_FINISH: Finish = { ...TODAY, fadeMs: 15, tone: true };

/** A second-order filter's coefficients, normalised so a0 is 1. */
type Biquad = [b0: number, b1: number, b2: number, a1: number, a2: number];

function normalise(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** A low shelf with a slope of 1, from the RBJ Audio EQ Cookbook. */
function lowShelf(hz: number, db: number, rate: number): Biquad {
  const a = 10 ** (db / 40);
  const w = (2 * Math.PI * hz) / rate;
  const cos = Math.cos(w);
  const s = 2 * Math.sqrt(a) * (Math.sin(w) / Math.SQRT2);
  return normalise(
    a * (a + 1 - (a - 1) * cos + s),
    2 * a * (a - 1 - (a + 1) * cos),
    a * (a + 1 - (a - 1) * cos - s),
    a + 1 + (a - 1) * cos + s,
    -2 * (a - 1 + (a + 1) * cos),
    a + 1 + (a - 1) * cos - s,
  );
}

/** A peaking filter, from the RBJ Audio EQ Cookbook. */
function peaking(hz: number, db: number, q: number, rate: number): Biquad {
  const a = 10 ** (db / 40);
  const w = (2 * Math.PI * hz) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  return normalise(1 + alpha * a, -2 * cos, 1 - alpha * a, 1 + alpha / a, -2 * cos, 1 - alpha / a);
}

function filter(x: Float32Array, [b0, b1, b2, a1, a2]: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** A soft compressor: 2:1 above -18 dBFS, 10 ms to act and 120 ms to let go. */
function compress(x: Float32Array, rate: number): void {
  const attack = Math.exp(-1 / (0.01 * rate));
  const release = Math.exp(-1 / (0.12 * rate));
  let envelope = 0;
  for (let i = 0; i < x.length; i++) {
    const level = Math.abs(x[i]!);
    envelope = level + (level > envelope ? attack : release) * (envelope - level);
    const over = 20 * Math.log10(Math.max(envelope, 1e-9)) + 18;
    if (over > 0) x[i]! *= 10 ** (-(over / 2) / 20);
  }
}

/** -1 dBFS. */
const CEILING = 0.891;

/**
 * A gentle warmth: +2 dB below 200 Hz, +1.5 dB around 400 Hz, a soft
 * compressor to even the voice out, and the whole piece brought under -1 dBFS.
 */
export function shapeTone(samples: Float32Array, rate: number): Float32Array {
  const out = filter(filter(samples, lowShelf(200, 2, rate)), peaking(400, 1.5, 0.8, rate));
  compress(out, rate);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > CEILING) for (let i = 0; i < out.length; i++) out[i]! *= CEILING / peak;
  return out;
}

/** The spoken samples, faded out over their last `fadeMs`, then the pause for what follows. */
export function finishPiece(
  samples: Float32Array,
  rate: number,
  ends: Ending,
  finish: Finish,
): Float32Array {
  if (finish.tone) samples = shapeTone(samples, rate);
  const out = new Float32Array(samples.length + Math.round(finish.pauses[ends] * rate));
  out.set(samples);
  const fade = Math.min(samples.length, Math.round((finish.fadeMs * rate) / 1000));
  for (let k = 0; k < fade; k++) out[samples.length - 1 - k]! *= k / fade;
  return out;
}

/** Samples as a WAV file: 16-bit PCM, one channel. */
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return buffer;
}

/**
 * Plays samples through one audio element. Browsers let an element play only
 * once a press has started it, so `unlock` is called during the press that
 * starts listening, and the same element plays every piece after it.
 */
export class Speaker {
  private readonly audio = new Audio();
  /** A piece is under way, though it may be held. */
  private live = false;
  /** Held by the reader, so the browser's complaint that play() was interrupted is expected. */
  private held = false;

  unlock(): void {
    this.load(new Blob([encodeWav(new Float32Array(1), 8000)]));
    void this.audio.play().catch(() => undefined);
  }

  /** Gives the element a new sound, letting go of the one it had. */
  private load(sound: Blob): void {
    if (this.audio.src.startsWith('blob:')) URL.revokeObjectURL(this.audio.src);
    this.audio.src = URL.createObjectURL(sound);
  }

  /** Resolves when the samples have played, or at once when the signal stops them. */
  play(samples: Float32Array, rate: number, signal: AbortSignal): Promise<void> {
    const audio = this.audio;
    this.load(new Blob([encodeWav(samples, rate)], { type: 'audio/wav' }));
    this.live = true;
    this.held = false;
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error): void => {
        this.live = false;
        audio.removeEventListener('ended', ended);
        audio.removeEventListener('error', failed);
        signal.removeEventListener('abort', stopped);
        if (error === undefined) resolve();
        else reject(error);
      };
      const ended = (): void => finish();
      const failed = (): void => finish(new Error('The voice could not be played.'));
      const stopped = (): void => {
        audio.pause();
        finish();
      };
      if (signal.aborted) return stopped();
      audio.addEventListener('ended', ended);
      audio.addEventListener('error', failed);
      signal.addEventListener('abort', stopped);
      audio.play().catch((e: unknown) => {
        if (!signal.aborted && !this.held) finish(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }

  pause(): void {
    this.held = true;
    this.audio.pause();
  }

  /** Carries on with the piece held, if there is one. */
  resume(): void {
    this.held = false;
    if (this.live) void this.audio.play().catch(() => undefined);
  }

  /** Lets go of the last piece. */
  release(): void {
    this.audio.pause();
    if (this.audio.src.startsWith('blob:')) URL.revokeObjectURL(this.audio.src);
    this.audio.removeAttribute('src');
  }
}
