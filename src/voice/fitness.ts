/*
 * Whether this device can read aloud. The worker runs one sentence on each
 * backend it may use and judges it here: fast enough to keep ahead of the ear,
 * and speech rather than noise. A device that fails is told so before it reads,
 * instead of stalling, buzzing and freezing the phone, as on a Galaxy Tab S7
 * and a Redmi Note 13 in October 2026.
 */
import { CopistaError } from '../core/errors';

/** Why a backend, or the device, cannot read aloud. */
export type Unfit =
  /** Slower than the voice it makes, even at 6 steps. */
  | 'slow'
  /** What came out was not speech: noise, silence or numbers that are not numbers. */
  | 'noise'
  /** The test did not end in time, and the worker was stopped. */
  | 'stalled'
  /** The engine failed to load or to run. */
  | 'failed'
  /** The page is not isolated yet, so wasm would run on one thread; a reload fixes it. */
  | 'isolation';

/** A backend's result: the steps it reads with, or why it cannot read. */
export type Verdict = { steps: 6 | 8 | 16 } | { unfit: Unfit };

/**
 * The time a piece takes at 8 steps, as a share of its own length, from which a
 * backend cannot keep up: 6 steps save only about a quarter of the work, and the
 * phone slows down further with its screen off.
 */
export const UNFIT_RTF = 1;

/** How long the test may take, warm-up included, before the worker is stopped. */
export const TEST_BUDGET_MS = 40_000;

/**
 * From the time a piece takes at 8 steps, as a share of its own length: 16 steps
 * when twice that is still below 0.8, 8 when it is below 0.8, 6 below UNFIT_RTF.
 */
export function pickSteps(rtf: number): 6 | 8 | 16 | null {
  if (rtf < 0.4) return 16;
  if (rtf < 0.8) return 8;
  return rtf < UNFIT_RTF ? 6 : null;
}

/** Frames of 20 ms. */
const FRAME_SECONDS = 0.02;
/** A frame this far below the loudest is a gap between words. */
const QUIET_DB = -30;
/**
 * The share of quiet frames speech has at least. The test sentence read well has
 * 0.35 to 0.41; the vocoder fed raw noise, as when the denoiser gives garbage,
 * has 0.05, and steady noise, a buzz or a stuck loop have none.
 */
const MIN_QUIET = 0.15;

/**
 * Whether the samples sound like speech: numbers that are numbers, loud enough
 * to hear, not clipped beyond reason, and with gaps between the words.
 */
export function soundsLikeSpeech(samples: Float32Array, sampleRate: number): boolean {
  const size = Math.round(FRAME_SECONDS * sampleRate);
  const frames = Math.floor(samples.length / size);
  if (frames < 10) return false;
  let peak = 0;
  const energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * size; i < (f + 1) * size; i++) {
      const s = samples[i]!;
      if (!Number.isFinite(s)) return false;
      peak = Math.max(peak, Math.abs(s));
      sum += s * s;
    }
    energy[f] = sum / size;
  }
  if (peak < 0.02 || peak > 4) return false;
  const loudest = Math.max(...energy);
  const floor = loudest * 10 ** (QUIET_DB / 10);
  const quiet = energy.filter((e) => e < floor).length;
  return quiet / frames >= MIN_QUIET;
}

/** The verdict on one sentence read at 8 steps in `seconds`. */
export function judge(samples: Float32Array, sampleRate: number, seconds: number): Verdict {
  if (!soundsLikeSpeech(samples, sampleRate)) return { unfit: 'noise' };
  const steps = pickSteps(seconds / Math.max(samples.length / sampleRate, 0.1));
  return steps === null ? { unfit: 'slow' } : { steps };
}

/** The voice cannot read aloud on this device, or not yet. */
export class VoiceUnfitError extends CopistaError {
  override name = 'VoiceUnfitError';

  constructor(readonly reason: Unfit) {
    super(
      reason === 'isolation'
        ? 'Reload Copista to finish setting up the voice, then try again.'
        : 'This device is not fast enough for the voice: it would stall, or slow the whole device down. You can remove the voice to free its space.',
    );
  }
}
