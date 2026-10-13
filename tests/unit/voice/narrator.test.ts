import { describe, expect, it } from 'vitest';
import {
  FakeNarrator,
  WorkerNarrator,
  isDeviceLost,
  type WorkerLike,
  type WorkerReply,
  type WorkerRequest,
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

describe('FakeNarrator', () => {
  it('gives silence as long as the text takes to say', async () => {
    const narrator = new FakeNarrator({ msPerChar: 0, sampleRate: 1000 });
    expect(await narrator.speak('Ciao a tutti.')).toHaveLength(13 * 0.06 * 1000);
  });
});

describe('isDeviceLost', () => {
  it('recognises a lost WebGPU device and nothing else', () => {
    expect(isDeviceLost(new Error('Device is lost'))).toBe(true);
    expect(isDeviceLost(new Error('GPU device lost: unknown'))).toBe(true);
    expect(isDeviceLost(new Error('out of memory'))).toBe(false);
  });
});
