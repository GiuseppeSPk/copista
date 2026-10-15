/** Exposes a Paginator over the generated fixtures to browser tests as `window.harness`. */
import { readEpub } from '../../src/core/epub/read';
import type { Book } from '../../src/core/model/book';
import { Paginator, type ShowTarget } from '../../src/reader/paginator';
import { buildSrcdoc, type ReaderLook } from '../../src/reader/render';
import { ResourceUrls } from '../../src/reader/resources';
import type { EpubFixture } from '../fixtures/catalog';
import { kebab } from '../fixtures/names';

interface Info {
  page: number;
  pageCount: number;
  fraction: number;
}

const DEFAULT_LOOK: ReaderLook = { fontSizePercent: 100, theme: 'light' };

let opened: { fixture: string; book: Book; urls: ResourceUrls } | null = null;
const paginator = new Paginator(document.getElementById('host')!, {
  onInternalLink(key) {
    harness.lastLink = key;
  },
});

async function bookFor(fixture: EpubFixture): Promise<{ book: Book; urls: ResourceUrls }> {
  if (opened?.fixture !== fixture) {
    opened?.urls.dispose();
    const response = await fetch(`/tests/fixtures/generated/${kebab(fixture)}.epub`);
    const book = await readEpub(new Uint8Array(await response.arrayBuffer()));
    opened = { fixture, book, urls: new ResourceUrls(book) };
  }
  return opened;
}

function info(): Info {
  return { page: paginator.page, pageCount: paginator.pageCount, fraction: paginator.fraction() };
}

const harness = {
  async open(
    fixture: EpubFixture,
    chapter: number,
    target: ShowTarget,
    look: Partial<ReaderLook> = {},
  ): Promise<Info> {
    const { book, urls } = await bookFor(fixture);
    await paginator.show(buildSrcdoc(book, chapter, urls, { ...DEFAULT_LOOK, ...look }), target);
    return info();
  },
  next: () => paginator.next(),
  prev: () => paginator.prev(),
  async relayout(): Promise<Info> {
    await paginator.relayout();
    return info();
  },
  info,
  /** The first paragraph of the chapter that shows on the page, and its opening words. */
  firstParagraph(): { index: number; text: string } {
    const paragraphs = [...paginator.document!.querySelectorAll('p')];
    const index = paginator.firstVisible(paragraphs);
    return { index, text: paragraphs[index]?.textContent?.split('.')[0] ?? '' };
  },
  /** Marks the last paragraph of the chapter and brings it on screen. */
  revealLast(): boolean {
    const doc = paginator.document!;
    const range = doc.createRange();
    range.selectNodeContents([...doc.querySelectorAll('p')].at(-1)!);
    paginator.highlight(range);
    return paginator.reveal(range);
  },
  highlight: (on: boolean) => paginator.highlight(on ? paginator.document!.createRange() : null),
  /** Whether the frame's own highlight registry holds the reading mark, or null without one. */
  marked(): boolean | null {
    const win = paginator.document!.defaultView!;
    return win.CSS?.highlights ? win.CSS.highlights.has('copista-reading') : null;
  },
  frame: () => document.querySelector('iframe')!,
  lastLink: null as string | null,
};

declare global {
  interface Window {
    harness: typeof harness;
  }
}

window.harness = harness;
