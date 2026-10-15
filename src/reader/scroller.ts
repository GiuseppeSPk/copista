import { countWords, pixelsPerSecond } from './autoscroll';
import { pageForFraction } from './location';
import {
  clickedLink,
  followLink,
  LINK_SELECTOR,
  settle,
  srcdocLoaded,
  textMargins,
  writeLayoutStyle,
  type ChapterView,
  type ShowTarget,
} from './paginator';

export interface ScrollerEvents {
  onInternalLink(key: string): void;
  /** The reader moved the text: finger, wheel, keys, scrollbar or find-in-page. */
  onHandScroll(): void;
  /** The reader pressed the button above or below the chapter. */
  onEdge(direction: 'prev' | 'next'): void;
}

/** Widest text column, so lines stay short enough to follow while they move. */
const COLUMN_WIDTH = '36em';

interface Frame {
  element: HTMLIFrameElement;
  doc: Document;
}

const BUTTON_STYLE =
  'margin: 1.5rem auto; padding: 0.6rem 1.2rem; font: inherit;' +
  ' color: inherit; background: transparent; border: 1px solid currentColor;' +
  ' border-radius: 999px; opacity: 0.75; cursor: pointer;';

/**
 * Shows a chapter as one long column that the host scrolls. The chapter frame
 * is as tall as the chapter, so the frame never scrolls itself; the host does,
 * with the platform's own momentum, and a transparent layer over the frame
 * finds links under the pointer as in the Paginator.
 */
export class Scroller implements ChapterView {
  private frame: Frame | null = null;
  /** The share of the chapter above the top of the screen; only a move changes it. */
  private anchor = 0;
  private words = 0;
  private bodyLine = 16;
  /** Where the text is meant to be, kept with its fraction so slow paces do not stall. */
  private exact = 0;
  /** The last scrollTop this view set, to tell its own moves from the reader's. */
  private lastSet = 0;
  private cancelPending: (() => void) | null = null;
  private relayoutQueued = false;
  private lastSize = '';
  private readonly observer: ResizeObserver;
  private readonly column: HTMLDivElement;
  private readonly sheet: HTMLDivElement;
  private readonly inputLayer: HTMLDivElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly previousOverflow: string;

  constructor(
    private readonly host: HTMLElement,
    private readonly events: ScrollerEvents,
  ) {
    this.previousOverflow = host.style.overflowY;
    host.style.overflowY = 'auto';
    host.scrollTop = 0;

    this.column = document.createElement('div');
    this.column.className = 'copista-scroll';
    this.column.style.cssText = 'min-height: 100%; overflow: hidden;';
    this.prevButton = this.edgeButton('Previous chapter', 'prev');
    this.nextButton = this.edgeButton('Next chapter', 'next');
    this.sheet = document.createElement('div');
    this.sheet.style.cssText = 'position: relative;';
    this.inputLayer = document.createElement('div');
    this.inputLayer.style.cssText = 'position: absolute; inset: 0; z-index: 1;';
    this.inputLayer.addEventListener('click', (event) => {
      const link = this.linkAt(event.clientX, event.clientY);
      if (link !== null) {
        event.preventDefault();
        followLink(link, (key) => this.events.onInternalLink(key));
      }
    });
    this.inputLayer.addEventListener('mousemove', (event) => {
      this.inputLayer.style.cursor = this.linkAt(event.clientX, event.clientY) ? 'pointer' : '';
    });
    this.sheet.append(this.inputLayer);
    this.column.append(this.prevButton, this.sheet, this.nextButton);
    host.append(this.column);

    host.addEventListener('scroll', this.onScroll);
    // The column grows with the chapter; only a change of width or of screen height lays out again.
    this.observer = new ResizeObserver(() => {
      const size = `${this.column.clientWidth}x${this.host.clientWidth}x${this.host.clientHeight}`;
      if (size === this.lastSize) return;
      this.lastSize = size;
      this.queueRelayout();
    });
    this.observer.observe(host);
    this.observer.observe(this.column);
  }

  get page(): number {
    return pageForFraction(this.anchor, this.pageCount);
  }

  /** Screens in the chapter, so that notes kept for a page find one here too. */
  get pageCount(): number {
    const height = this.frameHeight();
    const view = this.host.clientHeight;
    return height > 0 && view > 0 ? Math.max(1, Math.ceil(height / view)) : 0;
  }

  /** Height of one line of the chapter's body text, in pixels. */
  get lineHeight(): number {
    return this.bodyLine;
  }

  fraction(): number {
    return this.anchor;
  }

  get document(): Document | null {
    return this.frame?.doc ?? null;
  }

  /** The frame is as tall as the chapter, so the first element showing is the first to end below the top. */
  firstVisible(elements: readonly Element[]): number {
    if (this.frame === null) return -1;
    const top =
      this.host.getBoundingClientRect().top +
      this.host.clientTop -
      this.frame.element.getBoundingClientRect().top;
    return elements.findIndex((element) => element.getBoundingClientRect().bottom > top + 1);
  }

  /** Replaces the shown chapter; the old one stays visible until the new one is laid out. */
  async show(srcdoc: string, target: ShowTarget): Promise<void> {
    this.cancelPending?.();
    const element = document.createElement('iframe');
    element.setAttribute('sandbox', 'allow-same-origin');
    element.setAttribute('title', 'Book page');
    element.style.cssText =
      'position: absolute; top: 0; left: 0; width: 100%; height: 100px; border: 0;' +
      ' display: block; visibility: hidden;';
    element.srcdoc = srcdoc;
    let cancelled = false;
    const cancel = new Promise<null>((resolve) => {
      this.cancelPending = () => {
        cancelled = true;
        element.remove();
        resolve(null);
      };
    });
    const loaded = srcdocLoaded(element);
    this.sheet.insertBefore(element, this.inputLayer);
    const doc = await Promise.race([loaded, cancel]);
    if (doc === null) return;
    this.applyLayout(doc);
    await settle(doc);
    if (cancelled) return;
    this.cancelPending = null;

    this.frame?.element.remove();
    this.frame = { element, doc };
    element.style.position = 'relative';
    element.style.visibility = '';
    doc.addEventListener('click', (event) => {
      const link = clickedLink(event);
      if (link === null) return;
      event.preventDefault();
      followLink(link, (key) => this.events.onInternalLink(key));
    });
    this.words = countWords(doc.body.textContent ?? '');
    this.applyColors(doc);
    this.measure();
    if ('fragment' in target) {
      this.scrollToText(this.fragmentTop(target.fragment));
      this.anchor = this.currentFraction();
    } else {
      const fraction = Math.min(1, Math.max(0, target.fraction));
      this.scrollToText(fraction * this.frameHeight());
      this.anchor = fraction < 1 ? fraction : this.currentFraction();
    }
  }

  /** Scrolls down one screen less two lines; false once the end of the chapter is on screen. */
  next(): boolean {
    if (this.atBottom()) return false;
    this.moveTo(this.host.scrollTop + this.step());
    this.anchor = this.currentFraction();
    return true;
  }

  /** Scrolls up one screen less two lines; false at the top of the chapter. */
  prev(): boolean {
    if (this.host.scrollTop <= this.textTop() + 1) return false;
    this.moveTo(Math.max(this.textTop(), this.host.scrollTop - this.step()));
    this.anchor = this.currentFraction();
    return true;
  }

  /** Moves the text up by a number of pixels, fractions included; false at the end of the chapter. */
  advance(px: number): boolean {
    if (this.frame === null) return false;
    if (Math.abs(this.host.scrollTop - this.lastSet) > 1) this.exact = this.host.scrollTop;
    if (this.atBottom()) return false;
    this.exact += px;
    this.moveTo(this.exact, false);
    this.anchor = this.currentFraction();
    return true;
  }

  /** Pixels a second that show `pace` words a minute of the chapter on screen. */
  speedFor(pace: number): number {
    return pixelsPerSecond(pace, this.frameHeight(), this.words, this.bodyLine);
  }

  /** Shows the button above the chapter when there is one before, and names what lies after. */
  setEdges(hasPrev: boolean, hasNext: boolean): void {
    this.prevButton.style.display = hasPrev ? 'block' : 'none';
    this.nextButton.style.display = 'block';
    this.nextButton.textContent = hasNext ? 'Next chapter' : 'End of the book';
    this.nextButton.disabled = !hasNext;
    this.nextButton.style.cursor = hasNext ? 'pointer' : 'default';
    if (this.frame !== null) this.scrollToText(this.anchor * this.frameHeight());
  }

  /** Lays the chapter out again for the host's current size, staying at the same place. */
  relayout(): Promise<void> {
    if (this.frame !== null) {
      this.applyLayout(this.frame.doc);
      this.measure();
      this.scrollToText(this.anchor * this.frameHeight());
    }
    return Promise.resolve();
  }

  destroy(): void {
    this.observer.disconnect();
    this.host.removeEventListener('scroll', this.onScroll);
    this.cancelPending?.();
    this.cancelPending = null;
    this.column.remove();
    this.host.scrollTop = 0;
    this.host.style.overflowY = this.previousOverflow;
    this.frame = null;
    this.anchor = 0;
  }

  private readonly onScroll = (): void => {
    if (this.frame === null || Math.abs(this.host.scrollTop - this.lastSet) <= 1) return;
    this.lastSet = this.host.scrollTop;
    this.exact = this.lastSet;
    this.anchor = this.currentFraction();
    this.events.onHandScroll();
  };

  private edgeButton(label: string, direction: 'prev' | 'next'): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `copista-edge copista-edge-${direction}`;
    button.textContent = label;
    button.style.cssText = BUTTON_STYLE;
    button.style.display = 'none';
    button.addEventListener('click', () => this.events.onEdge(direction));
    return button;
  }

  private step(): number {
    return Math.max(this.bodyLine, this.host.clientHeight - 2 * this.bodyLine);
  }

  /** Distance from the top of the column to the first line of the chapter. */
  private textTop(): number {
    const sheet = this.sheet.getBoundingClientRect().top;
    const host = this.host.getBoundingClientRect().top + this.host.clientTop;
    return sheet - host + this.host.scrollTop;
  }

  private frameHeight(): number {
    return this.frame?.element.offsetHeight ?? 0;
  }

  private atBottom(): boolean {
    const end = this.textTop() + this.frameHeight();
    const maxScroll = this.host.scrollHeight - this.host.clientHeight;
    return (
      this.host.scrollTop + this.host.clientHeight >= end - 1 ||
      this.host.scrollTop >= maxScroll - 1
    );
  }

  private currentFraction(): number {
    const height = this.frameHeight();
    if (height <= 0) return 0;
    return Math.min(1, Math.max(0, (this.host.scrollTop - this.textTop()) / height));
  }

  /** Puts a point of the chapter, in pixels from its top, at the top of the screen. */
  private scrollToText(y: number): void {
    this.moveTo(this.textTop() + y);
  }

  private moveTo(top: number, round = true): void {
    const maxScroll = Math.max(0, this.host.scrollHeight - this.host.clientHeight);
    const target = Math.min(maxScroll, Math.max(0, top));
    this.host.scrollTop = round ? Math.round(target) : target;
    this.lastSet = this.host.scrollTop;
    if (round) this.exact = this.lastSet;
  }

  private fragmentTop(fragment: string): number {
    const doc = this.frame!.doc;
    const target = doc.getElementById(fragment) ?? doc.getElementsByName(fragment)[0];
    if (target === undefined || target === null) return 0;
    const rect = target.getClientRects()[0] ?? target.getBoundingClientRect();
    return Math.max(0, rect.top - doc.documentElement.getBoundingClientRect().top);
  }

  /** Sets the frame to the chapter's full height and reads the size of a line. */
  private measure(): void {
    const frame = this.frame!;
    const body = frame.doc.body;
    const height = Math.ceil(body.getBoundingClientRect().height);
    frame.element.style.height = `${Math.max(1, height)}px`;
    const style = getComputedStyle(body);
    const line = parseFloat(style.lineHeight);
    this.bodyLine =
      Number.isFinite(line) && line > 0 ? line : parseFloat(style.fontSize) * 1.2 || 16;
  }

  /** The column takes the page colour so the buttons and the margins match the chapter. */
  private applyColors(doc: Document): void {
    const style = getComputedStyle(doc.documentElement);
    this.column.style.backgroundColor = style.backgroundColor;
    this.column.style.color = style.color;
  }

  /** Writes the one-column rules into the chapter document for the host's size. */
  private applyLayout(doc: Document): void {
    const width = Math.max(1, Math.floor(this.column.clientWidth || this.host.clientWidth));
    const height = Math.max(1, Math.floor(this.host.clientHeight));
    const { side, edge } = textMargins(width, height);
    writeLayoutStyle(
      doc,
      [
        'html { margin: 0 !important; padding: 0 !important; height: auto !important;' +
          ' min-height: 0 !important; overflow: hidden !important; scroll-behavior: auto !important; }',
        'body { box-sizing: border-box !important; margin: 0 auto !important; height: auto !important;' +
          ` width: auto !important; min-width: 0 !important; max-width: ${COLUMN_WIDTH} !important;` +
          ` padding: ${edge}px ${side}px !important; columns: auto !important;` +
          ' overflow: visible !important; display: flow-root !important; }',
        `img, svg, video { max-height: ${height - 2 * edge}px !important; }`,
      ].join('\n'),
    );
  }

  private queueRelayout(): void {
    if (this.relayoutQueued) return;
    this.relayoutQueued = true;
    requestAnimationFrame(() => {
      this.relayoutQueued = false;
      void this.relayout();
    });
  }

  /** The link shown at a point of the viewport, if any. */
  private linkAt(clientX: number, clientY: number): Element | null {
    if (this.frame === null) return null;
    const rect = this.frame.element.getBoundingClientRect();
    const hit = this.frame.doc.elementFromPoint(clientX - rect.left, clientY - rect.top);
    return hit?.closest(LINK_SELECTOR) ?? null;
  }
}
