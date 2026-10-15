import { describe, expect, it } from 'vitest';
import { TODAY, encodeWav, type Finish } from '../../../src/voice/audio';
import { AHEAD_SECONDS, listen } from '../../../src/voice/listen';
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

/** No pause, no fade and no tone, so the samples played are the samples spoken. */
const BARE: Finish = {
  pauses: { piece: 0, paragraph: 0, heading: 0, chapter: 0 },
  fadeMs: 0,
  tone: false,
};

/** A narrator whose pieces finish when the test says, and a player that does the same. */
function setUp(texts: string[], options: { finish?: Finish; ends?: Ending; rate?: number } = {}) {
  const log: string[] = [];
  const speaking = new Map<string, (samples: Float32Array) => void>();
  const failing = new Map<string, (error: Error) => void>();
  const playing: (() => void)[] = [];
  const played: Float32Array[] = [];
  const waits: boolean[] = [];
  const started: number[] = [];
  let pending = 0;
  let most = 0;
  const narrator = {
    sampleRate: options.rate ?? 1,
    speak(text: string, lang: Lang, voice: VoiceId): Promise<Float32Array> {
      log.push(`speak ${text} ${lang} ${voice}`);
      return new Promise((resolve, reject) => {
        speaking.set(text, resolve);
        failing.set(text, reject);
      });
    },
  };
  const player = {
    play(samples: Float32Array, signal: AbortSignal): Promise<void> {
      log.push(`play ${samples.length}`);
      played.push(samples);
      most = Math.max(most, ++pending);
      return new Promise<void>((resolve) => {
        playing.push(resolve);
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

  it('makes more once a piece has played and is dropped', async () => {
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
    const { listening, started, say, tick } = setUp(['a', 'b', 'c']);
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
    listening.skip(1);
    await tick();
    expect(started).toEqual([0, 1, 2]);
    listening.skip(-1);
    await tick();
    // A piece skipped past counts as heard and is dropped, so going back makes it again.
    await say('b', 1);
    expect(started).toEqual([0, 1, 2, 1]);
  });

  it('makes again a piece skipped back to after it was dropped', async () => {
    const { listening, say, speaks, playing, tick } = setUp(['a', 'b']);
    await say('a', 1);
    await say('b', 1);
    playing.shift()!();
    await tick();
    listening.skip(-1);
    await tick();
    expect(speaks().filter((line) => line === 'speak a it M2')).toHaveLength(2);
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
    expect(log).toEqual(['speak a it M2', 'speak bb it M2', 'play 1']);
  });

  it('plays nothing made after it was stopped', async () => {
    const { log, speaking, listening } = setUp(['a', 'bb']);
    listening.stop();
    speaking.get('a')!(new Float32Array(1));
    await listening.done;
    expect(log).toEqual(['speak a it M2']);
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
