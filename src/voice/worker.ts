/*
 * The worker that runs the voice. onnxruntime-web is loaded here only, from
 * the copy served under ort/, so it never weighs on the page.
 */
import { ORT_BUILDS, ortBuild } from './engine';
import { VoiceUnfitError, judge, type Unfit, type Verdict } from './fitness';
import {
  FIXES,
  SEED,
  SPEED,
  isDeviceLost,
  type LoadTimes,
  type Tuning,
  type VoiceId,
  type WorkerReply,
  type WorkerRequest,
} from './narrator';
import { getProfile, readFile, saveVerdict } from './store';
import { StressList } from './stress';
import stressUrl from './stress-it.txt?url';
import {
  Supertonic,
  parseStyle,
  type ModelName,
  type PieceTimes,
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
/** Set once WebGPU fails: this worker stays on wasm from then on. */
let wasmOnly = false;
/** Whether the graphics chip is tried before the processor, as on a computer. */
let gpuFirst = true;
/** Whether the engine loaded, or to load, is the one with WebGPU. */
let gpuBuild = true;
const styles = new Map<VoiceId, Style>();
/** How long the last load took, for the stopwatch in development. */
let times: LoadTimes = { engine: 0, sessions: {}, warmUp: 0, total: 0 };

/**
 * Loads onnxruntime-web once: the build for wasm alone when the processor is
 * tried first, else one with WebGPU, which wasm falls back on when the device
 * is lost.
 */
async function loadOrt(): Promise<OrtModule> {
  if (ort !== null) return ort;
  const start = performance.now();
  const { entry } = ORT_BUILDS[ortBuild(gpuBuild)];
  const module = (await import(/* @vite-ignore */ `${ORT_DIR}${entry}`)) as OrtModule;
  module.env.wasm.wasmPaths = ORT_DIR;
  module.env.wasm.numThreads = scope.crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency || 1)
    : 1;
  times.engine = performance.now() - start;
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
  cfg: TtsConfig;
  indexer: number[];
  stress: StressList | undefined;
}

/**
 * Where the stress falls in Italian words, 7.3 MB, fetched with the voice and
 * kept with it. Without it, as offline before it was first fetched, the voice
 * reads as it did before it was written.
 */
async function stressList(): Promise<StressList | undefined> {
  try {
    const response = await fetch(stressUrl);
    return response.ok ? new StressList(await response.text()) : undefined;
  } catch {
    return undefined;
  }
}

async function files(): Promise<Files> {
  const stress = stressList();
  return {
    cfg: (await json('onnx/tts.json')) as TtsConfig,
    indexer: (await json('onnx/unicode_indexer.json')) as number[],
    stress: await stress,
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
  // A phone whose graphics chip crashes the page, as an iPhone's did, would
  // crash it again on every load: it is marked failed until the test passes.
  if (known === undefined && on === 'webgpu' && !gpuFirst)
    await saveVerdict(on, { unfit: 'failed' });
  try {
    voice = await Supertonic.create(
      await loadOrt(),
      (model) => bytes(`onnx/${MODEL_FILES[model]}.onnx`),
      read.cfg,
      read.indexer,
      { backend: on, times: (times.sessions = {}), stress: read.stress },
    );
  } catch (error) {
    if (on === 'wasm') throw error;
    await saveVerdict(on, (verdict = { unfit: 'failed' }));
    return verdict;
  }
  // Once tested, the voice reads at once: a sentence read first to warm it up
  // put off the reader's first word, by 1.8 s on wasm and 1.6 s on WebGPU, and
  // "Buongiorno." at one step by 0.3 and 0.1 s, while the first piece after
  // either came at most 0.15 s sooner.
  const warming = performance.now();
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
  times.warmUp = performance.now() - warming;
  if ('steps' in verdict) {
    tts = voice;
    backend = on;
    steps = verdict.steps;
  } else {
    await voice.release().catch(() => {});
  }
  return verdict;
}

/** The processor failed on the engine built for it alone, and WebGPU is still to try. */
class EngineSwitch extends Error {}

/**
 * Loads the voice on the first backend that passed, WebGPU before wasm on a
 * computer and after it on a phone; a backend never tested is tested first.
 * Wasm on a single thread, before the page is isolated, is never good enough
 * and is not tried.
 */
async function load(testing: (on: Backend) => void = () => {}): Promise<void> {
  if (tts !== null) return;
  const start = performance.now();
  times = { engine: 0, sessions: {}, warmUp: 0, total: 0 };
  const profile = await getProfile();
  const reasons: Unfit[] = [];
  const candidates: Backend[] = [];
  const order: Backend[] = gpuFirst ? ['webgpu', 'wasm'] : ['wasm', 'webgpu'];
  for (const on of order) {
    const known = profile[on];
    if (known && 'unfit' in known) reasons.push(known.unfit);
    else if (on === 'webgpu' && !(await hasWebGpu())) continue;
    else if (on === 'wasm' && !scope.crossOriginIsolated) reasons.push('isolation');
    else candidates.push(on);
  }
  if (ort === null) gpuBuild = candidates[0] === 'webgpu';
  if (candidates.length > 0) {
    const read = await files();
    for (const on of candidates) {
      if (on === 'webgpu' && !gpuBuild) throw new EngineSwitch();
      const verdict = await tryBackend(on, profile[on], read, () => testing(on));
      if ('steps' in verdict) {
        times.total = performance.now() - start;
        return;
      }
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
  isGivenUp: () => boolean = () => false,
  pieceTimes?: PieceTimes,
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
      {
        fixes: tuning.fixes ?? FIXES,
        noise: tuning.noise,
        givenUp: isGivenUp,
        ...(pieceTimes && { times: pieceTimes }),
      },
    );
  try {
    return await run();
  } catch (error) {
    if (!isDeviceLost(error) || backend !== 'webgpu') throw error;
    // WebGPU lost once tends to stay lost on that device: wasm from now on.
    await saveVerdict('webgpu', { unfit: 'failed' });
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

/** The pieces waiting their turn or being made, and those of them given up. */
const asked = new Set<number>();
const givenUp = new Set<number>();

async function handle(message: WorkerRequest): Promise<WorkerReply> {
  switch (message.type) {
    case 'load':
      gpuFirst = message.gpuFirst;
      try {
        await load((on) => scope.postMessage({ id: message.id, type: 'testing', backend: on }, []));
      } catch (error) {
        if (error instanceof EngineSwitch) return { id: message.id, type: 'switch' };
        throw error;
      }
      return {
        id: message.id,
        type: 'ready',
        sampleRate: tts!.sampleRate,
        backend,
        steps,
        threads: ort!.env.wasm.numThreads ?? 1,
        times,
      };
    case 'speak': {
      const { id } = message;
      const pieceTimes: PieceTimes = {
        durationPredictor: 0,
        textEncoder: 0,
        vectorEstimator: 0,
        vocoder: 0,
      };
      const samples = await speak(
        message.text,
        message.lang,
        message.voice,
        message.tuning,
        () => givenUp.has(id),
        pieceTimes,
      );
      return { id, type: 'audio', samples, times: pieceTimes };
    }
    case 'probe':
      return { id: message.id, type: 'audio', samples: await probe(message.model) };
    case 'cancel':
      throw new Error('A give-up is never queued.');
  }
}

/** One request at a time: the models are never run twice at once. */
let queue: Promise<void> = Promise.resolve();

scope.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  // A give-up comes in at once, past the queue, and stops the piece at its next model run.
  if (data.type === 'cancel') {
    if (asked.has(data.id)) givenUp.add(data.id);
    return;
  }
  if (data.type === 'speak') asked.add(data.id);
  queue = queue.then(async () => {
    if (givenUp.delete(data.id)) {
      asked.delete(data.id);
      return;
    }
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
    asked.delete(data.id);
    // The page has already let go of a piece given up.
    if (givenUp.delete(data.id)) return;
    scope.postMessage(reply, reply.type === 'audio' ? [reply.samples.buffer] : []);
  });
};
