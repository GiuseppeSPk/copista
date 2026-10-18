/*
 * The voice as the rest of the app sees it: set up, removed, measured, and
 * a narrator to read with.
 */
import { buildBytes, ortBuild } from './engine';
import type { Unfit } from './fitness';
import { FakeNarrator, WorkerNarrator, voiceWorker, type Narrator } from './narrator';
import {
  TOTAL_BYTES,
  forgetProfile,
  getProfile,
  install,
  isFit,
  isInstalled,
  remove,
  saveVerdict,
  spaceUsed,
} from './store';

export interface VoiceService {
  isInstalled(): Promise<boolean>;
  install(onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<void>;
  remove(): Promise<void>;
  /** The bytes the voice takes on this device. */
  spaceUsed(): Promise<number>;
  /** A narrator on the graphics chip, or else on the processor. */
  narrator(gpu: boolean): Narrator;
  /** Whether the device passed the fitness test, failed it, or has not taken it (null). */
  isFit(): Promise<boolean | null>;
  /** Forgets the test's results, so the next load tests the device again. */
  forgetFitness(): Promise<void>;
}

/**
 * What setting up the voice downloads, model and engine together: the engine
 * this device loads from this site on first use, on the graphics chip or not.
 */
export function downloadBytes(gpu: boolean): number {
  return TOTAL_BYTES + buildBytes(ortBuild(gpu));
}

/**
 * In development, this key in localStorage swaps the voice for a fake that
 * installs at once and reads silence, so tests need neither the model nor
 * the network. Its value is "installed" once the fake is set up.
 */
export const TEST_VOICE_KEY = 'copista-test-voice';

/** In development, why the fake fails its fitness test, when a test wants it to. */
export const TEST_VOICE_UNFIT_KEY = 'copista-test-voice-unfit';

/** In development, the milliseconds the fake takes for each character, so a test can see the wait. */
export const TEST_VOICE_PACE_KEY = 'copista-test-voice-ms';

/** In development, the milliseconds the fake takes to load, so a test can see it warm up. */
export const TEST_VOICE_LOAD_KEY = 'copista-test-voice-load-ms';

const real: VoiceService = {
  isInstalled: () => isInstalled(),
  install: (onProgress, signal) => install(onProgress, signal),
  remove,
  spaceUsed,
  narrator: (gpu) => new WorkerNarrator(voiceWorker, gpu, saveVerdict),
  isFit: async () => isFit(await getProfile()),
  forgetFitness: forgetProfile,
};

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(new DOMException('The download was cancelled.', 'AbortError'));
    if (signal?.aborted) return abort();
    setTimeout(resolve, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

const fake: VoiceService = {
  isInstalled: async () => localStorage.getItem(TEST_VOICE_KEY) === 'installed',
  async install(onProgress, signal) {
    for (let step = 0; step <= 4; step++) {
      await wait(step === 0 ? 0 : 250, signal);
      onProgress((TOTAL_BYTES * step) / 4, TOTAL_BYTES);
    }
    localStorage.setItem(TEST_VOICE_KEY, 'installed');
  },
  async remove() {
    localStorage.setItem(TEST_VOICE_KEY, 'absent');
  },
  spaceUsed: async () => (localStorage.getItem(TEST_VOICE_KEY) === 'installed' ? TOTAL_BYTES : 0),
  // Quick, so a test hears a page out in seconds; the pause after each piece still counts.
  narrator: () =>
    new FakeNarrator({
      msPerChar: Number(localStorage.getItem(TEST_VOICE_PACE_KEY) ?? 1),
      secondsPerChar: 0.002,
      loadMs: Number(localStorage.getItem(TEST_VOICE_LOAD_KEY) ?? 0),
      unfit: (localStorage.getItem(TEST_VOICE_UNFIT_KEY) as Unfit | null) ?? undefined,
    }),
  isFit: async () => localStorage.getItem(TEST_VOICE_UNFIT_KEY) === null,
  forgetFitness: async () => {},
};

/** The voice, or in development the fake when a test asks for it. */
export function voiceService(): VoiceService {
  if (import.meta.env.DEV && (globalThis.localStorage?.getItem(TEST_VOICE_KEY) ?? null) !== null) {
    return fake;
  }
  return real;
}
