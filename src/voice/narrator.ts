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
  /** The steps each piece is made in, and the threads that make it, known once loaded. */
  readonly steps: number;
  readonly threads: number;
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
    }
  | { id: number; type: 'audio'; samples: Float32Array }
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

/** Where the voice runs: as this device suits, or on the chip the reader chose. */
export type VoiceChip = 'auto' | 'graphics' | 'processor';

/** Whether the voice runs on the graphics chip, by the reader's choice or else as the device suits. */
export function usesGraphics(chip: VoiceChip, allowed: () => boolean = gpuAllowed): boolean {
  return chip === 'auto' ? allowed() : chip === 'graphics';
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

/** The narrator that runs the voice in a worker, created on first use. */
export class WorkerNarrator implements Narrator {
  sampleRate = 44100;
  backend: 'webgpu' | 'wasm' = 'wasm';
  steps = 8;
  threads = 1;
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly makeWorker: () => WorkerLike,
    private readonly gpu = true,
  ) {}

  async load(): Promise<void> {
    const reply = await this.request({ id: 0, type: 'load', gpu: this.gpu });
    if (reply.type === 'ready') {
      this.sampleRate = reply.sampleRate;
      this.backend = reply.backend;
      this.steps = reply.steps;
      this.threads = reply.threads;
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
    return reply.type === 'audio' ? reply.samples : new Float32Array(0);
  }

  destroy(): void {
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
      this.pending.delete(data.id);
      if (data.type === 'error') p.reject(new Error(data.message));
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

  constructor(
    options: {
      msPerChar?: number;
      secondsPerChar?: number;
      sampleRate?: number;
      loadMs?: number;
    } = {},
  ) {
    this.msPerChar = options.msPerChar ?? 2;
    this.loadMs = options.loadMs ?? 0;
    this.secondsPerChar = options.secondsPerChar ?? 0.06;
    this.sampleRate = options.sampleRate ?? 44100;
  }

  async load(): Promise<void> {
    if (this.loadMs > 0) await new Promise((resolve) => setTimeout(resolve, this.loadMs));
  }

  async speak(
    text: string,
    _lang?: Lang,
    _voice?: VoiceId,
    _tuning?: Tuning,
    signal?: AbortSignal,
  ): Promise<Float32Array> {
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
