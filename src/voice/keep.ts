/**
 * Keeps the voice loaded between readings, so a book opened again, or another
 * one, starts reading without loading the voice afresh. One narrator is kept,
 * for the chip it was asked on, and let go of after a while with nothing read.
 */
import type { Narrator } from './narrator';

/** How long the voice stays loaded with nothing read. */
export const IDLE_MS = 5 * 60_000;

interface Held {
  gpu: boolean;
  narrator: Narrator;
  /** The load under way or done; a failed one is forgotten, so the next asks again. */
  loading: Promise<void> | undefined;
  loaded: boolean;
}

export interface Timers {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

export class NarratorKeeper {
  private held: Held | undefined;
  private readings = 0;
  private timer: unknown;

  constructor(
    private readonly make: (gpu: boolean) => Narrator,
    /** Told when the narrator is let go of, by any way. */
    private readonly onDrop: () => void = () => {},
    private readonly idleMs: number = IDLE_MS,
    private readonly timers: Timers = globalThis,
  ) {}

  /** The narrator for this chip: the one kept, unless it is on the other chip. */
  narrator(gpu: boolean): Narrator {
    if (this.held?.gpu !== gpu) {
      this.drop();
      this.held = { gpu, narrator: this.make(gpu), loading: undefined, loaded: false };
      // Asked for and then never read with, it goes the same way.
      if (this.readings === 0) this.startTimer();
    }
    return this.held.narrator;
  }

  /** Whether the narrator kept has loaded. */
  loaded(narrator: Narrator): boolean {
    return this.held?.narrator === narrator && this.held.loaded;
  }

  /** Loads the narrator once, however many readings ask; a failure lets the next one try again. */
  load(narrator: Narrator, done: () => void = () => {}): Promise<void> {
    const held = this.held;
    if (held?.narrator !== narrator) return narrator.load();
    const loading = (held.loading ??= narrator.load().then(
      () => {
        if (this.held !== held) return;
        held.loaded = true;
        done();
      },
      (error: unknown) => {
        if (held.loading === loading) held.loading = undefined;
        throw error;
      },
    ));
    return loading;
  }

  /** A reading begins: the voice is kept until the function returned is called. */
  begin(): () => void {
    this.readings += 1;
    this.stopTimer();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.readings -= 1;
      if (this.readings === 0 && this.held) this.startTimer();
    };
  }

  /** Whether a reading is under way. */
  get reading(): boolean {
    return this.readings > 0;
  }

  /** Lets go of the narrator unless a reading uses it, as when the page is put away. */
  idle(): void {
    if (this.readings === 0) this.drop();
  }

  /** Lets go of the narrator, so the next reading loads the voice afresh. */
  drop(): void {
    this.stopTimer();
    const held = this.held;
    if (held === undefined) return;
    this.held = undefined;
    held.narrator.destroy();
    this.onDrop();
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined;
      this.drop();
    }, this.idleMs);
  }

  private stopTimer(): void {
    if (this.timer === undefined) return;
    this.timers.clearTimeout(this.timer);
    this.timer = undefined;
  }
}
