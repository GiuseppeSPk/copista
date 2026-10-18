import { Speaker } from './audio';
import type { Hearing } from './listen';
import { FRAME, STREAM_TYPE, framesFor, initSegment, mediaSegment } from './flac';

/** Seconds of silence kept ahead of the ear, so the stream never runs dry while the voice works. */
export const FILL_AHEAD = 3;
/** Frames between the ear and where a piece stopped is cut, time for the browser to take it in. */
const MARGIN = 4;
/**
 * Seconds a piece is put ahead of the ear at least: time for the browser to
 * swap the silence there for it. With only MARGIN, a phone still swapping when
 * the ear got there lost the piece's first word.
 */
export const LATE_AHEAD = 0.35;
/**
 * How long before its end a piece counts as played, so the next one is put in
 * after it while there is time. With 0.25 s, a page busy for 0.15 s between
 * two pieces, as a phone's is, put the next one in too late, and its first
 * 0.1 s was not heard.
 */
export const LEAD = 1;
/** Seconds of sound kept behind the ear; older sound is let go. */
const KEEP_BEHIND = 30;
/** How often the stream is looked at, besides the element's own ticks. */
const TICK_MS = 250;

/** Whether the browser can take the voice as one stream. */
export function canStream(): boolean {
  return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(STREAM_TYPE);
}

/** What plays the voice's pieces, one after another. */
export type Output = Pick<Stream, 'unlock' | 'setRate' | 'play' | 'pause' | 'resume' | 'release'>;

/** One stream where the browser takes it, as Chrome and Firefox do; else a sound for each piece. */
export function voiceOutput(): Output {
  return canStream() ? new Stream() : new Speaker();
}

interface Wait {
  /** Seconds into the stream at which the piece counts as heard. */
  at: number;
  done(error?: Error): void;
}

/**
 * Plays the pieces as one stream that never ends, with silence between them while the voice is
 * at work. A phone with its screen off lets a page play on but not start a new sound, so a
 * player that gives the element a new file for each piece falls silent at the end of the first
 * one; this one gives it a single source for the whole reading.
 */
export class Stream {
  private readonly audio = new Audio();
  private source: MediaSource | undefined;
  private buffer: SourceBuffer | undefined;
  /** Settles with the buffer once it is ready, or with nothing when the stream ends first. */
  private opened: Promise<SourceBuffer | undefined> | undefined;
  private abandon: (() => void) | undefined;
  private sampleRate = 0;
  /** The buffer's changes, one after another, as Media Source asks. */
  private queue: Promise<void> = Promise.resolve();
  private sequence = 0;
  /** The frame where the last piece put in ends. */
  private placed = 0;
  /** The frame where the sound in the buffer ends, silence included. */
  private filled = 0;
  private held = false;
  private rate = 1;
  private readonly waits = new Set<Wait>();
  /** Where the ear will start and finish hearing the pieces put in. */
  private readonly marks = new Set<Wait>();
  private ticker: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.audio.addEventListener('timeupdate', () => this.tick());
    this.audio.addEventListener('error', () =>
      this.fail(new Error('The voice could not be played.')),
    );
  }

  /** Starts a new stream from the reader's press, which lets it play. */
  unlock(): void {
    this.release();
    const source = (this.source = new MediaSource());
    this.audio.src = URL.createObjectURL(source);
    this.audio.defaultPlaybackRate = this.rate;
    this.audio.playbackRate = this.rate;
    this.opened = new Promise<SourceBuffer | undefined>((resolve) => {
      this.abandon = () => resolve(undefined);
      source.addEventListener(
        'sourceopen',
        () => {
          if (source === this.source) resolve((this.buffer = source.addSourceBuffer(STREAM_TYPE)));
        },
        { once: true },
      );
    });
    this.held = false;
    void this.audio.play().catch(() => undefined);
    this.ticker = setInterval(() => this.tick(), TICK_MS);
  }

  /** Hears the voice faster or slower, from now on; the pitch stays. */
  setRate(rate: number): void {
    this.rate = rate;
    this.audio.defaultPlaybackRate = rate;
    this.audio.playbackRate = rate;
  }

  /**
   * Resolves when the samples have nearly played, or played to the end when
   * they are the last, or at once when the signal stops them; `hearing` is told
   * when the ear reaches them and when it is past them.
   */
  async play(
    samples: Float32Array,
    rate: number,
    signal: AbortSignal,
    hearing?: Hearing,
  ): Promise<void> {
    if (!this.opened) this.unlock();
    const buffer = await this.opened;
    if (signal.aborted || !buffer || buffer !== this.buffer) return;
    if (this.sampleRate === 0) {
      this.sampleRate = rate;
      void this.change(buffer, (b) => b.appendBuffer(initSegment(rate)));
    }
    // A piece follows the last one, or starts a little ahead of the ear when it comes late.
    const ear = this.frameAt(this.audio.currentTime);
    const soonest = ear + framesFor(LATE_AHEAD * this.rate * this.sampleRate);
    const late = soonest > this.placed;
    const start = Math.max(this.placed, soonest);
    const appended = this.put(buffer, samples, start);
    this.placed = this.filled = start + framesFor(samples.length);
    const begins = this.timeOf(start);
    const end = this.timeOf(this.placed);
    this.evict(buffer);
    this.tick();
    await appended;
    if (signal.aborted || buffer !== this.buffer) return;
    // A phone has the silence ahead of the ear already taken in to play, so a
    // late piece put over it lost its first word: the ear is moved to the
    // piece, which makes the browser take in what is there now.
    if (late) this.audio.currentTime = begins;
    const mark = (at: number, tell?: () => void): Wait => {
      const wait: Wait = {
        at,
        done: () => {
          this.marks.delete(wait);
          if (!signal.aborted && buffer === this.buffer) tell?.();
        },
      };
      this.marks.add(wait);
      return wait;
    };
    const heard = mark(begins, hearing?.onStart);
    const over = mark(end, hearing?.onEnd);
    return new Promise<void>((resolve, reject) => {
      const at = hearing?.last ? end : end - LEAD;
      // On time to the moment on a screen being watched, besides the ticks.
      const timer = setTimeout(
        () => this.tick(),
        Math.max(0, ((at - this.audio.currentTime) / this.rate) * 1000),
      );
      const wait: Wait = {
        at,
        done: (error) => {
          this.waits.delete(wait);
          signal.removeEventListener('abort', stopped);
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        },
      };
      const stopped = (): void => {
        this.marks.delete(heard);
        this.marks.delete(over);
        this.cut(buffer);
        wait.done();
      };
      this.waits.add(wait);
      signal.addEventListener('abort', stopped);
      this.tick();
    });
  }

  pause(): void {
    this.held = true;
    this.audio.pause();
  }

  resume(): void {
    this.held = false;
    if (this.source) void this.audio.play().catch(() => undefined);
  }

  /** Ends the stream. */
  release(): void {
    clearInterval(this.ticker);
    this.ticker = undefined;
    for (const wait of [...this.waits]) wait.done();
    this.marks.clear();
    this.abandon?.();
    this.abandon = undefined;
    this.audio.pause();
    if (this.audio.src.startsWith('blob:')) URL.revokeObjectURL(this.audio.src);
    this.audio.removeAttribute('src');
    this.source = this.buffer = this.opened = undefined;
    this.queue = Promise.resolve();
    this.sampleRate = this.sequence = this.placed = this.filled = 0;
  }

  /** Puts the samples in at the frame, in place of the silence there, or after silence up to it. */
  private put(buffer: SourceBuffer, samples: Float32Array, start: number): Promise<void> {
    if (this.filled > start) this.remove(buffer, start, this.filled);
    else if (this.filled < start) this.silence(buffer, start);
    const segment = mediaSegment(samples, start, this.sampleRate, ++this.sequence);
    return this.change(buffer, (b) => b.appendBuffer(segment));
  }

  /** Stops the sound ahead of the ear: what is left of the piece and the silence after it. */
  private cut(buffer: SourceBuffer): void {
    if (buffer !== this.buffer) return;
    const at = Math.min(this.frameAt(this.audio.currentTime) + MARGIN, this.filled);
    if (at < this.filled) this.remove(buffer, at, this.filled);
    this.placed = this.filled = at;
    this.tick();
  }

  /** Lets go of the sound heard long ago, so a long reading does not fill the memory. */
  private evict(buffer: SourceBuffer): void {
    const behind = this.frameAt(this.audio.currentTime - KEEP_BEHIND);
    if (behind > this.frameAt(KEEP_BEHIND)) this.remove(buffer, 0, behind);
  }

  /** Tops up the silence ahead and lets go of the pieces now heard. */
  private tick(): void {
    const buffer = this.buffer;
    if (!buffer || this.sampleRate === 0) return;
    const now = this.audio.currentTime;
    for (const mark of [...this.marks]) if (now >= mark.at) mark.done();
    for (const wait of [...this.waits]) if (now >= wait.at) wait.done();
    if (this.held) return;
    const until = this.frameAt(now) + framesFor(FILL_AHEAD * this.sampleRate);
    if (this.filled < until) this.silence(buffer, until);
  }

  /** Silence from where the sound ends up to the frame. */
  private silence(buffer: SourceBuffer, until: number): void {
    const quiet = new Float32Array((until - this.filled) * FRAME);
    const segment = mediaSegment(quiet, this.filled, this.sampleRate, ++this.sequence);
    this.filled = until;
    void this.change(buffer, (b) => b.appendBuffer(segment));
  }

  /** Takes the frames out of the buffer, as far as the stream reaches when the turn comes. */
  private remove(buffer: SourceBuffer, from: number, to: number): void {
    const start = this.timeOf(from);
    const end = this.timeOf(to);
    void this.change(buffer, (b) => {
      const duration = this.source?.duration ?? NaN;
      if (!(start < duration)) return false;
      b.remove(start, end);
      return true;
    });
  }

  /** Makes one change to the buffer once the ones before it are done; false when none was due. */
  private change(buffer: SourceBuffer, make: (b: SourceBuffer) => boolean | void): Promise<void> {
    const run = this.queue.then(
      () =>
        new Promise<void>((resolve, reject) => {
          // A stream ended since: nothing to change.
          if (buffer !== this.buffer) return resolve();
          const ended = (): void => {
            buffer.removeEventListener('error', failed);
            resolve();
          };
          const failed = (): void => {
            buffer.removeEventListener('updateend', ended);
            reject(new Error('The voice could not be played.'));
          };
          const forget = (): void => {
            buffer.removeEventListener('updateend', ended);
            buffer.removeEventListener('error', failed);
          };
          buffer.addEventListener('updateend', ended, { once: true });
          buffer.addEventListener('error', failed, { once: true });
          try {
            if (make(buffer) === false) {
              forget();
              resolve();
            }
          } catch (error) {
            forget();
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }),
    );
    this.queue = run.catch((error: unknown) => {
      if (buffer === this.buffer)
        this.fail(error instanceof Error ? error : new Error(String(error)));
    });
    return run;
  }

  /** The stream cannot go on: the pieces waiting are told. */
  private fail(error: Error): void {
    if (!this.source) return;
    for (const wait of [...this.waits]) wait.done(error);
  }

  private frameAt(seconds: number): number {
    return this.sampleRate === 0 ? 0 : Math.floor((seconds * this.sampleRate) / FRAME);
  }

  private timeOf(frame: number): number {
    return (frame * FRAME) / this.sampleRate;
  }
}
