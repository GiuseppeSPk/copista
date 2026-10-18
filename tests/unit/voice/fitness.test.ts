import { describe, expect, it } from 'vitest';
import {
  UNFIT_RTF,
  VoiceUnfitError,
  judge,
  pickSteps,
  soundsLikeSpeech,
} from '../../../src/voice/fitness';

const RATE = 8000;

/** Words of 250 ms, a voiced buzz with a little noise, and gaps of 120 ms between them. */
function speech(seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const inWord = t % 0.37 < 0.25;
    out[i] = inWord ? 0.3 * Math.sin(2 * Math.PI * 140 * t) + 0.02 * Math.sin(i * 12.9898) : 0;
  }
  return out;
}

function whiteNoise(seconds: number, amplitude = 0.1): Float32Array {
  let seed = 7;
  return Float32Array.from({ length: Math.round(seconds * RATE) }, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff - 0.5) * 2 * amplitude;
  });
}

describe('soundsLikeSpeech', () => {
  it('hears words with gaps between them as speech', () => {
    expect(soundsLikeSpeech(speech(3), RATE)).toBe(true);
  });

  it('turns down steady noise, a buzz and a stuck loop, which have no gaps', () => {
    expect(soundsLikeSpeech(whiteNoise(3), RATE)).toBe(false);
    const buzz = Float32Array.from(
      { length: 3 * RATE },
      (_, i) => Math.sign(Math.sin((2 * Math.PI * 120 * i) / RATE)) * 0.3,
    );
    expect(soundsLikeSpeech(buzz, RATE)).toBe(false);
    const word = speech(0.2);
    const loop = new Float32Array(3 * RATE).map((_, i) => word[i % word.length]!);
    expect(soundsLikeSpeech(loop, RATE)).toBe(false);
  });

  it('turns down silence, numbers that are not numbers, wild peaks and a sound too short', () => {
    expect(soundsLikeSpeech(new Float32Array(3 * RATE), RATE)).toBe(false);
    const nan = speech(3);
    nan[100] = NaN;
    expect(soundsLikeSpeech(nan, RATE)).toBe(false);
    expect(
      soundsLikeSpeech(
        speech(3).map((s) => s * 40),
        RATE,
      ),
    ).toBe(false);
    expect(soundsLikeSpeech(speech(0.1), RATE)).toBe(false);
  });
});

describe('pickSteps', () => {
  it('uses 16 steps when the device has room for twice the work, else 8, else 6, else none', () => {
    expect(pickSteps(0.39)).toBe(16);
    expect(pickSteps(0.4)).toBe(8);
    expect(pickSteps(0.79)).toBe(8);
    expect(pickSteps(0.8)).toBe(6);
    expect(pickSteps(UNFIT_RTF - 0.01)).toBe(6);
    expect(pickSteps(UNFIT_RTF)).toBeNull();
    expect(pickSteps(4)).toBeNull();
  });
});

describe('judge', () => {
  it('passes speech made in time, with the steps that keep up', () => {
    expect(judge(speech(3), RATE, 1)).toEqual({ steps: 16 });
    expect(judge(speech(3), RATE, 2.7)).toEqual({ steps: 6 });
  });

  it('fails speech made too slowly, and noise however fast', () => {
    expect(judge(speech(3), RATE, 3.5)).toEqual({ unfit: 'slow' });
    expect(judge(whiteNoise(3), RATE, 0.5)).toEqual({ unfit: 'noise' });
  });
});

describe('VoiceUnfitError', () => {
  it('asks for a reload when only isolation is missing, and says the device is too slow otherwise', () => {
    expect(new VoiceUnfitError('isolation').message).toMatch(/Reload/);
    expect(new VoiceUnfitError('stalled').message).toMatch(/not fast enough/);
    expect(new VoiceUnfitError('noise').reason).toBe('noise');
  });
});
