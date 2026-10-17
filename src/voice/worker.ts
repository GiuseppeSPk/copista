/*
 * The worker that runs the voice. onnxruntime-web is loaded here only, from
 * the copy served under ort/, so it never weighs on the page.
 */
import {
  FIXES,
  SEED,
  SPEED,
  isDeviceLost,
  type Tuning,
  type VoiceId,
  type WorkerReply,
  type WorkerRequest,
} from './narrator';
import { getProfile, pickSteps, readFile, saveProfile, type Profile } from './store';
import {
  Supertonic,
  parseStyle,
  type ModelName,
  type OrtModule,
  type Style,
  type TtsConfig,
} from './supertonic';
import type { Lang } from './text';

/** The worker's global scope, as far as it is used here (the app is typed with the DOM). */
interface WorkerScope {
  readonly location: Location;
  readonly crossOriginIsolated: boolean;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

const ORT_DIR = new URL(`${import.meta.env.BASE_URL}ort/1.30.0/`, scope.location.href).href;
const WARM_UP = 'Buongiorno.';
const SELF_TEST = 'Buongiorno, oggi leggiamo insieme un racconto.';

let ort: OrtModule | null = null;
let tts: Supertonic | null = null;
let profile: Profile | null = null;
/** Set once WebGPU fails, or when the page asks for wasm: this worker stays on wasm from then on. */
let wasmOnly = false;
const styles = new Map<VoiceId, Style>();

async function loadOrt(): Promise<OrtModule> {
  if (ort !== null) return ort;
  const module = (await import(/* @vite-ignore */ `${ORT_DIR}ort.webgpu.min.mjs`)) as OrtModule;
  module.env.wasm.wasmPaths = ORT_DIR;
  module.env.wasm.numThreads = scope.crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency || 1)
    : 1;
  return (ort = module);
}

const MODEL_FILES: Record<ModelName, string> = {
  durationPredictor: 'duration_predictor',
  textEncoder: 'text_encoder',
  vectorEstimator: 'vector_estimator',
  vocoder: 'vocoder',
};

async function bytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path));
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await readFile(path)));
}

async function style(voice: VoiceId): Promise<Style> {
  let s = styles.get(voice);
  if (s === undefined)
    styles.set(voice, (s = parseStyle(await json(`voice_styles/${voice}.json`))));
  return s;
}

async function hasWebGpu(): Promise<boolean> {
  if (wasmOnly || navigator.gpu === undefined) return false;
  return (await navigator.gpu.requestAdapter().catch(() => null)) !== null;
}

/** Times one sentence at 8 steps, after a short one to warm the backend up. */
async function selfTest(voice: Supertonic): Promise<6 | 8 | 16> {
  const s = await style('M2');
  await voice.speak(WARM_UP, 'it', s, 8, SPEED, SEED.M2);
  const start = performance.now();
  const samples = await voice.speak(SELF_TEST, 'it', s, 8, SPEED, SEED.M2);
  const seconds = samples.length / voice.sampleRate;
  return pickSteps((performance.now() - start) / 1000 / Math.max(seconds, 0.1));
}

async function open(backend: 'webgpu' | 'wasm'): Promise<void> {
  const cfg = (await json('onnx/tts.json')) as TtsConfig;
  const indexer = (await json('onnx/unicode_indexer.json')) as number[];
  const voice = await Supertonic.create(
    await loadOrt(),
    (model) => bytes(`onnx/${MODEL_FILES[model]}.onnx`),
    cfg,
    indexer,
    { backend },
  );
  try {
    const stored = await getProfile();
    if (stored === null || stored.backend !== backend) {
      profile = { backend, steps: await selfTest(voice) };
      await saveProfile(profile);
    } else {
      profile = stored;
      // The first pieces made after loading take longer; made here, the reader's do not.
      await voice.speak(SELF_TEST, 'it', await style('M2'), profile.steps, SPEED, SEED.M2);
    }
  } catch (error) {
    await voice.release();
    throw error;
  }
  tts = voice;
}

async function close(): Promise<void> {
  await tts?.release();
  tts = null;
}

/** Loads the voice on WebGPU when there is one, and on wasm when WebGPU fails. */
async function load(): Promise<void> {
  if (tts !== null) return;
  if (await hasWebGpu()) {
    try {
      return await open('webgpu');
    } catch {
      wasmOnly = true;
    }
  }
  await open('wasm');
}

async function speak(
  text: string,
  lang: Lang,
  voice: VoiceId,
  tuning: Tuning = {},
): Promise<Float32Array> {
  await load();
  const run = async (): Promise<Float32Array> =>
    tts!.speak(
      text,
      lang,
      await style(voice),
      profile!.steps,
      tuning.speed ?? SPEED,
      tuning.seed ?? SEED[voice],
      { fixes: tuning.fixes ?? FIXES, noise: tuning.noise },
    );
  try {
    return await run();
  } catch (error) {
    if (!isDeviceLost(error) || profile?.backend !== 'webgpu') throw error;
    wasmOnly = true;
    await close().catch(() => {});
    await load();
    return run();
  }
}

/** Opens a model on wasm and runs it once on [42], to check the engine loads at all. */
async function probe(model: ArrayBuffer): Promise<Float32Array> {
  const o = await loadOrt();
  const session = await o.InferenceSession.create(new Uint8Array(model), {
    executionProviders: ['wasm'],
  });
  try {
    const input = new o.Tensor('float32', new Float32Array([42]), [1]);
    const output = await session.run({ [session.inputNames[0]!]: input });
    return output[session.outputNames[0]!]!.data as Float32Array;
  } finally {
    await session.release();
  }
}

async function handle(message: WorkerRequest): Promise<WorkerReply> {
  switch (message.type) {
    case 'load':
      if (!message.gpu) wasmOnly = true;
      await load();
      return {
        id: message.id,
        type: 'ready',
        sampleRate: tts!.sampleRate,
        backend: profile!.backend,
        steps: profile!.steps,
        threads: ort!.env.wasm.numThreads ?? 1,
      };
    case 'speak':
      return {
        id: message.id,
        type: 'audio',
        samples: await speak(message.text, message.lang, message.voice, message.tuning),
      };
    case 'probe':
      return { id: message.id, type: 'audio', samples: await probe(message.model) };
  }
}

/** One request at a time: the models are never run twice at once. */
let queue: Promise<void> = Promise.resolve();

scope.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  queue = queue.then(async () => {
    let reply: WorkerReply;
    try {
      reply = await handle(data);
    } catch (error) {
      reply = {
        id: data.id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
    scope.postMessage(reply, reply.type === 'audio' ? [reply.samples.buffer] : []);
  });
};
