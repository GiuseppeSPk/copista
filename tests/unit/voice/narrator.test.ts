import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceUnfitError, type Verdict } from '../../../src/voice/fitness';
import {
  FakeNarrator,
  WorkerNarrator,
  gpuFirst,
  isDeviceLost,
  type WorkerLike,
  type WorkerReply,
  type WorkerRequest,
  FIXES,
  SEED,
  SPEED,
} from '../../../src/voice/narrator';

const TIMES = { engine: 0, sessions: {}, warmUp: 0, total: 0 };

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

  it('takes the sample rate, backend, steps and threads from the ready reply', async () => {
    const { worker, narrator } = setUp();
    const loading = narrator.load();
    const { id } = worker.sent[0]!;
    worker.reply({
      id,
      type: 'ready',
      sampleRate: 22050,
      backend: 'webgpu',
      steps: 6,
      threads: 4,
      times: TIMES,
    });
    await loading;
    expect(narrator.sampleRate).toBe(22050);
    expect(narrator.backend).toBe('webgpu');
    expect(narrator.steps).toBe(6);
    expect(narrator.threads).toBe(4);
  });

  it('keeps how long loading took, and each model on the last piece', async () => {
    const { worker, narrator } = setUp();
    const loading = narrator.load();
    const times = { engine: 120, sessions: { vocoder: 300 }, warmUp: 900, total: 1500 };
    worker.reply({
      id: worker.sent[0]!.id,
      type: 'ready',
      sampleRate: 44100,
      backend: 'wasm',
      steps: 8,
      threads: 4,
      times,
    });
    await loading;
    expect(narrator.loadTimes).toEqual(times);
    const speaking = narrator.speak('Uno.', 'it', 'M2');
    const piece = { durationPredictor: 5, textEncoder: 20, vectorEstimator: 400, vocoder: 80 };
    worker.reply({
      id: worker.sent[1]!.id,
      type: 'audio',
      samples: new Float32Array(4),
      times: piece,
    });
    await speaking;
    expect(narrator.lastTimes).toEqual(piece);
  });

  it('tells the worker which chip to try first', () => {
    const { worker, narrator } = setUp();
    void narrator.load();
    expect(worker.sent[0]).toMatchObject({ type: 'load', gpuFirst: true });
    const phone = new FakeWorker();
    void new WorkerNarrator(() => phone, false).load();
    expect(phone.sent[0]).toMatchObject({ type: 'load', gpuFirst: false });
  });

  it('loads again in a new worker when the graphics chip needs the other engine', async () => {
    const workers: FakeWorker[] = [];
    const narrator = new WorkerNarrator(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }, false);
    const loading = narrator.load();
    workers[0]!.reply({ id: workers[0]!.sent[0]!.id, type: 'switch' });
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    expect(workers[0]!.terminated).toBe(true);
    workers[1]!.reply({
      id: workers[1]!.sent[0]!.id,
      type: 'ready',
      sampleRate: 44100,
      backend: 'webgpu',
      steps: 8,
      threads: 1,
      times: TIMES,
    });
    await loading;
    expect(narrator.backend).toBe('webgpu');
  });

  it('switches engine once only', async () => {
    const workers: FakeWorker[] = [];
    const narrator = new WorkerNarrator(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }, false);
    const loading = narrator.load();
    const failed = expect(loading).rejects.toBeInstanceOf(VoiceUnfitError);
    workers[0]!.reply({ id: workers[0]!.sent[0]!.id, type: 'switch' });
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    workers[1]!.reply({ id: workers[1]!.sent[0]!.id, type: 'switch' });
    await failed;
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

  it('gives up a piece when its signal aborts, telling the worker, and ignores a late answer', async () => {
    const { worker, narrator } = setUp();
    const controller = new AbortController();
    const piece = narrator.speak('Uno.', 'it', 'M2', undefined, controller.signal);
    const { id } = worker.sent[0]!;
    controller.abort();
    await expect(piece).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.sent[1]).toEqual({ id, type: 'cancel' });
    worker.reply({ id, type: 'audio', samples: new Float32Array(3) });
    controller.abort();
    expect(worker.sent).toHaveLength(2);
  });

  it('never sends a piece already given up', async () => {
    const { worker, narrator } = setUp();
    const controller = new AbortController();
    controller.abort();
    await expect(
      narrator.speak('Uno.', 'it', 'M2', undefined, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.sent).toHaveLength(0);
  });

  it('sends no give-up for a piece already answered', async () => {
    const { worker, narrator } = setUp();
    const controller = new AbortController();
    const piece = narrator.speak('Uno.', 'it', 'M2', undefined, controller.signal);
    worker.reply({ id: worker.sent[0]!.id, type: 'audio', samples: new Float32Array(2) });
    expect(await piece).toHaveLength(2);
    controller.abort();
    expect(worker.sent).toHaveLength(1);
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
      true,
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
    workers[0]!.reply({
      id,
      type: 'ready',
      sampleRate: 44100,
      backend: 'webgpu',
      steps: 8,
      threads: 4,
      times: TIMES,
    });
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
    workers[1]!.reply({
      id,
      type: 'ready',
      sampleRate: 44100,
      backend: 'wasm',
      steps: 6,
      threads: 4,
      times: TIMES,
    });
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
  it('gives up a piece when its signal aborts', async () => {
    const narrator = new FakeNarrator({ msPerChar: 1000 });
    const controller = new AbortController();
    const piece = narrator.speak('Ciao.', 'it', 'M2', undefined, controller.signal);
    controller.abort();
    await expect(piece).rejects.toMatchObject({ name: 'AbortError' });
  });

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

describe('gpuFirst', () => {
  const WINDOWS =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15';
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1';
  const TAB_S7 =
    'Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';

  it('has a computer try it first, a touch laptop too', () => {
    expect(gpuFirst(WINDOWS, 0, false)).toBe(true);
    expect(gpuFirst(WINDOWS, 10, false)).toBe(true);
    expect(gpuFirst(MAC, 0, false)).toBe(true);
  });

  it('has phones and tablets try the processor first, an iPad that says it is a Mac too', () => {
    expect(gpuFirst(IPHONE, 5, true)).toBe(false);
    expect(gpuFirst(TAB_S7, 10, true)).toBe(false);
    expect(gpuFirst(MAC, 5, true)).toBe(false);
    expect(gpuFirst(MAC, 5, false)).toBe(false);
    expect(gpuFirst(WINDOWS, 10, true)).toBe(false);
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
