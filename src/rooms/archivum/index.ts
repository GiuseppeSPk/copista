import { DEFAULT_PACE, snapPace } from '../../reader/autoscroll';
import type { Theme } from '../../reader/render';
import { deleteAllStorage, getSetting, putSetting } from '../../storage/db';

/** Turning one screen at a time, or one long column per chapter. */
export type ReadingMode = 'pages' | 'scroll';

export interface Settings {
  fontSizePercent: number;
  theme: Theme;
  mode: ReadingMode;
  /** Autoscroll pace in words per minute. */
  pace: number;
  guideLine: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  fontSizePercent: 100,
  theme: 'light',
  mode: 'pages',
  pace: DEFAULT_PACE,
  guideLine: false,
};

const SETTINGS_KEY = 'reader';
const THEMES: readonly Theme[] = ['light', 'dark', 'sepia'];
const MODES: readonly ReadingMode[] = ['pages', 'scroll'];
const MIN_FONT = 80;
const MAX_FONT = 200;

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

/** Rounds to the nearest 10 percent and keeps the size readable. */
function fontSize(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(value / 10) * 10));
}

/** Applies a patch to settings, ignoring any value that is not valid. */
function merge(base: Settings, patch: Partial<Settings>): Settings {
  return {
    fontSizePercent: fontSize(patch.fontSizePercent, base.fontSizePercent),
    theme: isTheme(patch.theme) ? patch.theme : base.theme,
    mode: MODES.includes(patch.mode as ReadingMode) ? (patch.mode as ReadingMode) : base.mode,
    pace:
      typeof patch.pace === 'number' && Number.isFinite(patch.pace)
        ? snapPace(patch.pace)
        : base.pace,
    guideLine: typeof patch.guideLine === 'boolean' ? patch.guideLine : base.guideLine,
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await getSetting<Partial<Settings>>(SETTINGS_KEY);
  return merge(DEFAULT_SETTINGS, stored ?? {});
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = merge(await getSettings(), patch);
  await putSetting(SETTINGS_KEY, next);
  return next;
}

/** How much the browser lets this site keep, or null when it will not say. */
export async function storageUsage(): Promise<{ usedBytes: number; quotaBytes: number } | null> {
  const estimate = globalThis.navigator?.storage?.estimate;
  if (typeof estimate !== 'function') return null;
  const { usage, quota } = await estimate.call(navigator.storage);
  return { usedBytes: usage ?? 0, quotaBytes: quota ?? 0 };
}

/** Removes every book, position, bookmark, note, setting and cached app file. */
export async function deleteAllData(): Promise<void> {
  await deleteAllStorage();
  if (typeof globalThis.caches === 'undefined') return;
  for (const key of await caches.keys()) await caches.delete(key);
}
