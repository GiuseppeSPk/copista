/** Reading paces in words per minute, finer at the slow end where moving text is read. */
export const PACES: readonly number[] = [100, 125, 150, 175, 200, 225, 250, 300, 350, 400];
export const DEFAULT_PACE = 200;

/** The pace nearest to a number, the lower one on a tie. */
export function snapPace(value: number): number {
  return PACES.reduce((best, pace) =>
    Math.abs(pace - value) < Math.abs(best - value) ? pace : best,
  );
}

/** The neighbouring pace, staying at the slowest or fastest one. */
export function stepPace(pace: number, step: 1 | -1): number {
  const at = PACES.indexOf(snapPace(pace));
  return PACES[Math.min(PACES.length - 1, Math.max(0, at + step))] ?? pace;
}

/**
 * Words in a text: runs of non-space characters, or one word per six characters
 * for scripts written without spaces, whichever is larger.
 */
export function countWords(text: string): number {
  const runs = text.match(/\S+/g);
  if (!runs) return 0;
  const characters = runs.reduce((sum, run) => sum + [...run].length, 0);
  return Math.max(runs.length, Math.ceil(characters / 6));
}

/**
 * Pixels a second that show `pace` words a minute of a chapter `height` pixels tall
 * holding `words` words, kept between a tenth of a line and three lines a second.
 */
export function pixelsPerSecond(
  pace: number,
  height: number,
  words: number,
  lineHeight: number,
): number {
  const speed = ((pace / 60) * height) / Math.max(1, words);
  return Math.min(3 * lineHeight, Math.max(lineHeight / 10, speed));
}

export interface AutoscrollHooks {
  /** Moves the text up by some pixels; false once the end of the chapter is on screen. */
  advance(px: number): boolean;
  /** Pixels a second for the current pace and chapter. */
  speed(): number;
  /** Called a while after the end of a chapter shows; true to carry on in the next one. */
  onEnd(): Promise<boolean>;
  onState(playing: boolean): void;
}

/** Seconds to reach full speed, so the text never jerks into motion. */
const EASE_SECONDS = 0.5;
/** How long after the reader's last scroll the text moves again. */
const HOLD_MS = 1500;
/** How long the end of a chapter stays on screen before the next one opens. */
const END_WAIT_MS = 1500;
/** Longest step between two frames, so a busy moment never makes the text jump. */
const MAX_STEP_SECONDS = 0.1;

interface WakeLockLike {
  release(): Promise<void>;
}

/**
 * Moves text at a steady speed, frame by frame. A scroll by the reader holds it
 * for a moment instead of stopping it; the end of a chapter waits, then asks
 * whether to carry on.
 */
export class Autoscroll {
  private on = false;
  private destroyed = false;
  private frame = 0;
  private last: number | null = null;
  private started = 0;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private endTimer: ReturnType<typeof setTimeout> | undefined;
  private lock: WakeLockLike | null = null;

  constructor(private readonly hooks: AutoscrollHooks) {
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** True from play to pause, including while held or waiting at the end of a chapter. */
  get playing(): boolean {
    return this.on;
  }

  play(): void {
    if (this.on || this.destroyed) return;
    this.on = true;
    this.hooks.onState(true);
    this.keepAwake();
    this.startMotion();
  }

  pause(): void {
    if (!this.on) return;
    this.on = false;
    this.stopMotion();
    void this.lock?.release().catch(() => undefined);
    this.lock = null;
    this.hooks.onState(false);
  }

  /** Stops the motion while the reader scrolls; it starts again after a pause in their scrolling. */
  hold(): void {
    if (!this.on) return;
    this.stopMotion();
    this.holdTimer = setTimeout(() => this.startMotion(), HOLD_MS);
  }

  destroy(): void {
    this.pause();
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.pause();
  };

  private keepAwake(): void {
    const wakeLock = (
      navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockLike> } }
    ).wakeLock;
    wakeLock
      ?.request('screen')
      .then((lock) => {
        if (this.on) this.lock = lock;
        else void lock.release().catch(() => undefined);
      })
      .catch(() => undefined);
  }

  private startMotion(): void {
    this.stopMotion();
    this.last = null;
    this.frame = requestAnimationFrame(this.tick);
  }

  private stopMotion(): void {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.holdTimer);
    clearTimeout(this.endTimer);
  }

  private readonly tick = (now: number): void => {
    if (this.last === null) {
      this.last = now;
      this.started = now;
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    const seconds = Math.min(MAX_STEP_SECONDS, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const ease = Math.min(1, (now - this.started) / 1000 / EASE_SECONDS);
    if (!this.hooks.advance(this.hooks.speed() * ease * seconds)) {
      this.endTimer = setTimeout(() => void this.atEnd(), END_WAIT_MS);
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private async atEnd(): Promise<void> {
    const carryOn = await this.hooks.onEnd().catch(() => false);
    if (!this.on) return;
    if (carryOn) this.startMotion();
    else this.pause();
  }
}
