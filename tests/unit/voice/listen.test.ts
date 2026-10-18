import { describe, expect, it } from 'vitest';
import { TODAY, encodeWav, type Finish } from '../../../src/voice/audio';
import { AHEAD_SECONDS, KEPT_BEHIND, listen, type Hearing } from '../../../src/voice/listen';
import type { Ending, Lang } from '../../../src/voice/text';
import type { VoiceId } from '../../../src/voice/narrator';

describe('encodeWav', () => {
  it('writes 16-bit mono PCM after a 44-byte header', () => {
    const wav = encodeWav(new Float32Array([0, 1.5, -1]), 44100);
    const view = new DataView(wav);
    expect(wav.byteLength).toBe(50);
    expect(String.fromCharCode(...new Uint8Array(wav, 0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...new Uint8Array(wav, 8, 4))).toBe('WAVE');
    expect(view.getUint32(4, true)).toBe(42);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
  });
});

/** No pause, no fade, no tone and no trim, so the samples played are the samples spoken. */
const BARE: Finish = {
  pauses: { piece: 0, paragraph: 0, heading: 0, chapter: 0 },
  fadeMs: 0,
  tone: false,
  trim: false,
};

/** A narrator whose pieces finish when the test says, and a player that does the same. */
function setUp(
  texts: string[],
  options: {
    finish?: Finish;
    ends?: Ending;
    rate?: number;
    heardLater?: boolean;
    overLater?: boolean;
  } = {},
) {
  const log: string[] = [];
  const speaking = new Map<string, (samples: Float32Array) => void>();
  const failing = new Map<string, (error: Error) => void>();
  const playing: (() => void)[] = [];
  const played: Float32Array[] = [];
  /** Tells the reading that a piece starts to be heard, when `heardLater` holds it back. */
  const heard: (() => void)[] = [];
  /** Tells the reading that a piece has been heard to its end, when `overLater` holds it back. */
  const over: (() => void)[] = [];
  const lasts: boolean[] = [];
  const waits: boolean[] = [];
  const started: number[] = [];
  let pending = 0;
  let most = 0;
  const narrator = {
    sampleRate: options.rate ?? 1,
    speak(
      text: string,
      lang: Lang,
      voice: VoiceId,
      _tuning?: unknown,
      signal?: AbortSignal,
    ): Promise<Float32Array> {
      log.push(`speak ${text} ${lang} ${voice}`);
      return new Promise((resolve, reject) => {
        speaking.set(text, resolve);
        failing.set(text, reject);
        signal?.addEventListener('abort', () => {
          log.push(`give up ${text}`);
          reject(new DOMException('given up', 'AbortError'));
        });
      });
    },
  };
  const player = {
    play(samples: Float32Array, signal: AbortSignal, hearing: Hearing): Promise<void> {
      log.push(`play ${samples.length}`);
      played.push(samples);
      lasts.push(hearing.last);
      if (options.heardLater) heard.push(hearing.onStart);
      else hearing.onStart();
      most = Math.max(most, ++pending);
      return new Promise<void>((resolve) => {
        playing.push(() => {
          resolve();
          if (options.overLater) over.push(hearing.onEnd);
          else hearing.onEnd();
        });
        signal.addEventListener('abort', () => resolve(), { once: true });
      }).finally(() => pending--);
    },
    pause: () => void log.push('pause'),
    resume: () => void log.push('resume'),
  };
  const pieces = texts.map((text) => ({ text, ends: options.ends ?? ('piece' as const) }));
  const listening = listen(narrator, pieces, 'it', 'M2', player, options.finish ?? BARE, {
    onPiece: (index) => started.push(index),
    onWaiting: (waiting) => waits.push(waiting),
  });
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const say = async (text: string, length: number): Promise<void> => {
    speaking.get(text)!(new Float32Array(length));
    await tick();
  };
  const speaks = () => log.filter((line) => line.startsWith('speak'));
  return {
    log,
    speaking,
    failing,
    playing,
    played,
    heard,
    over,
    lasts,
    waits,
    started,
    listening,
    tick,
    say,
    speaks,
    most: () => most,
  };
}

describe('listen', () => {
  it('reads each piece in turn, making the next ones while the current one plays', async () => {
    const { log, playing, listening, tick, say } = setUp(['a', 'bb', 'ccc']);
    await tick();
    expect(log).toEqual(['speak a it M2']);
    await say('a', 1);
    expect(log).toEqual(['speak a it M2', 'speak bb it M2', 'play 1']);
    await say('bb', 2);
    expect(log.slice(3)).toEqual(['speak ccc it M2']);
    playing.shift()!();
    await tick();
    expect(log.slice(4)).toEqual(['play 2']);
    await say('ccc', 3);
    playing.shift()!();
    await tick();
    expect(log.slice(5)).toEqual(['play 3']);
    playing.shift()!();
    await expect(listening.done).resolves.toBeUndefined();
  });

  it('never holds more than two minutes ahead', async () => {
    expect(AHEAD_SECONDS).toBe(120);
    const texts = ['a', 'b', 'c', 'd', 'e', 'f'];
    const { log, say, speaks } = setUp(texts);
    for (const text of texts) {
      if (!log.includes(`speak ${text} it M2`)) break;
      await say(text, 50);
    }
    expect(speaks()).toEqual(['speak a it M2', 'speak b it M2', 'speak c it M2']);
    expect(log.filter((line) => line.startsWith('play'))).toEqual(['play 50']);
  });

  it('makes more once a piece has played', async () => {
    const { say, speaks, playing, tick } = setUp(['a', 'b', 'c', 'd']);
    await say('a', 50);
    await say('b', 50);
    await say('c', 50);
    expect(speaks()).not.toContain('speak d it M2');
    playing.shift()!();
    await tick();
    expect(speaks()).toContain('speak d it M2');
  });

  it('reports waiting when playback catches up', async () => {
    const { waits, say, playing, tick } = setUp(['a', 'b', 'c']);
    await say('a', 1);
    expect(waits).toEqual([]);
    playing.shift()!();
    await tick();
    expect(waits).toEqual([true]);
    await say('b', 1);
    expect(waits).toEqual([true, false]);
    await say('c', 1);
    playing.shift()!();
    await tick();
    expect(waits).toEqual([true, false]);
  });

  it('skips forward and back within the chapter', async () => {
    const { listening, started, say, speaks, tick } = setUp(['a', 'b', 'c']);
    await say('a', 1);
    await say('b', 1);
    await say('c', 1);
    listening.skip(-1);
    await tick();
    expect(started).toEqual([0]);
    listening.skip(1);
    await tick();
    listening.skip(1);
    await tick();
    expect(started).toEqual([0, 1, 2]);
    listening.skip(-1);
    await tick();
    // A piece skipped past counts as heard and is kept, so going back plays it at once.
    expect(started).toEqual([0, 1, 2, 1]);
    expect(speaks().filter((line) => line === 'speak b it M2')).toHaveLength(1);
  });

  it('tells of a piece when it starts to be heard, not when it is put in', async () => {
    const { started, heard, say, playing, tick } = setUp(['a', 'b'], { heardLater: true });
    await say('a', 1);
    await say('b', 1);
    expect(started).toEqual([]);
    heard.shift()!();
    expect(started).toEqual([0]);
    // The first piece has nearly played, so the second is put in after it, and is heard later.
    playing.shift()!();
    await tick();
    expect(started).toEqual([0]);
    heard.shift()!();
    expect(started).toEqual([0, 1]);
  });

  it('skips from the piece being heard, while the next one is put in already', async () => {
    const { listening, started, heard, say, playing, tick } = setUp(['a', 'b', 'c'], {
      heardLater: true,
    });
    await say('a', 1);
    await say('b', 1);
    await say('c', 1);
    heard.shift()!();
    playing.shift()!();
    await tick();
    // "b" is put in, "a" still heard: forward goes to "b", not past it.
    listening.skip(1);
    await tick();
    heard.at(-1)!();
    expect(started).toEqual([0, 1]);
  });

  it('reports waiting only once the piece before has been heard to its end', async () => {
    const { waits, over, say, playing, tick } = setUp(['a', 'b'], { overLater: true });
    await say('a', 1);
    // "a" has nearly played, and "b" is not made yet: "a" is still heard.
    playing.shift()!();
    await tick();
    expect(waits).toEqual([]);
    over.shift()!();
    await tick();
    expect(waits).toEqual([true]);
    await say('b', 1);
    expect(waits).toEqual([true, false]);
  });

  it('plays the last piece to its end', async () => {
    const { lasts, say, playing, tick } = setUp(['a', 'b', 'c']);
    for (const text of ['a', 'b', 'c']) {
      await say(text, 1);
      playing.shift()!();
      await tick();
    }
    expect(lasts).toEqual([false, false, true]);
  });

  it('ends the listening when skipping forward from the last piece, so the next chapter follows', async () => {
    const { listening, started, say, tick } = setUp(['a', 'b']);
    await say('a', 1);
    listening.skip(1);
    await tick();
    await say('b', 1);
    expect(started).toEqual([0, 1]);
    listening.skip(1);
    await expect(listening.done).resolves.toBeUndefined();
  });

  it('plays at once a piece just heard when skipped back to', async () => {
    const { listening, say, speaks, started, playing, tick } = setUp(['a', 'b']);
    await say('a', 1);
    await say('b', 1);
    playing.shift()!();
    await tick();
    listening.skip(-1);
    await tick();
    expect(started).toEqual([0, 1, 0]);
    expect(speaks().filter((line) => line === 'speak a it M2')).toHaveLength(1);
  });

  it('makes again a piece heard longer ago than the ones kept', async () => {
    expect(KEPT_BEHIND).toBe(2);
    const { listening, log, say, speaks, started, playing, tick } = setUp(['a', 'b', 'c', 'd']);
    for (const text of ['a', 'b', 'c']) {
      await say(text, 1);
      playing.shift()!();
      await tick();
    }
    for (let i = 0; i < 3; i++) listening.skip(-1);
    await tick();
    // The voice gives up the piece it was making and turns back at once.
    expect(log).toContain('give up d');
    expect(speaks().filter((line) => line === 'speak a it M2')).toHaveLength(2);
    await say('a', 1);
    expect(started.at(-1)).toBe(0);
  });

  it('plays nothing made for a piece skipped past', async () => {
    const { listening, log, started, say, tick } = setUp(['a', 'b', 'c']);
    await say('a', 1);
    listening.skip(1);
    listening.skip(1);
    await tick();
    await say('b', 7);
    expect(log).not.toContain('play 7');
    expect(log).toContain('speak c it M2');
    await say('c', 3);
    expect(started).toEqual([0, 2]);
    expect(log.at(-1)).toBe('play 3');
  });

  it('gives up the piece being made when skipped past, and makes the one wanted', async () => {
    const { listening, log, say, speaks, tick } = setUp(['a', 'b', 'c']);
    await say('a', 1);
    expect(speaks()).toEqual(['speak a it M2', 'speak b it M2']);
    listening.skip(1);
    await tick();
    // b is the piece now wanted: the voice goes on with it.
    expect(log).not.toContain('give up b');
    listening.skip(1);
    await tick();
    expect(log).toContain('give up b');
    expect(speaks().at(-1)).toBe('speak c it M2');
  });

  it('gives up the piece being made when the reading stops, so the next one starts at once', async () => {
    const { listening, log, say } = setUp(['a', 'b']);
    await say('a', 1);
    listening.stop();
    expect(log).toContain('give up b');
    await expect(listening.done).resolves.toBeUndefined();
  });

  it('plays one piece at a time under quick skips', async () => {
    const texts = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const { listening, say, tick, most, started } = setUp(texts);
    for (const text of texts) await say(text, 1);
    for (let i = 0; i < 5; i++) listening.skip(1);
    await tick();
    await tick();
    expect(most()).toBe(1);
    expect(started).toEqual([0, 5]);
  });

  it('pause and resume reach the player', async () => {
    const { listening, log, say } = setUp(['a', 'b']);
    await say('a', 1);
    listening.pause();
    expect(listening.paused).toBe(true);
    listening.resume();
    expect(listening.paused).toBe(false);
    expect(log.slice(-2)).toEqual(['pause', 'resume']);
  });

  it('starts no new piece while paused', async () => {
    const { listening, log, say, playing, tick } = setUp(['a', 'b']);
    await say('a', 1);
    await say('b', 2);
    listening.pause();
    playing.shift()!();
    await tick();
    expect(log).not.toContain('play 2');
    listening.resume();
    await tick();
    expect(log).toContain('play 2');
  });

  it('pads each piece by its ending', async () => {
    const finish = { ...TODAY, pauses: { ...TODAY.pauses, paragraph: 0.5 } };
    const { played, say } = setUp(['a'], { finish, ends: 'paragraph', rate: 1000 });
    await say('a', 1000);
    expect(played[0]!.length).toBe(1000 + 0.5 * 1000);
  });

  it('stops at once while a piece plays, and reads nothing more', async () => {
    const { log, speaking, listening, tick } = setUp(['a', 'bb', 'ccc']);
    speaking.get('a')!(new Float32Array(1));
    await tick();
    listening.stop();
    speaking.get('bb')!(new Float32Array(2));
    await listening.done;
    await tick();
    expect(log).toEqual(['speak a it M2', 'speak bb it M2', 'play 1', 'give up bb']);
  });

  it('plays nothing made after it was stopped', async () => {
    const { log, speaking, listening } = setUp(['a', 'bb']);
    listening.stop();
    speaking.get('a')!(new Float32Array(1));
    await listening.done;
    expect(log).toEqual(['speak a it M2', 'give up a']);
  });

  it('ends with the error when a piece cannot be read', async () => {
    const { failing, listening } = setUp(['a', 'bb']);
    failing.get('a')!(new Error('The voice was stopped.'));
    await expect(listening.done).rejects.toThrow('The voice was stopped.');
  });

  it('ends at once when there is nothing to read', async () => {
    const { log, listening } = setUp([]);
    await expect(listening.done).resolves.toBeUndefined();
    expect(log).toEqual([]);
  });
});
