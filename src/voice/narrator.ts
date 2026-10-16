import { TEST_BUDGET_MS, VoiceUnfitError, type Unfit, type Verdict } from './fitness';
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

/** What reads a piece aloud. The app uses the worker; tests use the fake. */
export interface Narrator {
  readonly sampleRate: number;
  readonly backend: 'webgpu' | 'wasm' | 'fake';
  load(): Promise<void>;
  speak(text: string, lang: Lang, voice: VoiceId, tuning?: Tuning): Promise<Float32Array>;
  destroy(): void;
}

/** Messages to the worker. */
export type WorkerRequest =
  | { id: number; type: 'load' }
  | { id: number; type: 'speak'; text: string; lang: Lang; voice: VoiceId; tuning?: Tuning }
  | { id: number; type: 'probe'; model: ArrayBuffer };

/** Messages from the worker. */
export type WorkerReply =
  | { id: number; type: 'ready'; sampleRate: number; backend: 'webgpu' | 'wasm'; steps: 6 | 8 | 16 }
  | { id: number; type: 'audio'; samples: Float32Array }
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
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private watchdog: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly makeWorker: () => WorkerLike,
    private readonly keepVerdict: KeepVerdict = async () => {},
    private readonly budgetMs = TEST_BUDGET_MS,
  ) {}

  async load(): Promise<void> {
    // At most one stalled test for each backend.
    for (let attempt = 0; ; attempt++) {
      try {
        const reply = await this.request({ id: 0, type: 'load' });
        if (reply.type === 'ready') {
          this.sampleRate = reply.sampleRate;
          this.backend = reply.backend;
        }
        return;
      } catch (error) {
        if (!(error instanceof Stalled)) throw error;
        if (attempt === 1) throw new VoiceUnfitError('stalled');
      }
    }
  }

  async speak(text: string, lang: Lang, voice: VoiceId, tuning?: Tuning): Promise<Float32Array> {
    const reply = await this.request({
      id: 0,
      type: 'speak',
      text,
      lang,
      voice,
      ...(tuning && { tuning }),
    });
    return reply.type === 'audio' ? reply.samples : new Float32Array(0);
  }

  destroy(): void {
    clearTimeout(this.watchdog);
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error('The voice was stopped.'));
    this.pending.clear();
  }

  private request(message: WorkerRequest): Promise<WorkerReply> {
    const worker = (this.worker ??= this.start());
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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
  readonly sampleRate: number;
  private readonly msPerChar: number;
  /** How long each character lasts once spoken. */
  private readonly secondsPerChar: number;

  /** Why the fake fails its fitness test, if it does. */
  private readonly unfit: Unfit | undefined;

  constructor(
    options: {
      msPerChar?: number;
      secondsPerChar?: number;
      sampleRate?: number;
      unfit?: Unfit;
    } = {},
  ) {
    this.unfit = options.unfit;
    this.msPerChar = options.msPerChar ?? 2;
    this.secondsPerChar = options.secondsPerChar ?? 0.06;
    this.sampleRate = options.sampleRate ?? 44100;
  }

  async load(): Promise<void> {
    if (this.unfit) throw new VoiceUnfitError(this.unfit);
  }

  async speak(text: string): Promise<Float32Array> {
    await this.load();
    await new Promise((resolve) => setTimeout(resolve, text.length * this.msPerChar));
    return new Float32Array(Math.round(text.length * this.secondsPerChar * this.sampleRate));
  }

  destroy(): void {}
}
