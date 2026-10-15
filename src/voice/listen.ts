import type { Narrator, VoiceId } from './narrator';
import type { Lang } from './text';

/** A reading aloud under way. */
export interface Listening {
  /** Stops at once; nothing more is played. */
  stop(): void;
  /** Settles when the last piece has played or the reading stopped, and rejects on an error. */
  readonly done: Promise<void>;
}

/**
 * Reads the pieces aloud one after another. The next piece is made while the
 * current one plays, so the voice keeps up on a device fast enough for it.
 */
export function listen(
  narrator: Pick<Narrator, 'speak'>,
  texts: readonly string[],
  lang: Lang,
  voice: VoiceId,
  play: (samples: Float32Array, signal: AbortSignal) => Promise<void>,
): Listening {
  const controller = new AbortController();
  const signal = controller.signal;
  const speak = (i: number): Promise<Float32Array> => {
    const made = narrator.speak(texts[i]!, lang, voice);
    // A piece made ahead may fail after the reading stopped; nobody waits for it then.
    made.catch(() => undefined);
    return made;
  };
  const run = async (): Promise<void> => {
    if (texts.length === 0) return;
    let next = speak(0);
    for (let i = 0; i < texts.length; i++) {
      const samples = await next;
      if (signal.aborted) return;
      if (i + 1 < texts.length) next = speak(i + 1);
      await play(samples, signal);
      if (signal.aborted) return;
    }
  };
  return { stop: () => controller.abort(), done: run() };
}
