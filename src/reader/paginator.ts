import { fractionForPage, pageForFraction } from './location';

export type ShowTarget = { fraction: number } | { fragment: string };

/** One chapter on screen, shown a page at a time or as one scrolling column. */
export interface ChapterView {
  readonly page: number;
  readonly pageCount: number;
  show(srcdoc: string, target: ShowTarget): Promise<void>;
  next(): boolean;
  prev(): boolean;
  fraction(): number;
  /** The chapter's document, once one is shown. */
  readonly document: Document | null;
  /** The index of the first of these elements of the chapter that shows on screen, or -1. */
  firstVisible(elements: readonly Element[]): number;
  /** Marks a stretch of the chapter as the one being read, or clears the mark. */
  highlight(range: Range | null): void;
  /** Brings a stretch of the chapter on screen; true when the view moved. */
  reveal(range: Range): boolean;
  /** Whether a stretch of the chapter starts before the screen, on an earlier page or above it. */
  before(range: Range): boolean;
  destroy(): void;
}

export interface PaginatorEvents {
  onInternalLink(key: string): void;
}

/** How long show() waits for fonts and images before laying out anyway. */
const SETTLE_TIMEOUT_MS = 5000;

const LAYOUT_STYLE_ID = 'copista-pagination';

const READING_STYLE_ID = 'copista-reading-style';

/** The name the stretch being read is registered under in the chapter's highlights. */
export const READING_HIGHLIGHT = 'copista-reading';

/** The reader's accent, faint behind the text: the light one serves sepia too. */
const READING_CSS = [
  `::highlight(${READING_HIGHLIGHT}) { background-color: color-mix(in srgb, #a3241c 22%, transparent); }`,
  `[data-theme='dark'] ::highlight(${READING_HIGHLIGHT}) { background-color: color-mix(in srgb, #f2c14e 22%, transparent); }`,
].join('\n');

export const LINK_SELECTOR = '[data-copista-href], [data-copista-external]';

interface Frame {
  element: HTMLIFrameElement;
  doc: Document;
}

/** Margins around the text: half a column gap on each side, and the space above and below. */
export function textMargins(width: number, height: number): { side: number; edge: number } {
  const gap = Math.round(Math.min(48, Math.max(16, width * 0.06)));
  return { side: gap / 2, edge: Math.round(Math.min(40, Math.max(12, height * 0.05))) };
}

/** Writes the view's layout rules into a chapter document, replacing earlier ones. */
export function writeLayoutStyle(doc: Document, css: string, id = LAYOUT_STYLE_ID): void {
  let style = doc.getElementById(id);
  if (style === null) {
    style = doc.createElement('style');
    style.id = id;
    doc.head.append(style);
  }
  style.textContent = css;
}

/**
 * Marks a stretch of a chapter document as the one being read, or clears the
 * mark. Where the browser has no highlights, the text simply stays unmarked.
 */
export function markReading(doc: Document, range: Range | null): void {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  const highlights = win?.CSS?.highlights;
  if (!win || !highlights) return;
  if (range === null) {
    highlights.delete(READING_HIGHLIGHT);
    return;
  }
  if (doc.getElementById(READING_STYLE_ID) === null) {
    writeLayoutStyle(doc, READING_CSS, READING_STYLE_ID);
  }
  highlights.set(READING_HIGHLIGHT, new win.Highlight(range));
}

/** Hands a chapter link to the reader, or opens an outside link in a new tab. */
export function followLink(link: Element, onInternalLink: (key: string) => void): void {
  const internal = link.getAttribute('data-copista-href');
  if (internal !== null) {
    onInternalLink(internal);
  } else {
    window.open(link.getAttribute('data-copista-external')!, '_blank', 'noopener,noreferrer');
  }
}

/** The link activated by a click inside a chapter document, if any. */
export function clickedLink(event: MouseEvent): Element | null {
  const target = event.target as Element | null;
  if (target === null || !('closest' in target)) return null;
  return target.closest(LINK_SELECTOR);
}

export function srcdocLoaded(element: HTMLIFrameElement): Promise<Document> {
  return new Promise((resolve) => {
    const onLoad = () => {
      const doc = element.contentDocument;
      if (doc === null || doc.URL !== 'about:srcdoc') return;
      element.removeEventListener('load', onLoad);
      resolve(doc);
    };
    element.addEventListener('load', onLoad);
  });
}

/** Resolves once the document's images are decoded and its fonts loaded, or after a timeout. */
export async function settle(doc: Document): Promise<void> {
  const images = [...doc.images].map((img) => {
    if (img.loading === 'lazy') img.loading = 'eager';
    return img.decode().catch(() => undefined);
  });
  const fonts = doc.fonts.ready.then(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SETTLE_TIMEOUT_MS);
  });
  await Promise.race([Promise.all([...images, fonts]), timeout]);
  clearTimeout(timer);
}

/**
 * Shows one chapter page at a time. The chapter lives in an iframe sandboxed
 * without scripts; its body is laid out in columns exactly one frame wide, and
 * turning a page scrolls the frame by one column.
 *
 * WebKit runs no event listener at all inside a frame sandboxed without
 * scripts, so pointer input lands on a transparent layer in this document
 * instead, which finds the link under the pointer in the frame.
 */
export class Paginator implements ChapterView {
  private frame: Frame | null = null;
  private currentPage = 0;
  private count = 0;
  /**
   * The place in the chapter the reader is at, as a fraction. Only a move by
   * the reader changes it: a new layout finds the page that holds it, so
   * turning a phone back and forth does not creep back a page each time.
   */
  private anchor = 0;
  /** Width of one page, which is also the distance between two columns. */
  private pageWidth = 0;
  private cancelPending: (() => void) | null = null;
  private relayoutQueued = false;
  private readonly observer: ResizeObserver;
  private readonly inputLayer: HTMLDivElement;

  constructor(
    private readonly host: HTMLElement,
    private readonly events: PaginatorEvents,
  ) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    this.inputLayer = document.createElement('div');
    this.inputLayer.style.cssText = 'position: absolute; inset: 0; z-index: 1;';
    this.inputLayer.addEventListener('click', (event) => {
      const link = this.linkAt(event.clientX, event.clientY);
      if (link !== null) {
        event.preventDefault();
        this.follow(link);
      }
    });
    this.inputLayer.addEventListener('mousemove', (event) => {
      this.inputLayer.style.cursor = this.linkAt(event.clientX, event.clientY) ? 'pointer' : '';
    });
    host.append(this.inputLayer);
    this.observer = new ResizeObserver(() => this.queueRelayout());
    this.observer.observe(host);
  }

  get page(): number {
    return this.currentPage;
  }

  get pageCount(): number {
    return this.count;
  }

  fraction(): number {
    return this.anchor;
  }

  get document(): Document | null {
    return this.frame?.doc ?? null;
  }

  /** The frame scrolls one page into view, so an element shows when one of its boxes lies in it. */
  firstVisible(elements: readonly Element[]): number {
    const width = this.pageWidth;
    return elements.findIndex((element) =>
      [...element.getClientRects()].some((r) => r.width > 0 && r.right > 1 && r.left < width - 1),
    );
  }

  highlight(range: Range | null): void {
    if (this.frame !== null) markReading(this.frame.doc, range);
  }

  /** Turns to the page that holds the start of the range. */
  reveal(range: Range): boolean {
    if (this.frame === null) return false;
    const page = this.pageAt(range.getClientRects()[0] ?? range.getBoundingClientRect());
    if (page === this.currentPage) return false;
    this.turnTo(page);
    return true;
  }

  before(range: Range): boolean {
    if (this.frame === null) return false;
    return (
      this.pageAt(range.getClientRects()[0] ?? range.getBoundingClientRect()) < this.currentPage
    );
  }

  /** Replaces the shown chapter; the old one stays visible until the new one is laid out. */
  async show(srcdoc: string, target: ShowTarget): Promise<void> {
    this.cancelPending?.();
    const element = document.createElement('iframe');
    element.setAttribute('sandbox', 'allow-same-origin');
    element.setAttribute('title', 'Book page');
    element.style.cssText =
      'position: absolute; top: 0; left: 0; border: 0; display: block; visibility: hidden;';
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
    this.host.insertBefore(element, this.inputLayer);
    const doc = await Promise.race([loaded, cancel]);
    if (doc === null) return;
    this.applyLayout({ element, doc }, null);
    await settle(doc);
    if (cancelled) return;
    this.cancelPending = null;

    const previous = this.frame;
    this.frame = { element, doc };
    this.listen(doc);
    this.layout();
    if ('fragment' in target) {
      this.turnTo(this.pageOfFragment(target.fragment));
    } else {
      this.turnTo(pageForFraction(target.fraction, this.count));
      // A place inside the page is kept as it is, so a change of text size can come back to it.
      if (target.fraction > 0 && target.fraction < 1) this.anchor = target.fraction;
    }
    element.style.visibility = '';
    previous?.element.remove();
  }

  next(): boolean {
    if (this.currentPage >= this.count - 1) return false;
    this.turnTo(this.currentPage + 1);
    return true;
  }

  prev(): boolean {
    if (this.currentPage <= 0) return false;
    this.turnTo(this.currentPage - 1);
    return true;
  }

  /** Lays the chapter out again for the host's current size, staying at the same place. */
  relayout(): Promise<void> {
    if (this.frame !== null) {
      this.layout();
      this.currentPage = pageForFraction(this.anchor, this.count);
      this.scroll();
    }
    return Promise.resolve();
  }

  destroy(): void {
    this.observer.disconnect();
    this.cancelPending?.();
    this.cancelPending = null;
    this.frame?.element.remove();
    this.inputLayer.remove();
    this.frame = null;
    this.currentPage = 0;
    this.count = 0;
    this.anchor = 0;
  }

  /** Shows a page the reader moved to, which becomes the place to keep. */
  private turnTo(page: number): void {
    this.currentPage = page;
    this.anchor = fractionForPage(page, this.count);
    this.scroll();
  }

  private queueRelayout(): void {
    if (this.relayoutQueued) return;
    this.relayoutQueued = true;
    requestAnimationFrame(() => {
      this.relayoutQueued = false;
      void this.relayout();
    });
  }

  /** Measures the page count at the host's size, then widens the body to exactly that many pages. */
  private layout(): void {
    const frame = this.frame!;
    this.applyLayout(frame, null);
    const body = frame.doc.body;
    const range = frame.doc.createRange();
    range.selectNodeContents(body);
    const contentRight = range.getBoundingClientRect().right - body.getBoundingClientRect().left;
    this.count = Math.max(1, Math.ceil(contentRight / this.pageWidth));
    this.applyLayout(frame, this.count);
  }

  /**
   * Sizes the frame to the host and writes the column rules into the chapter
   * document. With `pages` set, the body is exactly that many pages wide so
   * the last page can scroll fully into view.
   */
  private applyLayout(frame: Frame, pages: number | null): void {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    frame.element.style.width = `${width}px`;
    frame.element.style.height = `${height}px`;
    const { side, edge: padding } = textMargins(width, height);
    const gap = side * 2;
    const bodyWidth = pages === null ? 'auto' : `${pages * width}px`;
    const css = [
      `html { margin: 0 !important; padding: 0 !important; height: ${height}px !important;` +
        ' overflow: hidden !important; scroll-behavior: auto !important; }',
      `body { box-sizing: border-box !important; margin: 0 !important; height: ${height}px !important;` +
        ` width: ${bodyWidth} !important; min-width: 0 !important; max-width: none !important;` +
        ` padding: ${padding}px ${gap / 2}px !important; column-width: ${width - gap}px !important;` +
        ` column-gap: ${gap}px !important; column-fill: auto !important; overflow: visible !important; }`,
      `img, svg, video { max-height: ${height - 2 * padding}px !important; break-inside: avoid; }`,
    ].join('\n');
    writeLayoutStyle(frame.doc, css);
    this.pageWidth = width;
  }

  private pageOfFragment(fragment: string): number {
    const doc = this.frame!.doc;
    const target = doc.getElementById(fragment) ?? doc.getElementsByName(fragment)[0];
    if (target === undefined || target === null) return 0;
    return this.pageAt(target.getClientRects()[0] ?? target.getBoundingClientRect());
  }

  /** The page a box of the chapter lies on. */
  private pageAt(rect: DOMRect): number {
    const x = rect.left - this.frame!.doc.body.getBoundingClientRect().left;
    return Math.min(this.count - 1, Math.max(0, Math.floor(x / this.pageWidth)));
  }

  private scroll(): void {
    const scroller = this.frame?.doc.scrollingElement;
    if (scroller) scroller.scrollLeft = this.currentPage * this.pageWidth;
  }

  /** The link shown at a point of the viewport, if any. */
  private linkAt(clientX: number, clientY: number): Element | null {
    if (this.frame === null) return null;
    const rect = this.frame.element.getBoundingClientRect();
    const hit = this.frame.doc.elementFromPoint(clientX - rect.left, clientY - rect.top);
    return hit?.closest(LINK_SELECTOR) ?? null;
  }

  private follow(link: Element): void {
    followLink(link, (key) => this.events.onInternalLink(key));
  }

  /**
   * Listeners inside the frame, where the browser runs them: a link activated
   * from the keyboard, and scrolls the frame makes by itself.
   */
  private listen(doc: Document): void {
    doc.addEventListener('click', (event) => this.onClick(event));
    // Focus and find-in-page can scroll the frame: snap to the nearest page.
    doc.addEventListener('scroll', () => {
      const scroller = doc.scrollingElement;
      if (this.frame?.doc !== doc || scroller === null || this.pageWidth === 0) return;
      if (Math.abs(scroller.scrollLeft - this.currentPage * this.pageWidth) < 1) return;
      const page = Math.round(scroller.scrollLeft / this.pageWidth);
      this.turnTo(Math.min(this.count - 1, Math.max(0, page)));
    });
  }

  private onClick(event: MouseEvent): void {
    const link = clickedLink(event);
    if (link === null) return;
    event.preventDefault();
    this.follow(link);
  }
}
