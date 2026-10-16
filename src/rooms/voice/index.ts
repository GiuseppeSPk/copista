import { voiceService } from '../../voice/index';

export { DOWNLOAD_BYTES } from '../../voice/index';
export { VOICE_HOST } from '../../voice/store';
export { VoiceUnfitError } from '../../voice/fitness';

export interface VoiceStatus {
  installed: boolean;
  /** The bytes the voice takes on this device. */
  bytes: number;
  /** Whether this device passed the fitness test, failed it, or has not taken it (null). */
  fit: boolean | null;
}

export async function voiceStatus(): Promise<VoiceStatus> {
  const voice = voiceService();
  const installed = await voice.isInstalled();
  return {
    installed,
    bytes: installed ? await voice.spaceUsed() : 0,
    fit: installed ? await voice.isFit() : null,
  };
}

/**
 * Tests whether this device can read aloud, by loading the voice once, and
 * lets go of it. Rejects with VoiceUnfitError when it cannot. With `again`,
 * the earlier results are forgotten first.
 */
export async function checkVoice(again = false): Promise<void> {
  const voice = voiceService();
  if (again) await voice.forgetFitness();
  const narrator = voice.narrator();
  try {
    await narrator.load();
  } finally {
    narrator.destroy();
  }
}

/** Downloads the voice, resuming where an earlier download stopped. */
export function installVoice(
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return voiceService().install(onProgress, signal);
}

/** Removes the voice and frees its space. */
export function removeVoice(): Promise<void> {
  return voiceService().remove();
}
