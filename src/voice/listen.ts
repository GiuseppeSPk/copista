import { finishPiece, type Finish } from './audio';
import type { Narrator, VoiceId } from './narrator';
import type { Ending, Lang } from './text';

/** Where the pieces are heard. */
export interface Player {
  /** Resolves when the samples have played, or at once when the signal stops them. */
  play(samples: Float32Array, signal: AbortSignal): Promise<void>;
  pause(): void;
  resume(): void;
}

/** What the page follows while the voice reads. */
export interface ListenEvents {
  /** A piece starts playing. */
  onPiece(index: number): void;
  /** Playback has caught up with the voice and waits for it, or has stopped waiting. */
  onWaiting(waiting: boolean): void;
}

/** A reading aloud under way. */
export interface Listening {
  /** Stops at once; nothing more is played. */
  stop(): void;
  pause(): void;
  resume(): void;
  /** Moves a piece back or forward; forward from the last piece ends the reading. */
  skip(by: 1 | -1): void;
  readonly paused: boolean;
  /** Settles when the last piece has played or the reading stopped, and rejects on an error. */
  readonly done: Promise<void>;
}

/** How much of the voice is made ahead of the ear, at most. */
export const AHEAD_SECONDS = 120;

/** How many pieces just heard are kept, so going back to them plays at once. */
export const KEPT_BEHIND = 2;

/**
 * Reads the pieces aloud one after another. The voice makes the pieces in order,
 * one at a time, while the earlier ones play, and rests once two minutes are
 * waiting to be heard, so a slow device falls behind as late as it can.
 */
export function listen(
  narrator: Pick<Narrator, 'speak' | 'sampleRate'>,
  pieces: readonly { text: string; ends: Ending }[],
  lang: Lang,
  voice: VoiceId,
  player: Player,
  finish: Finish,
  events: ListenEvents,
): Listening {
  /** The piece being heard, or about to be. */
  let current = 0;
  /** The pieces made and not yet heard. */
  const made = new Map<number, Float32Array>();
  let stopped = false;
  let paused = false;
  let failure: { error: unknown } | undefined;
  let playing: AbortController | undefined;

  // Each side sleeps on its own bell; anything that may give it work rings it.
  const bell = () => {
    let ring = () => {};
    const rung = new Promise<void>((resolve) => (ring = resolve));
    return { rung, ring };
  };
  let toVoice = bell();
  let toPlayer = bell();
  const wake = () => {
    toVoice.ring();
    toPlayer.ring();
  };

  const ahead = (): number => {
    let samples = 0;
    for (const [i, piece] of made) if (i >= current) samples += piece.length;
    return samples / narrator.sampleRate;
  };
  /** Lets go of the pieces heard longer ago than the ones kept. */
  const dropBehind = (): void => {
    for (const i of made.keys()) if (i < current - KEPT_BEHIND) made.delete(i);
  };
  const nextToMake = (): number => {
    let i = current;
    while (made.has(i)) i++;
    return i;
  };

  const makeAll = async (): Promise<void> => {
    while (!stopped) {
      const i = nextToMake();
      if (i >= pieces.length || ahead() > AHEAD_SECONDS) {
        await toVoice.rung;
        toVoice = bell();
        continue;
      }
      const samples = await narrator.speak(pieces[i]!.text, lang, voice);
      // A piece skipped past while it was being made is not wanted any more.
      if (!stopped && i >= current) made.set(i, samples);
      toPlayer.ring();
    }
  };

  const playAll = async (): Promise<void> => {
    let started = false;
    let waiting = false;
    while (!stopped && current < pieces.length) {
      if (failure) throw failure.error;
      const samples = made.get(current);
      if (paused || !samples) {
        if (!samples && started && !waiting) events.onWaiting((waiting = true));
        await toPlayer.rung;
        toPlayer = bell();
        continue;
      }
      if (waiting) events.onWaiting((waiting = false));
      started = true;
      const index = current;
      const controller = (playing = new AbortController());
      events.onPiece(index);
      await player.play(
        finishPiece(samples, narrator.sampleRate, pieces[index]!.ends, finish),
        controller.signal,
      );
      if (controller.signal.aborted) continue;
      current++;
      dropBehind();
      toVoice.ring();
    }
    if (failure) throw failure.error;
  };

  makeAll().catch((error: unknown) => {
    if (stopped) return;
    failure = { error };
    playing?.abort();
    toPlayer.ring();
  });
  const done = playAll().finally(() => {
    stopped = true;
    playing?.abort();
    toVoice.ring();
  });

  return {
    stop() {
      stopped = true;
      playing?.abort();
      wake();
    },
    pause() {
      if (paused || stopped) return;
      paused = true;
      player.pause();
    },
    resume() {
      if (!paused || stopped) return;
      paused = false;
      player.resume();
      toPlayer.ring();
    },
    skip(by) {
      // Forward from the last piece ends the reading, so the next chapter follows.
      if (by === 1 && current === pieces.length - 1) {
        this.stop();
        return;
      }
      const to = Math.max(Math.min(current + by, pieces.length - 1), 0);
      if (stopped || to === current) return;
      // A piece skipped past counts as heard.
      current = to;
      dropBehind();
      playing?.abort();
      wake();
    },
    get paused() {
      return paused;
    },
    done,
  };
}
