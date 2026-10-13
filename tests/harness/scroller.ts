/** Exposes a Scroller over the generated fixtures to browser tests as `window.scroller`. */
import { readEpub } from '../../src/core/epub/read';
import type { Book } from '../../src/core/model/book';
import type { ShowTarget } from '../../src/reader/paginator';
import { buildSrcdoc, type ReaderLook } from '../../src/reader/render';
import { ResourceUrls } from '../../src/reader/resources';
import { Scroller } from '../../src/reader/scroller';
import type { EpubFixture } from '../fixtures/catalog';
import { kebab } from '../fixtures/names';

interface Info {
  page: number;
  pageCount: number;
  fraction: number;
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  frameHeight: number;
  lineHeight: number;
}

const DEFAULT_LOOK: ReaderLook = { fontSizePercent: 100, theme: 'light' };
const host = document.getElementById('host')!;

let opened: { fixture: string; book: Book; urls: ResourceUrls } | null = null;
let scroller = create();

function create(): Scroller {
  return new Scroller(host, {
    onInternalLink(key) {
      harness.lastLink = key;
    },
    onHandScroll() {
      harness.handScrolls++;
    },
    onEdge(direction) {
      harness.edges.push(direction);
    },
  });
}

async function bookFor(fixture: EpubFixture): Promise<{ book: Book; urls: ResourceUrls }> {
  if (opened?.fixture !== fixture) {
    opened?.urls.dispose();
    const response = await fetch(`/tests/fixtures/generated/${kebab(fixture)}.epub`);
    const book = await readEpub(new Uint8Array(await response.arrayBuffer()));
    opened = { fixture, book, urls: new ResourceUrls(book) };
  }
  return opened;
}

function frame(): HTMLIFrameElement {
  return host.querySelector('iframe')!;
}

function info(): Info {
  return {
    page: scroller.page,
    pageCount: scroller.pageCount,
    fraction: scroller.fraction(),
    scrollTop: host.scrollTop,
    clientHeight: host.clientHeight,
    scrollHeight: host.scrollHeight,
    frameHeight: frame()?.offsetHeight ?? 0,
    lineHeight: scroller.lineHeight,
  };
}

const harness = {
  async open(
    fixture: EpubFixture,
    chapter: number,
    target: ShowTarget,
    look: Partial<ReaderLook> = {},
  ): Promise<Info> {
    const { book, urls } = await bookFor(fixture);
    await scroller.show(buildSrcdoc(book, chapter, urls, { ...DEFAULT_LOOK, ...look }), target);
    return info();
  },
  next: () => scroller.next(),
  prev: () => scroller.prev(),
  advance: (px: number) => scroller.advance(px),
  speedFor: (pace: number) => scroller.speedFor(pace),
  setEdges: (hasPrev: boolean, hasNext: boolean) => scroller.setEdges(hasPrev, hasNext),
  async relayout(): Promise<Info> {
    await scroller.relayout();
    return info();
  },
  /** The number of the first paragraph whose text shows at the top of the screen. */
  topParagraph(): string {
    const top = host.getBoundingClientRect().top - frame().getBoundingClientRect().top;
    const paragraphs = [...frame().contentDocument!.querySelectorAll('p')];
    const first = paragraphs.find((p) => p.getBoundingClientRect().bottom > top + 1);
    return first?.textContent?.split('.')[0] ?? '';
  },
  destroy(): void {
    scroller.destroy();
  },
  recreate(): void {
    scroller = create();
  },
  info,
  frame,
  host: () => host,
  lastLink: null as string | null,
  handScrolls: 0,
  edges: [] as string[],
};

declare global {
  interface Window {
    scroller: typeof harness;
  }
}

window.scroller = harness;
