import { CopistaError } from '../core/errors';

/** The cache that holds the voice: its files, the onnxruntime files and the profile. */
export const VOICE_CACHE = 'copista-voice-v1';
export const VOICE_HOST = 'huggingface.co';

const REVISION = 'cddb9ee79954ec63e65ebc147464b0610b648c2c';

/** Where a voice file is downloaded from: a fixed revision of the model repository. */
export function fileUrl(path: string): string {
  return `https://${VOICE_HOST}/GiuseppeSPk/copista-voice/resolve/${REVISION}/${path}`;
}

export interface VoiceFile {
  path: string;
  bytes: number;
  sha256: string;
}

export const FILES: readonly VoiceFile[] = [
  {
    path: 'onnx/duration_predictor.onnx',
    bytes: 1994137,
    sha256: '39429c60eb8f79bd7c152138bd8eb482c8ba667fc7d756b0e81258fdf51471d1',
  },
  {
    path: 'onnx/text_encoder.onnx',
    bytes: 18475126,
    sha256: '223f1807ffd7d58cb0a0fb8fc94564dfe4031068bf487dc3a0faa2b7bd71ceb4',
  },
  {
    path: 'onnx/vector_estimator.onnx',
    bytes: 128735449,
    sha256: 'aa0a3b717afcaa803d4baa37f48026a9bcafe43399359477aaa580fefdd443af',
  },
  {
    path: 'onnx/vocoder.onnx',
    bytes: 50811298,
    sha256: 'be7f961c7af823933522d6bf86393a10f95720697fc57426d8d2fc69e3d37582',
  },
  {
    path: 'onnx/tts.json',
    bytes: 8253,
    sha256: '42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09',
  },
  {
    path: 'onnx/unicode_indexer.json',
    bytes: 277676,
    sha256: '9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f',
  },
  {
    path: 'voice_styles/M2.json',
    bytes: 292055,
    sha256: 'b76cbf62bac707c710cf0ae5aba5e31eea1a6339a9734bfae33ab98499534a50',
  },
  {
    path: 'voice_styles/F1.json',
    bytes: 292046,
    sha256: 'bbdec6ee00231c2c742ad05483df5334cab3b52fda3ba38e6a07059c4563dbc2',
  },
];

export const TOTAL_BYTES = FILES.reduce((sum, f) => sum + f.bytes, 0);

export class VoiceDownloadError extends CopistaError {
  override name = 'VoiceDownloadError';
}

/** How the voice runs on this device, measured once by the self-test. */
export interface Profile {
  backend: 'webgpu' | 'wasm';
  steps: 6 | 8 | 16;
}

/**
 * The profile's key in the voice cache. It is never fetched. The name changed
 * when 16 steps were added, so devices measured before are measured again.
 */
const PROFILE = fileUrl('copista-profile-2.json');

/**
 * From the time a piece takes at 8 steps, as a share of its own length: 16 steps
 * when twice that is still below 0.8, 8 when it is below 0.8, else 6.
 */
export function pickSteps(rtf: number): 6 | 8 | 16 {
  if (rtf < 0.4) return 16;
  return rtf < 0.8 ? 8 : 6;
}

/**
 * Looks up an entry without opening the cache: opening creates it, and the
 * cache's presence is what turns cross-origin isolation on.
 */
async function lookup(url: string): Promise<Response | undefined> {
  if (typeof caches === 'undefined') return undefined;
  return caches.match(url, { cacheName: VOICE_CACHE });
}

async function hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reads a response's body, reporting each chunk's size as it arrives. */
async function download(
  response: Response,
  onChunk: (bytes: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onChunk(bytes.length);
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
    onChunk(value.length);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Fetches one file and checks it, once more if it arrives corrupted. */
async function fetchChecked(
  file: VoiceFile,
  onChunk: (bytes: number) => void,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let received = 0;
    let response: Response;
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      response = await fetch(fileUrl(file.path), { signal });
      if (!response.ok) {
        throw new VoiceDownloadError(`The voice could not be downloaded (${response.status}).`);
      }
      bytes = await download(response, (n) => {
        received += n;
        onChunk(n);
      });
    } catch (error) {
      if (isAbort(error) || error instanceof VoiceDownloadError) throw error;
      throw new VoiceDownloadError('The download stopped. Check the connection and try again.');
    }
    if ((await hex(bytes)) === file.sha256) return bytes;
    onChunk(-received);
  }
  throw new VoiceDownloadError('A voice file arrived damaged twice. Try again later.');
}

/**
 * Downloads the files not yet stored, checking each one. A download that
 * stops halfway keeps the files already finished, so the next one resumes.
 */
export async function install(
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
  files: readonly VoiceFile[] = FILES,
): Promise<void> {
  const cache = await caches.open(VOICE_CACHE);
  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  const missing: VoiceFile[] = [];
  let done = 0;
  for (const file of files) {
    if ((await cache.match(fileUrl(file.path))) === undefined) missing.push(file);
    else done += file.bytes;
  }
  onProgress(done, total);
  for (const file of missing) {
    let partial = 0;
    const bytes = await fetchChecked(
      file,
      (n) => {
        partial += n;
        onProgress(done + partial, total);
      },
      signal,
    );
    try {
      await cache.put(fileUrl(file.path), new Response(bytes));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new VoiceDownloadError('There is not enough space on this device for the voice.');
      }
      throw error;
    }
    done += file.bytes;
    onProgress(done, total);
  }
  await navigator.storage?.persist?.().catch(() => false);
}

export async function isInstalled(files: readonly VoiceFile[] = FILES): Promise<boolean> {
  for (const file of files) {
    if ((await lookup(fileUrl(file.path))) === undefined) return false;
  }
  return true;
}

/** Removes the voice: its files, the onnxruntime files and the profile. */
export async function remove(): Promise<void> {
  if (typeof caches !== 'undefined') await caches.delete(VOICE_CACHE);
}

/** The bytes the voice takes on this device. */
export async function spaceUsed(): Promise<number> {
  if (typeof caches === 'undefined' || !(await caches.has(VOICE_CACHE))) return 0;
  const cache = await caches.open(VOICE_CACHE);
  let bytes = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (response !== undefined) bytes += (await response.blob()).size;
  }
  return bytes;
}

/** A stored voice file. */
export async function readFile(path: string): Promise<ArrayBuffer> {
  const response = await lookup(fileUrl(path));
  if (response === undefined) {
    throw new VoiceDownloadError(
      'The voice is not installed. Set it up from Listen in the Lectorium.',
    );
  }
  return response.arrayBuffer();
}

export async function getProfile(): Promise<Profile | null> {
  const response = await lookup(PROFILE);
  if (response === undefined) return null;
  const p = (await response.json().catch(() => null)) as Partial<Profile> | null;
  const backendOk = p?.backend === 'webgpu' || p?.backend === 'wasm';
  return backendOk && (p.steps === 6 || p.steps === 8 || p.steps === 16)
    ? { backend: p.backend!, steps: p.steps }
    : null;
}

export async function saveProfile(p: Profile): Promise<void> {
  const cache = await caches.open(VOICE_CACHE);
  await cache.put(
    PROFILE,
    new Response(JSON.stringify(p), { headers: { 'Content-Type': 'application/json' } }),
  );
}
