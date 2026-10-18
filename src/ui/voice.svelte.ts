/**
 * The voice as the reader sees it: whether it is set up, and the download.
 * The state lives here, not in the voice sheet, so a download carries on while
 * the sheet is closed and shows its progress when it opens again.
 */
import {
  VoiceUnfitError,
  downloadBytes,
  checkVoice,
  installVoice,
  removeVoice,
  voiceStatus,
  type VoiceStatus,
} from '../rooms/voice';
import type { VoiceId } from '../rooms/archivum';
import type { Lang } from '../voice/text';
import { voiceService } from '../voice/index';
import { NarratorKeeper } from '../voice/keep';
import { gpuAllowed, usesGraphics, type Narrator } from '../voice/narrator';
import { describeLoad } from '../voice/stopwatch';
import { app, changeSettings } from './state.svelte';
import { errorMessage, type Engine } from './text';

/**
 * The two readers, each with a recorded sample in each language, under
 * voice/<lang>/. Both read the same lines, written for Copista so the voices
 * can be compared: in Italian, "Mi ricordo ancora l'odore di quella cucina:
 * caffè, pane tostato e la radio sempre accesa. Mia nonna canticchiava senza
 * sapere le parole, e io facevo finta di leggere il giornale, con le gambe che
 * penzolavano dalla sedia."; in English, "I still remember the smell of that
 * kitchen: coffee, toast, and the radio always on. My grandmother hummed along
 * without knowing the words, and I pretended to read the newspaper, my legs
 * dangling from the chair."
 */
export const READERS: { id: VoiceId; name: string; sample: string }[] = [
  { id: 'M2', name: 'The Lector', sample: 'lector' },
  { id: 'F1', name: 'The Lectrix', sample: 'lectrix' },
];

/** The languages the samples are recorded in, each named in its own words. */
export const SAMPLE_LANGS: { lang: Lang; name: string }[] = [
  { lang: 'it', name: 'Italiano' },
  { lang: 'en', name: 'English' },
];

export const voice = $state<{
  status: VoiceStatus | null;
  /** The licence accepted, for the download about to start. */
  accepted: boolean;
  /** Just downloaded here, so the sheet offers to start listening. */
  ready: boolean;
  progress: { done: number; total: number } | null;
  /** The fitness test is under way. */
  checking: boolean;
  /** The test found the page not isolated yet, which a reload fixes. */
  reload: boolean;
  message: { tone: 'ok' | 'error'; text: string } | undefined;
  /** How the voice runs here, while it is loaded. */
  engine: Engine | null;
}>({
  status: null,
  accepted: false,
  ready: false,
  progress: null,
  checking: false,
  reload: false,
  message: undefined,
  engine: null,
});

let controller: AbortController | undefined;

/** The voice kept loaded between readings, and from one book to the next. */
const keeper = new NarratorKeeper(
  (gpu) => voiceService().narrator(gpu),
  () => {
    voice.engine = null;
  },
);

/** The narrator on the graphics chip or the processor, loaded already when it was kept. */
export function keptNarrator(gpu: boolean): Narrator {
  return keeper.narrator(gpu);
}

/** Whether the narrator has loaded. */
export function narratorLoaded(narrator: Narrator): boolean {
  return keeper.loaded(narrator);
}

/** Loads the narrator once; a failure lets the next Listen try again. */
export function loadNarrator(narrator: Narrator): Promise<void> {
  return keeper.load(narrator, () => {
    if (import.meta.env.DEV && narrator.loadTimes) console.debug(describeLoad(narrator.loadTimes));
    const { backend, threads, steps } = narrator;
    voice.engine = { backend, threads, steps, made: 0, took: 0 };
  });
}

/** Lets go of the voice's model, so the next reading loads it afresh. */
export function dropNarrator(): void {
  keeper.drop();
}

/**
 * Whether the page put away lets go of the voice: on a phone or a tablet,
 * which may need the memory, and only with nothing being read.
 */
function putAway(): boolean {
  return document.visibilityState === 'hidden' && !gpuAllowed();
}

/** A reading begins, which keeps the voice loaded until the function returned is called. */
export function beginReading(): () => void {
  const end = keeper.begin();
  return () => {
    end();
    if (putAway()) keeper.idle();
  };
}

if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (putAway()) keeper.idle();
  });

export async function measureVoice(): Promise<void> {
  voice.status = await voiceStatus().catch(() => ({ installed: false, bytes: 0, fit: null }));
}

export async function downloadVoice(): Promise<void> {
  if (controller) return;
  const current = (controller = new AbortController());
  voice.progress = { done: 0, total: downloadBytes(usesGraphics(app.settings.voiceChip)) };
  voice.message = undefined;
  try {
    await installVoice((done, total) => {
      voice.progress = { done, total };
    }, current.signal);
    await measureVoice();
  } catch (e) {
    voice.message =
      e instanceof DOMException && e.name === 'AbortError'
        ? { tone: 'ok', text: 'Download stopped. Next time it picks up where it left off.' }
        : { tone: 'error', text: errorMessage(e) };
    return;
  } finally {
    voice.progress = null;
    controller = undefined;
  }
  await testVoice();
}

/**
 * Tests whether this device can read aloud, right after the download or when
 * the reader asks to test again, so a device that cannot is told before it
 * tries, instead of stalling and freezing.
 */
export async function testVoice(again = false): Promise<void> {
  if (voice.checking) return;
  voice.checking = true;
  // A second copy of the model, for the test, would weigh too much beside the one kept.
  keeper.idle();
  voice.ready = false;
  voice.reload = false;
  voice.message = {
    tone: 'ok',
    text: 'Checking that this device can read aloud. It takes up to a minute, and the device may be slow meanwhile.',
  };
  try {
    await checkVoice(usesGraphics(app.settings.voiceChip), again);
    voice.ready = true;
    voice.message = { tone: 'ok', text: 'The voice is ready.' };
  } catch (e) {
    voice.reload = e instanceof VoiceUnfitError && e.reason === 'isolation';
    voice.message = { tone: 'error', text: errorMessage(e) };
  } finally {
    voice.checking = false;
    await measureVoice();
  }
}

export function cancelDownload(): void {
  controller?.abort();
}

export async function removeVoiceHere(): Promise<void> {
  try {
    await removeVoice();
    keeper.drop();
    await measureVoice();
    voice.accepted = false;
    voice.ready = false;
    voice.reload = false;
    voice.message = { tone: 'ok', text: 'The voice has been removed from this device.' };
  } catch (e) {
    voice.message = { tone: 'error', text: errorMessage(e) };
  }
}

export async function chooseReader(id: VoiceId): Promise<void> {
  try {
    await changeSettings({ voice: id });
  } catch (e) {
    voice.message = { tone: 'error', text: errorMessage(e) };
  }
}

/** Runs the voice on the graphics chip, or on the processor. */
export async function chooseGraphics(on: boolean): Promise<void> {
  try {
    await changeSettings({ voiceChip: on ? 'graphics' : 'processor' });
  } catch (e) {
    voice.message = { tone: 'error', text: errorMessage(e) };
  }
}
