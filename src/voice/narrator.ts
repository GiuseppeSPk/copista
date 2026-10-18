import { TEST_BUDGET_MS, VoiceUnfitError, type Unfit, type Verdict } from './fitness';
import type { PieceTimes } from './supertonic';
import type { Lang } from './text';

/** The two voices: the Lector and the Lectrix. */
export type VoiceId = 'M2' | 'F1';

/**
 * A text fix the voice can be asked for: Italian abbreviations spelt out,
 * Roman numerals read as ordinals, numbers in digits spelt out as words.
 */
export type TextFix = 'abbreviations' | 'roman' | 'numbers';

/** The speed the voice reads at, chosen by ear. */
export const SPEED = 1.1;
/** The noise each voice starts from, chosen by ear on Italian prose; the Lectrix's in the blind tests of 15 October. */
export const SEED: Record<VoiceId, number> = { M2: 2, F1: 3 };
/**
 * The text fixes the voice makes: Roman numerals, chosen by ear in the blind
 * tests of 15 October, and numbers as words, asked for after the Android trial.
 */
export const FIXES: readonly TextFix[] = ['roman', 'numbers'];

/**
 * The voice's levers, for blind tests. A missing field keeps the default:
 * the voice's own seed, SPEED, FIXES, and noise drawn for the whole latent.
 */
export interface Tuning {
  seed?: number;
  speed?: number;
  fixes?: readonly TextFix[];
  /** 'frame' draws the noise frame by frame, so a piece's start never shifts with its length. */
  noise?: 'latent' | 'frame';
}

/**
 * How long loading took, in milliseconds: importing the engine, opening each
 * model, and the fitness test the first time (none after, so warmUp is 0).
 */
export interface LoadTimes {
  engine: number;
  sessions: Partial<PieceTimes>;
  warmUp: number;
  total: number;
}

/** What reads a piece aloud. The app uses the worker; tests use the fake. */
export interface Narrator {
  readonly sampleRate: number;
  readonly backend: 'webgpu' | 'wasm' | 'fake';
  /** The steps each piece is made in, and the threads that make it, known once loaded. */
  readonly steps: number;
  readonly threads: number;
  /** For development: how long loading took, and each model on the last piece, where known. */
  readonly loadTimes?: LoadTimes | undefined;
  readonly lastTimes?: PieceTimes | undefined;
  /** Loads the voice and warms it up, so the first piece is made as fast as the rest. */
  load(): Promise<void>;
  /** Makes a piece; the signal gives it up, so the voice is free at once for the next one. */
  speak(
    text: string,
    lang: Lang,
    voice: VoiceId,
    tuning?: Tuning,
    signal?: AbortSignal,
  ): Promise<Float32Array>;
  destroy(): void;
}

/** Messages to the worker. */
export type WorkerRequest =
  | { id: number; type: 'load'; gpu: boolean }
  | { id: number; type: 'speak'; text: string; lang: Lang; voice: VoiceId; tuning?: Tuning }
  | { id: number; type: 'probe'; model: ArrayBuffer }
  /** Gives up the piece asked for as `id`, whether it is being made or still waits its turn. */
  | { id: number; type: 'cancel' };

/** Messages from the worker. */
export type WorkerReply =
  | {
      id: number;
      type: 'ready';
      sampleRate: number;
      backend: 'webgpu' | 'wasm';
      steps: 6 | 8 | 16;
      threads: number;
      times: LoadTimes;
    }
  | { id: number; type: 'audio'; samples: Float32Array; times?: PieceTimes }
  /** The fitness test starts on a backend; the page stops it if it does not end in time. */
  | { id: number; type: 'testing'; backend: 'webgpu' | 'wasm' }
  | { id: number; type: 'unfit'; reason: Unfit }
  | { id: number; type: 'error'; message: string };

/** The part of a Worker the narrator uses. */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null;
  terminate(): void;
}

/**
 * Whether the voice may run on the graphics chip: on a computer only. On a
 * Galaxy Tab S7 that work froze the page with a buzz, and on an iPhone it
 * crashed the page; Firefox on the same tablet, on the processor, read well.
 */
export function gpuAllowed(
  userAgent: string = navigator.userAgent,
  touchPoints: number = navigator.maxTouchPoints ?? 0,
  coarse: boolean = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return false;
  // An iPad says it is a Mac: only its touch screen tells it apart.
  if (/Macintosh/.test(userAgent) && touchPoints > 1) return false;
  return !coarse;
}

/** The error a piece given up rejects with. */
export function cancelled(): Error {
  return new DOMException('The piece was given up.', 'AbortError');
}

/** Whether an error says the WebGPU device was lost. */
export function isDeviceLost(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /device (is )?lost/i.test(message);
}

interface Pending {
  resolve(reply: WorkerReply): void;
  reject(error: Error): void;
}

/** Keeps a backend's verdict; the narrator records a test it had to stop. */
export type KeepVerdict = (backend: 'webgpu' | 'wasm', verdict: Verdict) => Promise<void>;

/** Said to what was pending when a fitness test was stopped. */
class Stalled extends Error {}

/**
 * The narrator that runs the voice in a worker, created on first use. A fitness
 * test that does not end in time, as when the device is too slow and freezes,
 * has its worker stopped and its backend marked as stalled; loading then goes
 * on with the next backend, in a new worker.
 */
export class WorkerNarrator implements Narrator {
  sampleRate = 44100;
  backend: 'webgpu' | 'wasm' = 'wasm';
  steps = 8;
  threads = 1;
  /** For development: how long loading took, and each model on the last piece. */
  loadTimes: LoadTimes | undefined;
  lastTimes: PieceTimes | undefined;
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private watchdog: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly makeWorker: () => WorkerLike,
    private readonly gpu = true,
    private readonly keepVerdict: KeepVerdict = async () => {},
    private readonly budgetMs = TEST_BUDGET_MS,
  ) {}

  async load(): Promise<void> {
    // At most one stalled test for each backend.
    for (let attempt = 0; ; attempt++) {
      try {
        const reply = await this.request({ id: 0, type: 'load', gpu: this.gpu });
        if (reply.type === 'ready') {
          this.sampleRate = reply.sampleRate;
          this.backend = reply.backend;
          this.steps = reply.steps;
          this.threads = reply.threads;
          this.loadTimes = reply.times;
        }
        return;
      } catch (error) {
        if (!(error instanceof Stalled)) throw error;
        if (attempt === 1) throw new VoiceUnfitError('stalled');
      }
    }
  }

  async speak(
    text: string,
    lang: Lang,
    voice: VoiceId,
    tuning?: Tuning,
    signal?: AbortSignal,
  ): Promise<Float32Array> {
    const reply = await this.request(
      { id: 0, type: 'speak', text, lang, voice, ...(tuning && { tuning }) },
      signal,
    );
    if (reply.type !== 'audio') return new Float32Array(0);
    this.lastTimes = reply.times;
    return reply.samples;
  }

  destroy(): void {
    clearTimeout(this.watchdog);
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error('The voice was stopped.'));
    this.pending.clear();
  }

  private request(message: WorkerRequest, signal?: AbortSignal): Promise<WorkerReply> {
    if (signal?.aborted) return Promise.reject(cancelled());
    const worker = (this.worker ??= this.start());
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const giveUp = (): void => {
        if (!this.pending.delete(id)) return;
        worker.postMessage({ id, type: 'cancel' });
        reject(cancelled());
      };
      this.pending.set(id, {
        resolve: (reply) => {
          signal?.removeEventListener('abort', giveUp);
          resolve(reply);
        },
        reject: (error) => {
          signal?.removeEventListener('abort', giveUp);
          reject(error);
        },
      });
      signal?.addEventListener('abort', giveUp, { once: true });
      worker.postMessage({ ...message, id });
    });
  }

  private start(): WorkerLike {
    const worker = this.makeWorker();
    worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id);
      if (p === undefined) return;
      clearTimeout(this.watchdog);
      if (data.type === 'testing') {
        this.watchdog = setTimeout(() => {
          if (this.worker !== worker) return;
          worker.terminate();
          this.worker = null;
          const stalled = [...this.pending.values()];
          this.pending.clear();
          // Marked before the pending load hears of it, so the next worker skips this backend.
          void this.keepVerdict(data.backend, { unfit: 'stalled' })
            .catch(() => {})
            .then(() => {
              for (const q of stalled) q.reject(new Stalled());
            });
        }, this.budgetMs);
        return;
      }
      this.pending.delete(data.id);
      if (data.type === 'error') p.reject(new Error(data.message));
      else if (data.type === 'unfit') p.reject(new VoiceUnfitError(data.reason));
      else p.resolve(data);
    };
    return worker;
  }
}

/** The worker that runs the voice. */
export function voiceWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'copista-voice',
  }) as WorkerLike;
}

/** A narrator for tests: silence as long as the text would take to say, a little later. */
export class FakeNarrator implements Narrator {
  readonly backend = 'fake';
  readonly steps = 8;
  readonly threads = 1;
  readonly sampleRate: number;
  private readonly msPerChar: number;
  /** How long each character lasts once spoken. */
  private readonly secondsPerChar: number;
  /** How long loading and warming up takes. */
  private readonly loadMs: number;

  /** Why the fake fails its fitness test, if it does. */
  private readonly unfit: Unfit | undefined;

  constructor(
    options: {
      msPerChar?: number;
      secondsPerChar?: number;
      sampleRate?: number;
      loadMs?: number;
      unfit?: Unfit;
    } = {},
  ) {
    this.unfit = options.unfit;
    this.msPerChar = options.msPerChar ?? 2;
    this.loadMs = options.loadMs ?? 0;
    this.secondsPerChar = options.secondsPerChar ?? 0.06;
    this.sampleRate = options.sampleRate ?? 44100;
  }

  async load(): Promise<void> {
    if (this.unfit) throw new VoiceUnfitError(this.unfit);
    if (this.loadMs > 0) await new Promise((resolve) => setTimeout(resolve, this.loadMs));
  }

  async speak(
    text: string,
    _lang?: Lang,
    _voice?: VoiceId,
    _tuning?: Tuning,
    signal?: AbortSignal,
  ): Promise<Float32Array> {
    if (this.unfit) throw new VoiceUnfitError(this.unfit);
    if (signal?.aborted) throw cancelled();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, text.length * this.msPerChar);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(cancelled());
        },
        { once: true },
      );
    });
    return new Float32Array(Math.round(text.length * this.secondsPerChar * this.sampleRate));
  }

  destroy(): void {}
}
