import { describe, expect, it } from 'vitest';
import {
  FakeNarrator,
  WorkerNarrator,
  gpuAllowed,
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

  it('takes the sample rate, backend, steps and threads from the ready reply', async () => {
    const { worker, narrator } = setUp();
    const loading = narrator.load();
    const { id } = worker.sent[0]!;
    worker.reply({ id, type: 'ready', sampleRate: 22050, backend: 'webgpu', steps: 6, threads: 4 });
    await loading;
    expect(narrator.sampleRate).toBe(22050);
    expect(narrator.backend).toBe('webgpu');
    expect(narrator.steps).toBe(6);
    expect(narrator.threads).toBe(4);
  });

  it('tells the worker whether it may use the graphics chip', () => {
    const { worker, narrator } = setUp();
    void narrator.load();
    expect(worker.sent[0]).toMatchObject({ type: 'load', gpu: true });
    const phone = new FakeWorker();
    void new WorkerNarrator(() => phone, false).load();
    expect(phone.sent[0]).toMatchObject({ type: 'load', gpu: false });
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

describe('FakeNarrator', () => {
  it('gives silence as long as the text takes to say', async () => {
    const narrator = new FakeNarrator({ msPerChar: 0, sampleRate: 1000 });
    expect(await narrator.speak('Ciao a tutti.')).toHaveLength(13 * 0.06 * 1000);
  });

  it('can speak faster, for a test that listens to whole pages', async () => {
    const narrator = new FakeNarrator({ msPerChar: 0, secondsPerChar: 0.002, sampleRate: 1000 });
    expect(await narrator.speak('Ciao a tutti.')).toHaveLength(26);
  });
});

describe('gpuAllowed', () => {
  const WINDOWS =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15';
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1';
  const TAB_S7 =
    'Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';

  it('lets a computer use it, a touch laptop too', () => {
    expect(gpuAllowed(WINDOWS, 0, false)).toBe(true);
    expect(gpuAllowed(WINDOWS, 10, false)).toBe(true);
    expect(gpuAllowed(MAC, 0, false)).toBe(true);
  });

  it('keeps phones and tablets on the processor, an iPad that says it is a Mac too', () => {
    expect(gpuAllowed(IPHONE, 5, true)).toBe(false);
    expect(gpuAllowed(TAB_S7, 10, true)).toBe(false);
    expect(gpuAllowed(MAC, 5, true)).toBe(false);
    expect(gpuAllowed(MAC, 5, false)).toBe(false);
    expect(gpuAllowed(WINDOWS, 10, true)).toBe(false);
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
