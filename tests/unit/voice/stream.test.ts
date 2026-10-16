import { afterEach, describe, expect, it, vi } from 'vitest';
import { Speaker } from '../../../src/voice/audio';
import { Stream, canStream, voiceOutput } from '../../../src/voice/stream';

afterEach(() => vi.unstubAllGlobals());

describe('what plays the voice', () => {
  it('is a sound for each piece where the browser has no Media Source, as Safari on an iPhone', () => {
    expect(canStream()).toBe(false);
    expect(voiceOutput()).toBeInstanceOf(Speaker);
  });

  it('is a sound for each piece where Media Source cannot take FLAC', () => {
    vi.stubGlobal('MediaSource', { isTypeSupported: () => false });
    expect(canStream()).toBe(false);
    expect(voiceOutput()).toBeInstanceOf(Speaker);
  });

  it('is one stream where Media Source takes FLAC in MP4', () => {
    const asked: string[] = [];
    vi.stubGlobal('MediaSource', {
      isTypeSupported: (type: string) => (asked.push(type), true),
    });
    expect(voiceOutput()).toBeInstanceOf(Stream);
    expect(asked).toEqual(['audio/mp4; codecs="flac"']);
  });
});
