import { getSetting, putSetting } from '../../storage/db';

/** The book drawn this month: which one, with what answers, and whether the one redraw is spent. */
export interface DrawRecord {
  /** "2026-10". */
  month: string;
  slug: string;
  mood: string;
  length: string;
  redrawn: boolean;
}

const DRAW_SETTING = 'draw';
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function isDraw(value: unknown): value is DrawRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.month === 'string' &&
    MONTH.test(v.month) &&
    typeof v.slug === 'string' &&
    v.slug !== '' &&
    typeof v.mood === 'string' &&
    typeof v.length === 'string' &&
    typeof v.redrawn === 'boolean'
  );
}

/** This month's draw, or null when there is none yet, or only last month's. */
export async function getDraw(month: string): Promise<DrawRecord | null> {
  const stored = await getSetting<unknown>(DRAW_SETTING);
  return isDraw(stored) && stored.month === month ? stored : null;
}

export async function putDraw(draw: DrawRecord): Promise<void> {
  if (!isDraw(draw)) throw new TypeError('Not a draw.');
  await putSetting(DRAW_SETTING, { ...draw });
}
