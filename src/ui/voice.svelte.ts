/**
 * The voice as the reader sees it: whether it is set up, and the download.
 * The state lives here, not in the voice sheet, so a download carries on while
 * the sheet is closed and shows its progress when it opens again.
 */
import {
  DOWNLOAD_BYTES,
  installVoice,
  removeVoice,
  voiceStatus,
  type VoiceStatus,
} from '../rooms/auditorium';
import type { VoiceId } from '../rooms/archivum';
import { changeSettings } from './state.svelte';
import { errorMessage } from './text';

/** The two readers, each with a recorded sample: Collodi for the Lector, Manzoni for the Lectrix. */
export const READERS: { id: VoiceId; name: string; sample: string; from: string }[] = [
  { id: 'M2', name: 'The Lector', sample: 'voice/lector', from: 'Pinocchio, Collodi' },
  { id: 'F1', name: 'The Lectrix', sample: 'voice/lectrix', from: 'I promessi sposi, Manzoni' },
];

export const voice = $state<{
  status: VoiceStatus | null;
  /** The licence accepted, for the download about to start. */
  accepted: boolean;
  /** Just downloaded here, so the sheet offers to start listening. */
  ready: boolean;
  progress: { done: number; total: number } | null;
  message: { tone: 'ok' | 'error'; text: string } | undefined;
}>({ status: null, accepted: false, ready: false, progress: null, message: undefined });

let controller: AbortController | undefined;

export async function measureVoice(): Promise<void> {
  voice.status = await voiceStatus().catch(() => ({ installed: false, bytes: 0 }));
}

export async function downloadVoice(): Promise<void> {
  if (controller) return;
  const current = (controller = new AbortController());
  voice.progress = { done: 0, total: DOWNLOAD_BYTES };
  voice.message = undefined;
  try {
    await installVoice((done, total) => (voice.progress = { done, total }), current.signal);
    await measureVoice();
    voice.ready = true;
    voice.message = { tone: 'ok', text: 'The voice is ready.' };
  } catch (e) {
    voice.message =
      e instanceof DOMException && e.name === 'AbortError'
        ? { tone: 'ok', text: 'Download stopped. Next time it picks up where it left off.' }
        : { tone: 'error', text: errorMessage(e) };
  } finally {
    voice.progress = null;
    controller = undefined;
  }
}

export function cancelDownload(): void {
  controller?.abort();
}

export async function removeVoiceHere(): Promise<void> {
  try {
    await removeVoice();
    await measureVoice();
    voice.accepted = false;
    voice.ready = false;
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
