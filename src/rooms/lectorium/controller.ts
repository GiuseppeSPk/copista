import type { Position } from '../../core/model/position';
import { chapterForHref } from '../../reader/location';
import { Paginator, type ShowTarget } from '../../reader/paginator';
import { buildSrcdoc, type ReaderLook } from '../../reader/render';
import { ResourceUrls } from '../../reader/resources';
import { progressPercent, savePosition, type ReadingSession } from './index';

export interface GoToTarget {
  spineIndex: number;
  fraction?: number;
  fragment?: string;
}

/**
 * Reads one book in a host element, a page at a time, across chapters, and
 * saves the place after every move. Browser only.
 */
export class ReadingController {
  private readonly urls: ResourceUrls;
  private readonly paginator: Paginator;
  private spineIndex: number;
  /** Moves run one after another, so a tap during a chapter load waits its turn. */
  private queue: Promise<unknown> = Promise.resolve();
  private destroyed = false;

  constructor(
    host: HTMLElement,
    private readonly session: ReadingSession,
    private look: ReaderLook,
    private readonly onChange?: (pos: Position, percent: number) => void,
  ) {
    this.urls = new ResourceUrls(session.book);
    this.spineIndex = session.position.spineIndex;
    this.paginator = new Paginator(host, {
      onInternalLink: (key) => {
        const target = chapterForHref(session.book, key);
        if (target) void this.goTo(target).catch(() => undefined);
      },
    });
  }

  get page(): number {
    return this.paginator.page;
  }

  get pageCount(): number {
    return this.paginator.pageCount;
  }

  open(): Promise<void> {
    const { spineIndex, fraction } = this.session.position;
    return this.run(() => this.show(spineIndex, { fraction }));
  }

  /** The next page, crossing into the next chapter; false at the end of the book. */
  next(): Promise<boolean> {
    return this.run(async () => {
      if (this.paginator.next()) {
        await this.moved();
        return true;
      }
      if (this.spineIndex >= this.session.book.chapters.length - 1) return false;
      await this.show(this.spineIndex + 1, { fraction: 0 });
      return true;
    });
  }

  /** The previous page, crossing into the previous chapter's last page; false at the start. */
  prev(): Promise<boolean> {
    return this.run(async () => {
      if (this.paginator.prev()) {
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
    return this.run(() => {
      this.look = look;
      return this.show(this.spineIndex, { fraction: this.paginator.fraction() });
    });
  }

  position(): Position {
    return { spineIndex: this.spineIndex, fraction: this.paginator.fraction() };
  }

  destroy(): void {
    this.destroyed = true;
    this.paginator.destroy();
    this.urls.dispose();
  }

  private run<T>(move: () => Promise<T>): Promise<T> {
    const result = this.queue.then(move);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async show(index: number, target: ShowTarget): Promise<void> {
    if (this.destroyed) return;
    await this.paginator.show(buildSrcdoc(this.session.book, index, this.urls, this.look), target);
    if (this.destroyed) return;
    this.spineIndex = index;
    await this.moved();
  }

  private async moved(): Promise<void> {
    const pos = this.position();
    this.session.position = pos;
    await savePosition(this.session.bookId, pos);
    this.onChange?.(pos, progressPercent(this.session.book, pos));
  }
}
