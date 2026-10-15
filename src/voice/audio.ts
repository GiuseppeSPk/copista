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

  unlock(): void {
    this.audio.src = URL.createObjectURL(new Blob([encodeWav(new Float32Array(1), 8000)]));
    void this.audio.play().catch(() => undefined);
  }

  /** Resolves when the samples have played, or at once when the signal stops them. */
  play(samples: Float32Array, rate: number, signal: AbortSignal): Promise<void> {
    const audio = this.audio;
    if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(new Blob([encodeWav(samples, rate)], { type: 'audio/wav' }));
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error): void => {
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
        if (!signal.aborted) finish(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }

  /** Lets go of the last piece. */
  release(): void {
    this.audio.pause();
    if (this.audio.src.startsWith('blob:')) URL.revokeObjectURL(this.audio.src);
    this.audio.removeAttribute('src');
  }
}
