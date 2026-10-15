import { describe, expect, it } from 'vitest';
import { encodeWav } from '../../../src/voice/audio';
import { listen } from '../../../src/voice/listen';
import type { Lang } from '../../../src/voice/text';
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

/** A narrator whose pieces finish when the test says, and a player that does the same. */
function setUp(texts: string[]) {
  const log: string[] = [];
  const speaking = new Map<string, (samples: Float32Array) => void>();
  const failing = new Map<string, (error: Error) => void>();
  const playing: (() => void)[] = [];
  const narrator = {
    speak(text: string, lang: Lang, voice: VoiceId): Promise<Float32Array> {
      log.push(`speak ${text} ${lang} ${voice}`);
      return new Promise((resolve, reject) => {
        speaking.set(text, resolve);
        failing.set(text, reject);
      });
    },
  };
  const play = (samples: Float32Array, signal: AbortSignal): Promise<void> => {
    log.push(`play ${samples.length}`);
    return new Promise((resolve) => {
      playing.push(resolve);
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  };
  const listening = listen(narrator, texts, 'it', 'M2', play);
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { log, speaking, failing, playing, listening, tick };
}

describe('listen', () => {
  it('reads each piece in turn, making the next one while the current one plays', async () => {
    const { log, speaking, playing, listening, tick } = setUp(['a', 'bb', 'ccc']);
    await tick();
    expect(log).toEqual(['speak a it M2']);
    speaking.get('a')!(new Float32Array(1));
    await tick();
    expect(log).toEqual(['speak a it M2', 'speak bb it M2', 'play 1']);
    speaking.get('bb')!(new Float32Array(2));
    await tick();
    expect(log).toHaveLength(3);
    playing.shift()!();
    await tick();
    expect(log.slice(3)).toEqual(['speak ccc it M2', 'play 2']);
    speaking.get('ccc')!(new Float32Array(3));
    playing.shift()!();
    await tick();
    expect(log.slice(5)).toEqual(['play 3']);
    playing.shift()!();
    await expect(listening.done).resolves.toBeUndefined();
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
