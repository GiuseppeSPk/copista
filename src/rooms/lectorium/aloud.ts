import { DEFAULT_FINISH, type Finish } from '../../voice/audio';
import { listen, type Listening, type Player } from '../../voice/listen';
import type { Narrator, VoiceId } from '../../voice/narrator';
import { piecesOf, rampUp, rangeOf, type Lang, type Place } from '../../voice/text';
import type { ReadingController } from './controller';

/** The bar's state as a reading starts, before anything is heard. */
const IDLE: AloudState = { piece: '', waiting: true, paused: false, warming: false, ready: false };

/** Where a reading starts: a chapter, a block, and with an offset the sentence there. */
type From = { doc: Document; spineIndex: number; block: number; offset?: number };

/** What the listening bar shows. */
export interface AloudState {
  /** The text of the piece being heard, or '' before the first one. */
  piece: string;
  /** The voice is being made and nothing is playing yet. */
  waiting: boolean;
  paused: boolean;
  /** The voice is loading and warming up, while the reader reads on. */
  warming: boolean;
  /** The voice warmed up while the reader read on, and waits for Play to start from the page on screen. */
  ready: boolean;
}

/** A voice warmed up within this long starts reading at once, before the reader has read on. */
export const QUICK_WARM_MS = 3000;

export interface AloudDeps {
  reader: Pick<
    ReadingController,
    | 'listeningStart'
    | 'listeningStartQueued'
    | 'beforeScreen'
    | 'follow'
    | 'continueReading'
    | 'pause'
  >;
  narrator: Pick<Narrator, 'speak' | 'sampleRate'>;
  player: Player;
  lang: Lang;
  /** The voice chosen now; read again at each chapter and restart. */
  voice: () => VoiceId;
  /** Loads the voice and warms it up; settles at once when it is warm already. */
  warm?: () => Promise<void>;
  finish?: Finish;
  /** Called with null once the reading has stopped. */
  onState(state: AloudState | null): void;
  onError(error: unknown): void;
}

/**
 * Reads the book aloud from the first block on screen, marks the piece being
 * heard and keeps it on screen, and goes on chapter after chapter.
 */
export class ReadAloud {
  private listening: Listening | undefined;
  /** Counts the readings started, so a reading that was stopped can tell. */
  private run = 0;
  private running = false;
  /** The voice is warming up, or warm and waiting for Play: nothing has been read yet. */
  private unstarted = false;
  private state: AloudState = IDLE;

  constructor(private readonly deps: AloudDeps) {}

  get active(): boolean {
    return this.running;
  }

  /**
   * Starts from the first block on screen, or from a place chosen on it, then
   * going on from there even over a reading under way; false when there is no
   * chapter to read.
   */
  start(at?: { doc: Document; spineIndex: number } & Place): boolean {
    const from = at ?? this.deps.reader.listeningStart();
    if (from === null) return false;
    if (this.running) this.halt();
    this.deps.reader.pause();
    this.running = true;
    const run = ++this.run;
    const { warm } = this.deps;
    if (warm === undefined) {
      this.show(IDLE);
      void this.read(run, from);
    } else {
      this.unstarted = true;
      this.show({ ...IDLE, warming: true });
      void this.warmUp(run, warm, at);
    }
    return true;
  }

  /** The reader moved: start again from the first block on screen, still paused if paused. */
  restart(): void {
    // Before the voice has read anything, the start is taken from the screen when it does.
    if (!this.running || this.unstarted) return;
    this.halt();
    this.show({ ...this.state, piece: '', waiting: true });
    this.readFromScreen(++this.run);
  }

  pause(): void {
    if (!this.running || this.state.paused) return;
    this.listening?.pause();
    this.show({ ...this.state, paused: true });
  }

  resume(): void {
    if (!this.running || !this.state.paused) return;
    if (this.state.ready) {
      this.unstarted = false;
      this.show({ ...IDLE });
      this.readFromScreen(this.run);
      return;
    }
    this.listening?.resume();
    this.show({ ...this.state, paused: false });
  }

  skip(by: 1 | -1): void {
    if (this.running) this.listening?.skip(by);
  }

  stop(): void {
    if (!this.running) return;
    this.halt();
    this.running = false;
    this.unstarted = false;
    this.deps.onState(null);
  }

  /**
   * Waits for the voice to warm up while the reader reads on. A quick one starts
   * at once; after a long one, the reader has moved on, so it waits for Play
   * and starts from the page on screen then, as it does when paused meanwhile.
   */
  private async warmUp(
    run: number,
    warm: () => Promise<void>,
    at: ({ doc: Document; spineIndex: number } & Place) | undefined,
  ): Promise<void> {
    const began = Date.now();
    try {
      await warm();
    } catch (error) {
      if (run !== this.run) return;
      this.deps.onError(error);
      this.stop();
      return;
    }
    if (run !== this.run) return;
    const slow = Date.now() - began >= QUICK_WARM_MS;
    // A place chosen on the page is read from once the voice is warm.
    if (at === undefined && (slow || this.state.paused)) {
      this.show({ ...IDLE, waiting: false, paused: true, ready: true });
      return;
    }
    this.unstarted = false;
    this.show(IDLE);
    if (at !== undefined) void this.read(run, at);
    else this.readFromScreen(run);
  }

  /** Reads from the first block on screen, asked behind the moves in flight, so a chapter still opening is the one taken. */
  private readFromScreen(run: number): void {
    void this.deps.reader.listeningStartQueued().then((from) => {
      if (run !== this.run) return;
      if (from === null) this.stop();
      else void this.read(run, from);
    });
  }

  /** Ends the reading under way and takes the mark off the page. */
  private halt(): void {
    this.run++;
    this.listening?.stop();
    this.listening = undefined;
    this.deps.reader.follow(null);
  }

  private show(state: AloudState): void {
    this.state = state;
    this.deps.onState(state);
  }

  private async read(run: number, from: From): Promise<void> {
    const { reader, lang } = this.deps;
    try {
      for (let at: From | null = from; at !== null;) {
        const { doc, spineIndex, block, offset } = at;
        // A paragraph that began on the page before is taken up at its first piece on screen.
        const pieces = rampUp(
          offset !== undefined
            ? piecesOf(doc, lang, spineIndex, { block, offset })
            : piecesOf(doc, lang, spineIndex).filter((p) => {
                if (p.block !== block) return p.block > block;
                const range = rangeOf(doc, p);
                return range === null || !reader.beforeScreen(range);
              }),
          lang,
        );
        if (pieces.length > 0) {
          const listening = listen(
            this.deps.narrator,
            pieces,
            lang,
            this.deps.voice(),
            this.deps.player,
            this.deps.finish ?? DEFAULT_FINISH,
            {
              onPiece: (i) => {
                this.show({ ...this.state, piece: pieces[i]!.text, waiting: false });
                reader.follow(rangeOf(doc, pieces[i]!));
              },
              onWaiting: (waiting) => this.show({ ...this.state, waiting }),
            },
          );
          this.listening = listening;
          if (this.state.paused) listening.pause();
          await listening.done;
          if (run !== this.run) return;
          this.show({ ...this.state, waiting: true });
        }
        if (!(await reader.continueReading()) || run !== this.run) break;
        const next = reader.listeningStart();
        at = next && { ...next, block: 0 };
      }
    } catch (error) {
      if (run !== this.run) return;
      this.deps.onError(error);
    }
    if (run === this.run) this.stop();
  }
}
