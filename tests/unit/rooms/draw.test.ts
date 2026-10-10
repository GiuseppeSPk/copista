import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDraw, putDraw, type DrawRecord } from '../../../src/rooms/bibliotheca/draw';
import { deleteAllStorage, getSetting, putSetting } from '../../../src/storage/db';

const october: DrawRecord = {
  month: '2026-10',
  slug: 'arthur-conan-doyle/a-study-in-scarlet',
  mood: 'mystery',
  length: 'evening',
  redrawn: false,
};

beforeEach(async () => {
  await deleteAllStorage();
});

describe('the month’s draw', () => {
  it('has none before the first draw', async () => {
    expect(await getDraw('2026-10')).toBeNull();
  });

  it('keeps a draw for its month', async () => {
    await putDraw(october);
    expect(await getDraw('2026-10')).toEqual(october);
  });

  it('keeps one draw only: a redraw replaces it', async () => {
    await putDraw(october);
    const again = { ...october, slug: 'h-g-wells/the-time-machine', redrawn: true };
    await putDraw(again);
    expect(await getDraw('2026-10')).toEqual(again);
  });

  it('forgets last month’s draw when a new month begins', async () => {
    await putDraw(october);
    expect(await getDraw('2026-11')).toBeNull();
  });

  it('refuses a record that is not a draw', async () => {
    const bad: unknown[] = [
      null,
      'draw',
      { ...october, month: '2026-13' },
      { ...october, month: '2026-1' },
      { ...october, slug: '' },
      { ...october, redrawn: 'no' },
      { ...october, mood: undefined },
    ];
    for (const record of bad) {
      await expect(putDraw(record as DrawRecord)).rejects.toThrow(TypeError);
    }
    expect(await getDraw('2026-10')).toBeNull();
  });

  it('ignores a stored value it does not recognise', async () => {
    await putSetting('draw', { month: '2026-10', slug: 42 });
    expect(await getDraw('2026-10')).toBeNull();
  });

  it('stores a copy, not the object it was given', async () => {
    const record = { ...october };
    await putDraw(record);
    record.redrawn = true;
    expect((await getDraw('2026-10'))?.redrawn).toBe(false);
  });

  it('is erased with the rest of the data', async () => {
    await putDraw(october);
    await deleteAllStorage();
    expect(await getSetting('draw')).toBeUndefined();
    expect(await getDraw('2026-10')).toBeNull();
  });
});
