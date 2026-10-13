import type { Position } from '../../core/model/position';
import { Autoscroll, DEFAULT_PACE, snapPace } from '../../reader/autoscroll';
import { chapterForHref } from '../../reader/location';
import { Paginator, type ChapterView, type ShowTarget } from '../../reader/paginator';
import { buildSrcdoc, type ReaderLook, type ReadingMode } from '../../reader/render';
import { ResourceUrls } from '../../reader/resources';
import { Scroller } from '../../reader/scroller';
import { progressPercent, savePosition, type ReadingSession } from './index';

export interface GoToTarget {
  spineIndex: number;
  fraction?: number;
  fragment?: string;
}

/** How often, at most, a scroll saves the place. */
const SAVE_EVERY_MS = 1000;

/**
 * Reads one book in a host element, a page at a time or as one scrolling column
 * per chapter, across chapters, and saves the place after every move. In scroll
 * mode the text can also move by itself at a reading pace. Browser only.
 */
export class ReadingController {
  private readonly urls: ResourceUrls;
  private view: ChapterView;
  /** The scrolling view and its motion, present in scroll mode only. */
  private scroll: { view: Scroller; motion: Autoscroll } | null = null;
  private currentMode: ReadingMode;
  private pace: number;
  private spineIndex: number;
  /** Moves run one after another, so a tap during a chapter load waits its turn. */
  private queue: Promise<unknown> = Promise.resolve();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly session: ReadingSession,
    private look: ReaderLook & { mode?: ReadingMode; pace?: number },
    private readonly onChange?: (pos: Position, percent: number) => void,
    private readonly onPlaying?: (playing: boolean) => void,
  ) {
    this.urls = new ResourceUrls(session.book);
    this.spineIndex = session.position.spineIndex;
    this.currentMode = look.mode ?? 'pages';
    this.pace = snapPace(look.pace ?? DEFAULT_PACE);
    this.view = this.makeView();
  }

  get mode(): ReadingMode {
    return this.currentMode;
  }

  get page(): number {
    return this.view.page;
  }

  get pageCount(): number {
    return this.view.pageCount;
  }

  /** True while the text moves by itself, or is held for a moment by the reader. */
  get playing(): boolean {
    return this.scroll?.motion.playing ?? false;
  }

  open(): Promise<void> {
    const { spineIndex, fraction } = this.session.position;
    return this.run(() => this.show(spineIndex, { fraction }));
  }

  /** The next page or screen, crossing into the next chapter; false at the end of the book. */
  next(): Promise<boolean> {
    this.scroll?.motion.hold();
    return this.run(async () => {
      if (this.view.next()) {
        await this.moved();
        return true;
      }
      return this.openNextChapter();
    });
  }

  /** The previous page or screen, crossing into the end of the previous chapter; false at the start. */
  prev(): Promise<boolean> {
    this.scroll?.motion.hold();
    return this.run(async () => {
      if (this.view.prev()) {
        await this.moved();
        return true;
      }
      if (this.spineIndex <= 0) return false;
      await this.show(this.spineIndex - 1, { fraction: 1 });
      return true;
    });
  }

  goTo(target: GoToTarget): Promise<void> {
    return this.run(() => {
      const last = this.session.book.chapters.length - 1;
      const index = Math.min(last, Math.max(0, Math.trunc(target.spineIndex)));
      const where: ShowTarget =
        target.fragment !== undefined
          ? { fragment: target.fragment }
          : { fraction: target.fraction ?? 0 };
      return this.show(index, where);
    });
  }

  /** Changes font size or theme and stays at the same place in the chapter. */
  setLook(look: ReaderLook): Promise<void> {
    this.pause();
    return this.run(() => {
      this.look = { ...this.look, ...look };
      return this.show(this.spineIndex, { fraction: this.view.fraction() });
    });
  }

  /** Switches between pages and scrolling, staying at the same place in the chapter. */
  setMode(mode: ReadingMode): Promise<void> {
    this.pause();
    return this.run(async () => {
      if (mode === this.currentMode || this.destroyed) return;
      const fraction = this.view.fraction();
      this.dropView();
      this.currentMode = mode;
      this.view = this.makeView();
      await this.show(this.spineIndex, { fraction });
    });
  }

  /** Sets the autoscroll pace in words a minute; a moving text changes speed at once. */
  setPace(pace: number): void {
    this.pace = snapPace(pace);
  }

  /** Starts the text moving; only in scroll mode. */
  play(): void {
    this.scroll?.motion.play();
  }

  pause(): void {
    this.scroll?.motion.pause();
  }

  position(): Position {
    return { spineIndex: this.spineIndex, fraction: this.view.fraction() };
  }

  destroy(): void {
    this.destroyed = true;
    this.dropView();
    this.urls.dispose();
  }

  private makeView(): ChapterView {
    const onInternalLink = (key: string): void => {
      const target = chapterForHref(this.session.book, key);
      if (target) void this.goTo(target).catch(() => undefined);
    };
    if (this.currentMode === 'pages') return new Paginator(this.host, { onInternalLink });

    const view = new Scroller(this.host, {
      onInternalLink,
      onHandScroll: () => {
        motion.hold();
        this.saveSoon();
      },
      onEdge: (direction) => {
        void (direction === 'next' ? this.next() : this.prev()).catch(() => undefined);
      },
    });
    const motion = new Autoscroll({
      advance: (px) => {
        const moved = view.advance(px);
        if (moved) this.saveSoon();
        return moved;
      },
      speed: () => view.speedFor(this.pace),
      onEnd: () => this.run(() => this.openNextChapter()),
      onState: (playing) => this.onPlaying?.(playing),
    });
    this.scroll = { view, motion };
    return view;
  }

  private dropView(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.scroll?.motion.destroy();
    this.scroll = null;
    this.view.destroy();
  }

  private async openNextChapter(): Promise<boolean> {
    if (this.destroyed || this.spineIndex >= this.session.book.chapters.length - 1) return false;
    await this.show(this.spineIndex + 1, { fraction: 0 });
    return true;
  }

  /** Saves the place once a second at most while the text scrolls. */
  private saveSoon(): void {
    if (this.saveTimer !== undefined) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void this.run(() => (this.destroyed ? Promise.resolve() : this.moved())).catch(
        () => undefined,
      );
    }, SAVE_EVERY_MS);
  }

  private run<T>(move: () => Promise<T>): Promise<T> {
    const result = this.queue.then(move);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async show(index: number, target: ShowTarget): Promise<void> {
    if (this.destroyed) return;
    const view = this.view;
    await view.show(buildSrcdoc(this.session.book, index, this.urls, this.look), target);
    if (this.destroyed || view !== this.view) return;
    this.spineIndex = index;
    this.scroll?.view.setEdges(index > 0, index < this.session.book.chapters.length - 1);
    await this.moved();
  }

  private async moved(): Promise<void> {
    const pos = this.position();
    this.session.position = pos;
    await savePosition(this.session.bookId, pos);
    this.onChange?.(pos, progressPercent(this.session.book, pos));
  }
}
