import { voiceService } from '../../voice/index';

export { DOWNLOAD_BYTES } from '../../voice/index';
export { VOICE_HOST } from '../../voice/store';

export interface VoiceStatus {
  installed: boolean;
  /** The bytes the voice takes on this device. */
  bytes: number;
}

export async function voiceStatus(): Promise<VoiceStatus> {
  const voice = voiceService();
  const installed = await voice.isInstalled();
  return { installed, bytes: installed ? await voice.spaceUsed() : 0 };
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
