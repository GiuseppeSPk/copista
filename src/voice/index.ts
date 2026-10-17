/*
 * The voice as the rest of the app sees it: set up, removed, measured, and
 * a narrator to read with.
 */
import { FakeNarrator, WorkerNarrator, gpuAllowed, voiceWorker, type Narrator } from './narrator';
import { TOTAL_BYTES, install, isInstalled, remove, spaceUsed } from './store';

export interface VoiceService {
  isInstalled(): Promise<boolean>;
  install(onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<void>;
  remove(): Promise<void>;
  /** The bytes the voice takes on this device. */
  spaceUsed(): Promise<number>;
  narrator(): Narrator;
}

/** The onnxruntime-web files the voice loads from this site on first use (1.30.0). */
export const ENGINE_BYTES = 66_349 + 53_057 + 26_781_914;

/** What setting up the voice downloads, model and engine together. */
export const DOWNLOAD_BYTES = TOTAL_BYTES + ENGINE_BYTES;

/**
 * In development, this key in localStorage swaps the voice for a fake that
 * installs at once and reads silence, so tests need neither the model nor
 * the network. Its value is "installed" once the fake is set up.
 */
export const TEST_VOICE_KEY = 'copista-test-voice';

/** In development, the milliseconds the fake takes for each character, so a test can see the wait. */
export const TEST_VOICE_PACE_KEY = 'copista-test-voice-ms';

const real: VoiceService = {
  isInstalled: () => isInstalled(),
  install: (onProgress, signal) => install(onProgress, signal),
  remove,
  spaceUsed,
  narrator: () => new WorkerNarrator(voiceWorker, gpuAllowed()),
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
      onProgress((DOWNLOAD_BYTES * step) / 4, DOWNLOAD_BYTES);
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
    }),
};

/** The voice, or in development the fake when a test asks for it. */
export function voiceService(): VoiceService {
  if (import.meta.env.DEV && (globalThis.localStorage?.getItem(TEST_VOICE_KEY) ?? null) !== null) {
    return fake;
  }
  return real;
}
