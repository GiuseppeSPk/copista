/** Exposes a ReadingController over a stored fixture to browser tests as `window.lectorium`. */
import type { ReaderLook } from '../../src/reader/render';
import { ReadingController } from '../../src/rooms/lectorium/controller';
import { openSession } from '../../src/rooms/lectorium/index';
import { deleteAllStorage, getBook, putBook } from '../../src/storage/db';

interface Info {
  spineIndex: number;
  fraction: number;
  page: number;
  pageCount: number;
}

const BOOK_ID = 'long';
const LOOK: ReaderLook = { fontSizePercent: 100, theme: 'light' };

let controller: ReadingController | null = null;

function info(): Info {
  const { spineIndex, fraction } = controller!.position();
  return { spineIndex, fraction, page: controller!.page, pageCount: controller!.pageCount };
}

const lectorium = {
  /** Stores longBook (unless `keep` and it is already there) and opens it where the reader left off. */
  async start(keep = false): Promise<Info> {
    if (!keep) await deleteAllStorage();
    if (!(await getBook(BOOK_ID))) {
      const response = await fetch('/tests/fixtures/generated/long-book.epub');
      await putBook({
        id: BOOK_ID,
        title: 'Long Book',
        authors: [],
        fileBlob: await response.blob(),
        addedAt: Date.now(),
      });
    }
    controller?.destroy();
    controller = new ReadingController(
      document.getElementById('host')!,
      await openSession(BOOK_ID),
      LOOK,
      (pos, percent) => lectorium.changes.push({ ...pos, percent }),
    );
    await controller.open();
    return info();
  },
  async next(): Promise<Info & { ok: boolean }> {
    const ok = await controller!.next();
    return { ...info(), ok };
  },
  async prev(): Promise<Info & { ok: boolean }> {
    const ok = await controller!.prev();
    return { ...info(), ok };
  },
  async goTo(target: { spineIndex: number; fraction?: number; fragment?: string }): Promise<Info> {
    await controller!.goTo(target);
    return info();
  },
  async setLook(look: ReaderLook): Promise<Info> {
    await controller!.setLook(look);
    return info();
  },
  async stored(): Promise<{ spineIndex: number; fraction: number }> {
    return (await openSession(BOOK_ID)).position;
  },
  /** Whether the element with this id is on the page the reader sees. */
  onScreen(id: string): boolean {
    const frame = document.querySelector('iframe')!;
    const rect = frame.contentDocument!.getElementById(id)!.getBoundingClientRect();
    return rect.right > 0 && rect.left < frame.clientWidth;
  },
  frameCount: () => document.querySelectorAll('iframe').length,
  destroy(): void {
    controller?.destroy();
  },
  info,
  changes: [] as { spineIndex: number; fraction: number; percent: number }[],
};

declare global {
  interface Window {
    lectorium: typeof lectorium;
  }
}

window.lectorium = lectorium;
