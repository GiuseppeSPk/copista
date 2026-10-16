/*
 * The worker that runs the voice. onnxruntime-web is loaded here only, from
 * the copy served under ort/, so it never weighs on the page.
 */
import { VoiceUnfitError, judge, type Unfit, type Verdict } from './fitness';
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
import { getProfile, readFile, saveVerdict } from './store';
import {
  Supertonic,
  parseStyle,
  type ModelBytes,
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

type Backend = 'webgpu' | 'wasm';

let ort: OrtModule | null = null;
let tts: Supertonic | null = null;
let backend: Backend = 'wasm';
let steps: 6 | 8 | 16 = 8;
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
  if (navigator.gpu === undefined) return false;
  return (await navigator.gpu.requestAdapter().catch(() => null)) !== null;
}

/**
 * Reads one sentence at 8 steps, after a short one to warm the backend up, and
 * judges it: whether it sounds like speech, and how many steps keep up.
 */
async function fitnessTest(voice: Supertonic): Promise<Verdict> {
  const s = await style('M2');
  await voice.speak(WARM_UP, 'it', s, 8, SPEED, SEED.M2);
  const start = performance.now();
  const samples = await voice.speak(SELF_TEST, 'it', s, 8, SPEED, SEED.M2);
  return judge(samples, voice.sampleRate, (performance.now() - start) / 1000);
}

interface Files {
  models: ModelBytes;
  cfg: TtsConfig;
  indexer: number[];
}

async function files(): Promise<Files> {
  return {
    models: {
      durationPredictor: await bytes('onnx/duration_predictor.onnx'),
      textEncoder: await bytes('onnx/text_encoder.onnx'),
      vectorEstimator: await bytes('onnx/vector_estimator.onnx'),
      vocoder: await bytes('onnx/vocoder.onnx'),
    },
    cfg: (await json('onnx/tts.json')) as TtsConfig,
    indexer: (await json('onnx/unicode_indexer.json')) as number[],
  };
}

/**
 * Opens the voice on a backend and, the first time, tests it there, telling
 * the page first so it can stop a test that freezes the device. Keeps the
 * voice when it passes.
 */
async function tryBackend(
  on: Backend,
  known: Verdict | undefined,
  read: Files,
  testing: () => void,
): Promise<Verdict> {
  let voice: Supertonic;
  let verdict: Verdict;
  try {
    voice = await Supertonic.create(await loadOrt(), read.models, read.cfg, read.indexer, {
      backend: on,
    });
  } catch (error) {
    if (on === 'wasm') throw error;
    await saveVerdict(on, (verdict = { unfit: 'failed' }));
    return verdict;
  }
  if (known === undefined) {
    testing();
    try {
      verdict = await fitnessTest(voice);
    } catch {
      verdict = { unfit: 'failed' };
    }
    await saveVerdict(on, verdict);
  } else {
    verdict = known;
  }
  if ('steps' in verdict) {
    tts = voice;
    backend = on;
    steps = verdict.steps;
  } else {
    await voice.release().catch(() => {});
  }
  return verdict;
}

/**
 * Loads the voice on WebGPU when there is one and it passed, else on wasm when
 * it passed; a backend never tested is tested first. Wasm on a single thread,
 * before the page is isolated, is never good enough and is not tried.
 */
async function load(testing: (on: Backend) => void = () => {}): Promise<void> {
  if (tts !== null) return;
  const profile = await getProfile();
  const reasons: Unfit[] = [];
  const candidates: Backend[] = [];
  for (const on of ['webgpu', 'wasm'] as const) {
    const known = profile[on];
    if (known && 'unfit' in known) reasons.push(known.unfit);
    else if (on === 'webgpu' && !(await hasWebGpu())) continue;
    else if (on === 'wasm' && !scope.crossOriginIsolated) reasons.push('isolation');
    else candidates.push(on);
  }
  if (candidates.length > 0) {
    const read = await files();
    for (const on of candidates) {
      const verdict = await tryBackend(on, profile[on], read, () => testing(on));
      if ('steps' in verdict) return;
      reasons.push(verdict.unfit);
    }
  }
  // A reload helps only when it is all that is missing.
  throw new VoiceUnfitError(reasons.includes('isolation') ? 'isolation' : (reasons[0] ?? 'failed'));
}

async function close(): Promise<void> {
  await tts?.release();
  tts = null;
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
      steps,
      tuning.speed ?? SPEED,
      tuning.seed ?? SEED[voice],
      { fixes: tuning.fixes ?? FIXES, noise: tuning.noise },
    );
  try {
    return await run();
  } catch (error) {
    if (!isDeviceLost(error) || backend !== 'webgpu') throw error;
    // WebGPU lost once tends to stay lost on that device: wasm from now on.
    await saveVerdict('webgpu', { unfit: 'failed' });
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
      await load((on) => scope.postMessage({ id: message.id, type: 'testing', backend: on }, []));
      return { id: message.id, type: 'ready', sampleRate: tts!.sampleRate, backend, steps };
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
      reply =
        error instanceof VoiceUnfitError
          ? { id: data.id, type: 'unfit', reason: error.reason }
          : {
              id: data.id,
              type: 'error',
              message: error instanceof Error ? error.message : String(error),
            };
    }
    scope.postMessage(reply, reply.type === 'audio' ? [reply.samples.buffer] : []);
  });
};
