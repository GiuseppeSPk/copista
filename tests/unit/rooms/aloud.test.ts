import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUICK_WARM_MS, ReadAloud, type AloudState } from '../../../src/rooms/lectorium/aloud';
import { FakeNarrator } from '../../../src/voice/narrator';
import { piecesOf, rampUp, type Piece } from '../../../src/voice/text';

function chapter(body: string): Document {
  return new DOMParser().parseFromString(`<html><body>${body}</body></html>`, 'text/html');
}

const PROSE = chapter(
  '<h1>One</h1><p>The first paragraph. It has two sentences.</p><p>The second paragraph.</p><p>The third paragraph.</p>',
);
const PICTURE = chapter('<p><img src="a.png" alt=""></p>');
/** A paragraph long enough to be read in two pieces, as one that runs over a page. */
const LONG = chapter(
  `<h1>Two</h1><p>${'The paragraph begins on one page and goes on, '.repeat(5)}until here. ${'It ends on the next page, '.repeat(9)}at last.</p><p>The last paragraph.</p>`,
);
const MORE = chapter('<p>The next chapter begins.</p><p>And it ends.</p>');

/** The pieces a chapter is cut into from a block on. */
function pieces(doc: Document, from = 0): Piece[] {
  return piecesOf(doc, 'en', 0).filter((piece) => piece.block >= from);
}

/** What a reading of these pieces says, its first ones cut shorter. */
function heard(read: Piece[]): string[] {
  return rampUp(read, 'en').map((piece) => piece.text);
}

/** What a chapter reads aloud from a block on. */
function texts(doc: Document, from = 0): string[] {
  return heard(pieces(doc, from));
}

/** A reader that holds a list of chapter documents and notes what the reading asked of it. */
class Reader {
  index = 0;
  block = 0;
  pauses = 0;
  /** The texts that lie before the screen, on the page before or above it. */
  readonly hidden = new Set<string>();
  /** The text of each range followed, or null when the mark was taken off. */
  readonly follows: (string | null)[] = [];
  onFollow: (count: number) => void = () => {};
  /** Holds back the opening of the next chapter, as a chapter that takes time to load. */
  hold: Promise<void> | null = null;
  /** Called when the next chapter is asked for. */
  onContinue: () => void = () => {};
  /** The moves in flight, one after the other as the real reader keeps them. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly docs: Document[]) {}

  listeningStart() {
    return { doc: this.docs[this.index]!, spineIndex: this.index, block: this.block };
  }
  beforeScreen(range: Range): boolean {
    return this.hidden.has(range.toString());
  }
  follow(range: Range | null): void {
    this.follows.push(range === null ? null : range.toString());
    this.onFollow(this.follows.length);
  }
  listeningStartQueued() {
    const start = this.chain.then(() => this.listeningStart());
    this.chain = start;
    return start;
  }
  continueReading(): Promise<boolean> {
    const move = this.chain.then(async () => {
      if (this.index + 1 >= this.docs.length) return false;
      this.onContinue();
      await this.hold;
      this.index++;
      this.block = 0;
      return true;
    });
    this.chain = move;
    return move;
  }
  pause(): void {
    this.pauses++;
  }
}

function setUp(docs: Document[], warm?: () => Promise<void>) {
  const reader = new Reader(docs);
  const states: (AloudState | null)[] = [];
  const errors: unknown[] = [];
  let played = 0;
  let ended = () => {};
  const end = new Promise<void>((resolve) => (ended = resolve));
  const aloud = new ReadAloud({
    reader,
    narrator: new FakeNarrator({ msPerChar: 0 }),
    player: {
      play: (_samples, _signal, hearing) => {
        played++;
        hearing.onStart();
        hearing.onEnd();
        return Promise.resolve();
      },
      pause: () => {},
      resume: () => {},
    },
    lang: 'en',
    voice: () => 'M2',
    ...(warm && { warm }),
    onState: (state) => {
      states.push(state);
      if (state === null) ended();
    },
    onError: (error) => errors.push(error),
  });
  return { reader, aloud, states, errors, end, played: () => played };
}

describe('reading aloud', () => {
  it('ends each piece with the finish chosen by ear, a fade before the pause', async () => {
    const heard: Float32Array[] = [];
    let ended = () => {};
    const end = new Promise<void>((resolve) => (ended = resolve));
    const aloud = new ReadAloud({
      reader: new Reader([MORE]),
      narrator: {
        sampleRate: 1000,
        speak: () => Promise.resolve(new Float32Array(1000).fill(0.5)),
      },
      player: {
        play: (samples, _signal, hearing) => {
          heard.push(samples);
          hearing.onStart();
          hearing.onEnd();
          return Promise.resolve();
        },
        pause: () => {},
        resume: () => {},
      },
      lang: 'en',
      voice: () => 'M2',
      onState: (state) => state === null && ended(),
      onError: () => {},
    });
    aloud.start();
    await end;
    expect(heard).toHaveLength(texts(MORE).length);
    for (const samples of heard) {
      expect(samples.length).toBe(1300);
      expect(samples[999]).toBe(0);
    }
  });

  it('follows each piece', async () => {
    const { reader, aloud, states, end, played } = setUp([PROSE]);
    expect(aloud.start()).toBe(true);
    expect(aloud.active).toBe(true);
    expect(reader.pauses).toBe(1);
    await end;
    expect(reader.follows).toEqual([...texts(PROSE), null]);
    expect(played()).toBe(texts(PROSE).length);
    expect(states.filter((s) => s !== null).map((s) => s.piece)).toContain(texts(PROSE)[1]);
    expect(aloud.active).toBe(false);
  });

  it('carries on into the next chapter, past one with nothing to read', async () => {
    const { reader, aloud, errors, end, played } = setUp([PROSE, PICTURE, MORE]);
    aloud.start();
    await end;
    expect(reader.follows).toEqual([...texts(PROSE), ...texts(MORE), null]);
    expect(played()).toBe(texts(PROSE).length + texts(MORE).length);
    expect(reader.index).toBe(2);
    expect(errors).toEqual([]);
  });

  it('restarts where the reader moved', async () => {
    const { reader, aloud, states, end } = setUp([PROSE]);
    reader.onFollow = (count) => {
      if (count !== 1) return;
      reader.block = 2;
      queueMicrotask(() => aloud.restart());
    };
    aloud.start();
    await end;
    expect(reader.follows).toEqual([texts(PROSE)[0], null, ...texts(PROSE, 2), null]);
    // The bar stays up across the restart: the reading stopped only at the end.
    expect(states.indexOf(null)).toBe(states.length - 1);
  });

  it('restarts into the chapter being opened, not the one just left', async () => {
    const { reader, aloud, end, played } = setUp([PROSE, MORE]);
    let release = () => {};
    reader.hold = new Promise<void>((resolve) => (release = resolve));
    reader.onContinue = () => {
      // The reader moves while the next chapter loads; the view still shows the last one.
      aloud.restart();
      release();
    };
    aloud.start();
    await end;
    expect(reader.follows).toEqual([...texts(PROSE), null, ...texts(MORE), null]);
    expect(played()).toBe(texts(PROSE).length + texts(MORE).length);
  });

  it('starts at the first piece on screen when a paragraph began on the page before', async () => {
    const { reader, aloud, end } = setUp([LONG]);
    const [hidden, ...shown] = pieces(LONG, 1);
    expect(pieces(LONG, 1).length).toBeGreaterThan(2);
    reader.block = 1;
    reader.hidden.add(hidden!.text);
    aloud.start();
    await end;
    expect(reader.follows).toEqual([...heard(shown), null]);
  });

  it('starts at the sentence chosen, even one before the screen', async () => {
    const { reader, aloud, end } = setUp([PROSE, MORE]);
    reader.hidden.add('It has two sentences.');
    expect(aloud.start({ doc: PROSE, spineIndex: 0, block: 1, offset: 25 })).toBe(true);
    await end;
    expect(reader.follows).toEqual([
      'It has two sentences.',
      ...texts(PROSE, 2),
      ...texts(MORE),
      null,
    ]);
  });

  it('starts again from the place chosen while a reading is under way, playing', async () => {
    const { reader, aloud, states, end } = setUp([PROSE]);
    reader.onFollow = (count) => {
      if (count !== 1) return;
      aloud.pause();
      queueMicrotask(() => aloud.start({ doc: PROSE, spineIndex: 0, block: 3, offset: 0 }));
    };
    aloud.start();
    await end;
    expect(reader.follows).toEqual([texts(PROSE)[0], null, ...texts(PROSE, 3), null]);
    expect(states.indexOf(null)).toBe(states.length - 1);
  });

  it('stops cleanly', async () => {
    const { reader, aloud, states, errors, end, played } = setUp([PROSE, MORE]);
    reader.onFollow = (count) => {
      if (count === 1) queueMicrotask(() => aloud.stop());
    };
    aloud.start();
    await end;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(played()).toBe(1);
    expect(reader.follows).toEqual([texts(PROSE)[0], null]);
    expect(states.at(-1)).toBeNull();
    expect(states.indexOf(null)).toBe(states.length - 1);
    expect(errors).toEqual([]);
    expect(aloud.active).toBe(false);
    aloud.restart();
    expect(aloud.active).toBe(false);
  });
});

/** A voice that warms up when told to, the clock moved on by the time given. */
function warming() {
  let done = () => {};
  let fail = (_error: unknown) => {};
  const warmed = new Promise<void>((resolve, reject) => {
    done = resolve;
    fail = reject;
  });
  let now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  return {
    warm: () => warmed,
    after(ms: number) {
      now += ms;
      done();
    },
    fail(error: unknown) {
      fail(error);
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('reading aloud while the voice warms up', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts from the page on screen once a quick warm-up is over, the moves meanwhile left alone', async () => {
    const voice = warming();
    const { reader, aloud, states, end } = setUp([PROSE], voice.warm);
    aloud.start();
    expect(states.at(-1)).toMatchObject({ warming: true, waiting: true, ready: false });
    reader.block = 2;
    aloud.restart();
    voice.after(QUICK_WARM_MS - 1);
    await end;
    expect(reader.follows).toEqual([...texts(PROSE, 2), null]);
    expect(states.some((s) => s?.ready)).toBe(false);
  });

  it('waits for Play after a long warm-up, then reads from the page on screen then', async () => {
    const voice = warming();
    const { reader, aloud, states, end, played } = setUp([PROSE], voice.warm);
    aloud.start();
    voice.after(QUICK_WARM_MS);
    await settle();
    expect(states.at(-1)).toMatchObject({ ready: true, paused: true, warming: false });
    expect(played()).toBe(0);
    reader.block = 3;
    aloud.restart();
    await settle();
    expect(played()).toBe(0);
    aloud.resume();
    await end;
    expect(reader.follows).toEqual([...texts(PROSE, 3), null]);
  });

  it('waits for Play when paused while warming up, however quick', async () => {
    const voice = warming();
    const { aloud, states, played } = setUp([PROSE], voice.warm);
    aloud.start();
    aloud.pause();
    voice.after(1);
    await settle();
    expect(states.at(-1)).toMatchObject({ ready: true, paused: true });
    expect(played()).toBe(0);
    aloud.stop();
  });

  it('reads from a place chosen on the page as soon as the voice is warm', async () => {
    const voice = warming();
    const { reader, aloud, end } = setUp([PROSE], voice.warm);
    aloud.start({ doc: PROSE, spineIndex: 0, block: 3, offset: 0 });
    voice.after(QUICK_WARM_MS * 10);
    await end;
    expect(reader.follows).toEqual([...texts(PROSE, 3), null]);
  });

  it('stops and says why when the voice fails to load', async () => {
    const voice = warming();
    const { aloud, errors, end, played } = setUp([PROSE], voice.warm);
    aloud.start();
    voice.fail(new Error('No memory.'));
    await end;
    expect(errors).toEqual([new Error('No memory.')]);
    expect(played()).toBe(0);
    expect(aloud.active).toBe(false);
  });
});
