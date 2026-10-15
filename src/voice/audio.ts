import type { Ending } from './text';

/** How a piece ends: the pause after it, by what comes next, and a fade over its last moment. */
export interface Finish {
  /** Seconds of silence after a piece. */
  pauses: Record<Ending, number>;
  fadeMs: number;
}

/** The finish the voice had when the pause was made in the worker: 0.3 s after every piece. */
export const TODAY: Finish = {
  pauses: { piece: 0.3, paragraph: 0.3, heading: 0.3, chapter: 0.3 },
  fadeMs: 0,
};

/** The spoken samples, faded out over their last `fadeMs`, then the pause for what follows. */
export function finishPiece(
  samples: Float32Array,
  rate: number,
  ends: Ending,
  finish: Finish,
): Float32Array {
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
    this.audio.src = URL.createObjectURL(new Blob([encodeWav(new Float32Array(1), 8000)]));
    void this.audio.play().catch(() => undefined);
  }

  /** Resolves when the samples have played, or at once when the signal stops them. */
  play(samples: Float32Array, rate: number, signal: AbortSignal): Promise<void> {
    const audio = this.audio;
    if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(new Blob([encodeWav(samples, rate)], { type: 'audio/wav' }));
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
