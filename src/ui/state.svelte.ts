import { tick } from 'svelte';
import { DEFAULT_SETTINGS, getSettings, updateSettings, type Settings } from '../rooms/archivum';
import { importBook, listShelf, type ShelfBook } from '../rooms/bibliotheca';
import { hashOf, parseHash, type Route } from './route';
import { ROOMS } from './rooms';
import { errorMessage, warningMessage } from './text';
import { stillMotion } from './theme.svelte';

export interface Notice {
  tone: 'ok' | 'error';
  text: string;
  details?: string[];
}

/** State shared by the rooms. Each room keeps its own working state. */
export const app = $state({
  route: parseHash(location.hash) as Route,
  /** The book last opened, so the Lectorium tab can return to it. */
  lastBookId: undefined as string | undefined,
  settings: { ...DEFAULT_SETTINGS } as Settings,
  shelf: [] as ShelfBook[],
  libraryNotices: [] as Notice[],
  /** The room whose drop or button added the books the notices are about. */
  noticeRoom: 'bibliotheca' as 'bibliotheca' | 'lectorium',
  /** Books just added, newest first, still to land on the Lectorium's shelf. */
  landing: [] as string[],
  /** A file dropped outside the Bibliotheca, waiting for the Scriptorium. */
  pendingConversion: undefined as File[] | undefined,
  /** A library book sent from its shelf card to the Scriptorium. */
  pendingBookId: undefined as string | undefined,
});

export function go(route: Route): void {
  const hash = hashOf(route);
  if (location.hash !== hash) location.hash = hash;
  else app.route = route;
}

/**
 * How the screen changes between two routes: into a room from home, back out to home, or
 * sideways between rooms, towards the side of the tab that was picked.
 */
function motionBetween(from: Route, to: Route): string | undefined {
  if (from.room === to.room) return undefined;
  if (from.room === 'home') return 'in';
  if (to.room === 'home') return 'out';
  const order = (route: Route) => ROOMS.findIndex((info) => info.room === route.room);
  return order(to) > order(from) ? 'forward' : 'back';
}

/** The move between rooms still on screen, if any. */
let moving: ViewTransition | undefined;

/**
 * Ends the move between rooms at once, for a reader who presses before it is over: while it
 * plays, the browser sends every click to the page root. Resolves when the new room is in place.
 */
export function hurryMotion(): Promise<void> | undefined {
  if (!moving) return undefined;
  const done = moving.finished.then(
    () => undefined,
    () => undefined,
  );
  moving.skipTransition();
  return done;
}

export function followHash(): void {
  const next = parseHash(location.hash);
  const update = (): void => {
    // Another room opens at its top, not at the height the last one was scrolled to.
    if (app.route.room !== next.room) scrollTo({ top: 0, behavior: 'instant' });
    app.route = next;
    if (next.room === 'lectorium' && next.bookId) app.lastBookId = next.bookId;
  };
  const motion = motionBetween(app.route, next);
  if (!motion || !document.startViewTransition || stillMotion()) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.nav = motion;
  const transition = document.startViewTransition(async () => {
    update();
    await tick();
  });
  moving = transition;
  // A change that starts before this one is ready skips it, and the browser then rejects `ready`.
  void transition.ready.catch(() => undefined);
  void transition.finished.finally(() => {
    if (moving === transition) moving = undefined;
    if (root.dataset.nav === motion) delete root.dataset.nav;
  });
}

export async function loadSettings(): Promise<void> {
  app.settings = await getSettings();
}

export async function changeSettings(patch: Partial<Settings>): Promise<void> {
  app.settings = await updateSettings(patch);
}

export async function refreshShelf(): Promise<void> {
  app.shelf = await listShelf();
}

/**
 * How many books still fall onto the shelf. They drop one after another, so a large import
 * would keep the shelf half empty for a minute; the rest are simply there.
 */
const LANDING_MAX = 12;

export async function addFiles(
  files: File[],
  room: 'bibliotheca' | 'lectorium' = 'bibliotheca',
): Promise<void> {
  const notices: Notice[] = [];
  const added: string[] = [];
  for (const file of files) {
    try {
      const result = await importBook(file);
      if (!result.alreadyPresent) added.unshift(result.book.id);
      notices.push({
        tone: 'ok',
        text: result.alreadyPresent
          ? `“${result.book.title}” is already in the library.`
          : `Added “${result.book.title}”.`,
        details: result.warnings.map(warningMessage),
      });
    } catch (error) {
      notices.push({ tone: 'error', text: `${file.name}: ${errorMessage(error)}` });
    }
  }
  app.libraryNotices = notices;
  app.noticeRoom = room;
  app.landing = [...added, ...app.landing.filter((id) => !added.includes(id))].slice(
    0,
    LANDING_MAX,
  );
  await refreshShelf();
}

/** A book has come to rest on the shelf, so it will not fall again. */
export function landed(id: string): void {
  app.landing = app.landing.filter((other) => other !== id);
}
