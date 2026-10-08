import { DEFAULT_SETTINGS, getSettings, updateSettings, type Settings } from '../rooms/archivum';
import { importBook, listShelf, type ShelfBook } from '../rooms/bibliotheca';
import { hashOf, parseHash, type Route } from './route';
import { errorMessage, warningMessage } from './text';

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
  /** A file dropped outside the Bibliotheca, waiting for the Scriptorium. */
  pendingConversion: undefined as File | undefined,
});

export function go(route: Route): void {
  const hash = hashOf(route);
  if (location.hash !== hash) location.hash = hash;
  else app.route = route;
}

export function followHash(): void {
  app.route = parseHash(location.hash);
  if (app.route.room === 'lectorium' && app.route.bookId) app.lastBookId = app.route.bookId;
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

export async function addFiles(files: File[]): Promise<void> {
  const notices: Notice[] = [];
  for (const file of files) {
    try {
      const result = await importBook(file);
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
  await refreshShelf();
}
