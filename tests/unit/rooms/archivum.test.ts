import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '../../../src/reader/render';
import {
  DEFAULT_SETTINGS,
  deleteAllData,
  getSettings,
  storageUsage,
  updateSettings,
} from '../../../src/rooms/archivum/index';
import { deleteAllStorage, listBooks, putBook } from '../../../src/storage/db';

beforeEach(async () => {
  await deleteAllStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('archivum', () => {
  it('starts from the default settings', async () => {
    expect(await getSettings()).toEqual({ fontSizePercent: 100, theme: 'light' });
    expect(DEFAULT_SETTINGS).toEqual({ fontSizePercent: 100, theme: 'light' });
  });

  it('keeps font size in steps of 10 between 80 and 200, and only known themes', async () => {
    expect((await updateSettings({ fontSizePercent: 250 })).fontSizePercent).toBe(200);
    expect((await updateSettings({ fontSizePercent: 73 })).fontSizePercent).toBe(80);
    expect((await updateSettings({ fontSizePercent: 117 })).fontSizePercent).toBe(120);
    await updateSettings({ theme: 'dark' });
    expect((await updateSettings({ theme: 'neon' as Theme })).theme).toBe('dark');
    expect(await getSettings()).toEqual({ fontSizePercent: 120, theme: 'dark' });
  });

  it('reports storage use when the browser can tell', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ usage: 10, quota: 100 }) },
    });
    expect(await storageUsage()).toEqual({ usedBytes: 10, quotaBytes: 100 });
    vi.stubGlobal('navigator', {});
    expect(await storageUsage()).toBeNull();
  });

  it('deletes every book, setting and cache', async () => {
    const del = vi.fn(async (_key: string) => true);
    vi.stubGlobal('caches', { keys: async () => ['a', 'b'], delete: del });
    await updateSettings({ theme: 'sepia' });
    await putBook({ id: 'x', title: 'X', authors: [], fileBlob: new Blob(['x']), addedAt: 1 });
    await deleteAllData();
    expect(await listBooks()).toEqual([]);
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(del.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('deletes everything when the browser has no caches', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(deleteAllData()).resolves.toBeUndefined();
  });
});
