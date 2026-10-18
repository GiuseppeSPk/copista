import { finishPiece, type Finish } from './audio';
import type { Narrator, VoiceId } from './narrator';
import type { Ending, Lang } from './text';

/** What the player tells of a piece as it is heard. */
export interface Hearing {
  /** The piece starts to be heard. */
  onStart(): void;
  /** The piece has been heard to its end. */
  onEnd(): void;
  /** The last piece, whose play resolves only once heard to the end, so nothing stops it early. */
  last: boolean;
}

/** Where the pieces are heard. */
export interface Player {
  /**
   * Resolves when the samples have played, or nearly, so the next ones can be
   * put after them in time, or at once when the signal stops them.
   */
  play(samples: Float32Array, signal: AbortSignal, hearing: Hearing): Promise<void>;
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
  /** The piece played next, or being played. */
  let current = 0;
  /** The piece being heard, which may still be the one before `current`. */
  let hearing = 0;
  /** The pieces made and not yet heard. */
  const made = new Map<number, Float32Array>();
  let stopped = false;
  let paused = false;
  let failure: { error: unknown } | undefined;
  let playing: AbortController | undefined;
  /** The piece being made, which a stop or a skip away from it gives up. */
  let making: { index: number; controller: AbortController } | undefined;

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
      const controller = new AbortController();
      making = { index: i, controller };
      let samples: Float32Array;
      try {
        samples = await narrator.speak(pieces[i]!.text, lang, voice, undefined, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) continue;
        throw error;
      } finally {
        making = undefined;
      }
      // A piece skipped past while it was being made is not wanted any more.
      if (!stopped && i >= current) made.set(i, samples);
      toPlayer.ring();
    }
  };

  const playAll = async (): Promise<void> => {
    let started = false;
    let waiting = false;
    /** The piece before has been heard to its end, so playback has truly caught up. */
    let over = true;
    let plays = 0;
    while (!stopped && current < pieces.length) {
      if (failure) throw failure.error;
      const samples = made.get(current);
      if (paused || !samples) {
        if (!samples && started && over && !waiting) events.onWaiting((waiting = true));
        await toPlayer.rung;
        toPlayer = bell();
        continue;
      }
      if (waiting) events.onWaiting((waiting = false));
      started = true;
      const index = current;
      const controller = (playing = new AbortController());
      const play = ++plays;
      over = false;
      await player.play(
        finishPiece(samples, narrator.sampleRate, pieces[index]!.ends, finish),
        controller.signal,
        {
          onStart: () => {
            hearing = index;
            events.onPiece(index);
          },
          onEnd: () => {
            if (play !== plays) return;
            over = true;
            toPlayer.ring();
          },
          last: index === pieces.length - 1,
        },
      );
      if (controller.signal.aborted) {
        over = true;
        continue;
      }
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
      making?.controller.abort();
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
      if (by === 1 && hearing === pieces.length - 1) {
        this.stop();
        return;
      }
      const to = Math.max(Math.min(hearing + by, pieces.length - 1), 0);
      if (stopped || to === hearing) return;
      // A piece skipped past counts as heard.
      current = hearing = to;
      dropBehind();
      playing?.abort();
      // The voice moves to the piece now wanted, when the one it was making is not.
      if (making && making.index !== nextToMake()) making.controller.abort();
      wake();
    },
    get paused() {
      return paused;
    },
    done,
  };
}
