import { TODAY, type Finish } from '../../voice/audio';
import { listen, type Listening, type Player } from '../../voice/listen';
import type { Narrator, VoiceId } from '../../voice/narrator';
import { piecesOf, rangeOf, type Lang } from '../../voice/text';
import type { ReadingController } from './controller';

/** What the listening bar shows. */
export interface AloudState {
  /** The text of the piece being heard, or '' before the first one. */
  piece: string;
  /** The voice is being made and nothing is playing yet. */
  waiting: boolean;
  paused: boolean;
}

export interface AloudDeps {
  reader: Pick<ReadingController, 'listeningStart' | 'follow' | 'continueReading' | 'pause'>;
  narrator: Pick<Narrator, 'speak' | 'sampleRate'>;
  player: Player;
  lang: Lang;
  /** The voice chosen now; read again at each chapter and restart. */
  voice: () => VoiceId;
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
  private state: AloudState = { piece: '', waiting: true, paused: false };

  constructor(private readonly deps: AloudDeps) {}

  get active(): boolean {
    return this.running;
  }

  /** Starts from the first block on screen; false when there is no chapter to read. */
  start(): boolean {
    const from = this.deps.reader.listeningStart();
    if (from === null) return false;
    this.deps.reader.pause();
    this.running = true;
    this.show({ piece: '', waiting: true, paused: false });
    void this.read(++this.run, from);
    return true;
  }

  /** The reader moved: start again from the first block on screen, still paused if paused. */
  restart(): void {
    if (!this.running) return;
    this.halt();
    const from = this.deps.reader.listeningStart();
    if (from === null) return this.stop();
    this.show({ ...this.state, piece: '', waiting: true });
    void this.read(++this.run, from);
  }

  pause(): void {
    if (!this.running || this.state.paused) return;
    this.listening?.pause();
    this.show({ ...this.state, paused: true });
  }

  resume(): void {
    if (!this.running || !this.state.paused) return;
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
    this.deps.onState(null);
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

  private async read(
    run: number,
    from: { doc: Document; spineIndex: number; block: number },
  ): Promise<void> {
    const { reader, lang } = this.deps;
    try {
      for (let at: typeof from | null = from; at !== null;) {
        const { doc, spineIndex, block } = at;
        const pieces = piecesOf(doc, lang, spineIndex).filter((p) => p.block >= block);
        if (pieces.length > 0) {
          const listening = listen(
            this.deps.narrator,
            pieces,
            lang,
            this.deps.voice(),
            this.deps.player,
            this.deps.finish ?? TODAY,
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
