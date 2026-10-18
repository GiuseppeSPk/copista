import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VoiceUnfitError,
  checkVoice,
  installVoice,
  removeVoice,
  voiceStatus,
} from '../../../src/rooms/voice/index';
import { TEST_VOICE_KEY, TEST_VOICE_UNFIT_KEY, voiceService } from '../../../src/voice/index';

beforeEach(() => {
  localStorage.setItem(TEST_VOICE_KEY, 'absent');
});

afterEach(() => {
  localStorage.clear();
});

describe('voice', () => {
  it('reports the voice absent, then installed, then removed', async () => {
    expect(await voiceStatus()).toEqual({ installed: false, bytes: 0, fit: null });

    const progress: [number, number][] = [];
    await installVoice((done, total) => progress.push([done, total]));
    expect(progress[0]![0]).toBe(0);
    expect(progress.at(-1)![0]).toBe(progress.at(-1)![1]);
    const status = await voiceStatus();
    expect(status.installed).toBe(true);
    expect(status.bytes).toBeGreaterThan(0);

    await removeVoice();
    expect(await voiceStatus()).toEqual({ installed: false, bytes: 0, fit: null });
  });

  it('stops the test install when it is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(installVoice(() => {}, controller.signal)).rejects.toThrow();
    expect((await voiceStatus()).installed).toBe(false);
  });

  it('gives the test voice a narrator that needs no model', () => {
    expect(voiceService().narrator(false).backend).toBe('fake');
  });

  it('tests the device: the test voice passes, and fails when a test asks it to', async () => {
    await installVoice(() => {});
    await expect(checkVoice(false)).resolves.toBeUndefined();
    expect((await voiceStatus()).fit).toBe(true);

    localStorage.setItem(TEST_VOICE_UNFIT_KEY, 'slow');
    await expect(checkVoice(false, true)).rejects.toBeInstanceOf(VoiceUnfitError);
    expect((await voiceStatus()).fit).toBe(false);
  });
});
