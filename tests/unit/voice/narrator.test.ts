import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceUnfitError, type Verdict } from '../../../src/voice/fitness';
import {
  FakeNarrator,
  WorkerNarrator,
  isDeviceLost,
  type WorkerLike,
  type WorkerReply,
  type WorkerRequest,
  FIXES,
  SEED,
  SPEED,
} from '../../../src/voice/narrator';

/** A worker that keeps what it is sent and answers when the test says. */
class FakeWorker implements WorkerLike {
  readonly sent: WorkerRequest[] = [];
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null = null;
  terminated = false;

  postMessage(message: WorkerRequest): void {
    this.sent.push(message);
  }

  reply(data: WorkerReply): void {
    this.onmessage?.({ data } as MessageEvent<WorkerReply>);
  }

  terminate(): void {
    this.terminated = true;
  }
}

function setUp() {
  const worker = new FakeWorker();
  let made = 0;
  const narrator = new WorkerNarrator(() => {
    made++;
    return worker;
  });
  return { worker, narrator, made: () => made };
}

describe('WorkerNarrator', () => {
  it('sends the tuning along with a piece, and none when not asked', async () => {
    const { worker, narrator } = setUp();
    void narrator.speak('Uno.', 'it', 'M2', { seed: 7, fixes: ['roman'], noise: 'frame' });
    void narrator.speak('Due.', 'it', 'M2');
    expect(worker.sent[0]).toMatchObject({ tuning: { seed: 7, fixes: ['roman'], noise: 'frame' } });
    expect(worker.sent[1]!).not.toHaveProperty('tuning');
  });

  it('takes the sample rate and backend from the ready reply', async () => {
    const { worker, narrator } = setUp();
    const loading = narrator.load();
    const { id } = worker.sent[0]!;
    worker.reply({ id, type: 'ready', sampleRate: 22050, backend: 'webgpu', steps: 8 });
    await loading;
    expect(narrator.sampleRate).toBe(22050);
    expect(narrator.backend).toBe('webgpu');
  });

  it('gives each request its own answer, in whatever order they come', async () => {
    const { worker, narrator, made } = setUp();
    const first = narrator.speak('Uno.', 'it', 'M2');
    const second = narrator.speak('Due.', 'it', 'F1');
    const [a, b] = worker.sent;
    expect(a).toMatchObject({ type: 'speak', text: 'Uno.', lang: 'it', voice: 'M2' });
    worker.reply({ id: b!.id, type: 'audio', samples: new Float32Array([2]) });
    worker.reply({ id: a!.id, type: 'audio', samples: new Float32Array([1]) });
    expect([...(await first)]).toEqual([1]);
    expect([...(await second)]).toEqual([2]);
    expect(made()).toBe(1);
  });

  it('rejects only the request the error answers', async () => {
    const { worker, narrator } = setUp();
    const failing = narrator.speak('Uno.', 'it', 'M2');
    const fine = narrator.speak('Due.', 'it', 'M2');
    const [a, b] = worker.sent;
    worker.reply({ id: a!.id, type: 'error', message: 'out of memory' });
    worker.reply({ id: b!.id, type: 'audio', samples: new Float32Array(3) });
    await expect(failing).rejects.toThrow('out of memory');
    expect(await fine).toHaveLength(3);
  });

  it('stops the worker and rejects what is still pending', async () => {
    const { worker, narrator } = setUp();
    const pending = narrator.speak('Uno.', 'it', 'M2');
    narrator.destroy();
    expect(worker.terminated).toBe(true);
    await expect(pending).rejects.toThrow();
  });
});

describe('WorkerNarrator testing the device', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A narrator whose workers are kept, with a budget of one second for the test. */
  function watched() {
    const workers: FakeWorker[] = [];
    const kept: [string, Verdict][] = [];
    const narrator = new WorkerNarrator(
      () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      async (backend, verdict) => void kept.push([backend, verdict]),
      1000,
    );
    return { narrator, workers, kept };
  }

  it('lets a test that ends in time be', async () => {
    vi.useFakeTimers();
    const { narrator, workers, kept } = watched();
    const loading = narrator.load();
    const { id } = workers[0]!.sent[0]!;
    workers[0]!.reply({ id, type: 'testing', backend: 'webgpu' });
    await vi.advanceTimersByTimeAsync(900);
    workers[0]!.reply({ id, type: 'ready', sampleRate: 44100, backend: 'webgpu', steps: 8 });
    await loading;
    await vi.advanceTimersByTimeAsync(5000);
    expect(workers[0]!.terminated).toBe(false);
    expect(kept).toEqual([]);
  });

  it('stops a test that freezes, marks the backend and goes on in a new worker', async () => {
    vi.useFakeTimers();
    const { narrator, workers, kept } = watched();
    const loading = narrator.load();
    workers[0]!.reply({ id: workers[0]!.sent[0]!.id, type: 'testing', backend: 'webgpu' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(workers[0]!.terminated).toBe(true);
    expect(kept).toEqual([['webgpu', { unfit: 'stalled' }]]);
    expect(workers).toHaveLength(2);
    const { id } = workers[1]!.sent[0]!;
    workers[1]!.reply({ id, type: 'ready', sampleRate: 44100, backend: 'wasm', steps: 6 });
    await loading;
    expect(narrator.backend).toBe('wasm');
  });

  it('gives up once a second test freezes too', async () => {
    vi.useFakeTimers();
    const { narrator, workers, kept } = watched();
    const loading = narrator.load();
    const failed = expect(loading).rejects.toBeInstanceOf(VoiceUnfitError);
    workers[0]!.reply({ id: workers[0]!.sent[0]!.id, type: 'testing', backend: 'webgpu' });
    await vi.advanceTimersByTimeAsync(1000);
    workers[1]!.reply({ id: workers[1]!.sent[0]!.id, type: 'testing', backend: 'wasm' });
    await vi.advanceTimersByTimeAsync(1000);
    await failed;
    expect(kept.map(([backend]) => backend)).toEqual(['webgpu', 'wasm']);
  });

  it('passes on the reason the worker found the device unfit', async () => {
    const { narrator, workers } = watched();
    const loading = narrator.load();
    workers[0]!.reply({ id: workers[0]!.sent[0]!.id, type: 'unfit', reason: 'noise' });
    await expect(loading).rejects.toMatchObject({ reason: 'noise' });
  });
});

describe('FakeNarrator', () => {
  it('fails its test when asked to, as an unfit device does', async () => {
    await expect(new FakeNarrator({ unfit: 'slow' }).load()).rejects.toBeInstanceOf(
      VoiceUnfitError,
    );
  });

  it('gives silence as long as the text takes to say', async () => {
    const narrator = new FakeNarrator({ msPerChar: 0, sampleRate: 1000 });
    expect(await narrator.speak('Ciao a tutti.')).toHaveLength(13 * 0.06 * 1000);
  });

  it('can speak faster, for a test that listens to whole pages', async () => {
    const narrator = new FakeNarrator({ msPerChar: 0, secondsPerChar: 0.002, sampleRate: 1000 });
    expect(await narrator.speak('Ciao a tutti.')).toHaveLength(26);
  });
});

describe('isDeviceLost', () => {
  it('recognises a lost WebGPU device and nothing else', () => {
    expect(isDeviceLost(new Error('Device is lost'))).toBe(true);
    expect(isDeviceLost(new Error('GPU device lost: unknown'))).toBe(true);
    expect(isDeviceLost(new Error('out of memory'))).toBe(false);
  });
});

describe('the voice by default', () => {
  it('reads as chosen by ear on 15 October: speed 1.1, seed 2 for the Lector and 3 for the Lectrix, Roman numerals as ordinals; and numbers as words', () => {
    expect(SPEED).toBe(1.1);
    expect(SEED).toEqual({ M2: 2, F1: 3 });
    expect(FIXES).toEqual(['roman', 'numbers']);
  });
});
