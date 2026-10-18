import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '../../../src/reader/render';
import {
  DEFAULT_SETTINGS,
  deleteAllData,
  getSettings,
  type ReadingMode,
  storageUsage,
  updateSettings,
} from '../../../src/rooms/archivum/index';
import type { VoiceChip, VoiceId } from '../../../src/voice/narrator';
import { deleteAllStorage, listBooks, putBook, putSetting } from '../../../src/storage/db';

beforeEach(async () => {
  await deleteAllStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('archivum', () => {
  it('starts from the default settings', async () => {
    const defaults = {
      fontSizePercent: 100,
      theme: 'light',
      mode: 'pages',
      pace: 200,
      guideLine: false,
      voice: 'M2',
      voiceRate: 1,
      voiceChip: 'auto',
    };
    expect(await getSettings()).toEqual(defaults);
    expect(DEFAULT_SETTINGS).toEqual(defaults);
  });

  it('keeps font size in steps of 10 between 80 and 200, and only known themes', async () => {
    expect((await updateSettings({ fontSizePercent: 250 })).fontSizePercent).toBe(200);
    expect((await updateSettings({ fontSizePercent: 73 })).fontSizePercent).toBe(80);
    expect((await updateSettings({ fontSizePercent: 117 })).fontSizePercent).toBe(120);
    await updateSettings({ theme: 'dark' });
    expect((await updateSettings({ theme: 'neon' as Theme })).theme).toBe('dark');
    expect(await getSettings()).toMatchObject({ fontSizePercent: 120, theme: 'dark' });
  });

  it('keeps the reading mode, a pace from the levels and the guide line switch', async () => {
    expect((await updateSettings({ mode: 'scroll' })).mode).toBe('scroll');
    expect((await updateSettings({ mode: 'columns' as ReadingMode })).mode).toBe('scroll');
    expect((await updateSettings({ pace: 210 })).pace).toBe(200);
    expect((await updateSettings({ pace: 1000 })).pace).toBe(400);
    expect((await updateSettings({ pace: 'x' as unknown as number })).pace).toBe(400);
    expect((await updateSettings({ guideLine: true })).guideLine).toBe(true);
    expect((await updateSettings({ guideLine: 'yes' as unknown as boolean })).guideLine).toBe(true);
  });

  it('loads settings saved before the reading mode existed', async () => {
    await putSetting('reader', { fontSizePercent: 120, theme: 'sepia' });
    expect(await getSettings()).toEqual({
      fontSizePercent: 120,
      theme: 'sepia',
      mode: 'pages',
      pace: 200,
      guideLine: false,
      voice: 'M2',
      voiceRate: 1,
      voiceChip: 'auto',
    });
  });

  it('keeps a speed of the voice from its steps and ignores any other', async () => {
    expect((await updateSettings({ voiceRate: 1.5 })).voiceRate).toBe(1.5);
    expect((await updateSettings({ voiceRate: 1.4 })).voiceRate).toBe(1.5);
    expect((await updateSettings({ voiceRate: 'fast' as unknown as number })).voiceRate).toBe(1.5);
    expect(await getSettings()).toMatchObject({ voiceRate: 1.5 });
  });

  it('keeps the Lectrix as the voice and ignores a voice it does not know', async () => {
    expect((await updateSettings({ voice: 'F1' })).voice).toBe('F1');
    expect((await updateSettings({ voice: 'X1' as VoiceId })).voice).toBe('F1');
    expect((await getSettings()).voice).toBe('F1');
  });

  it('keeps the chip the voice runs on and ignores one it does not know', async () => {
    expect((await updateSettings({ voiceChip: 'graphics' })).voiceChip).toBe('graphics');
    expect((await updateSettings({ voiceChip: 'npu' as VoiceChip })).voiceChip).toBe('graphics');
    expect((await updateSettings({ voiceChip: 'processor' })).voiceChip).toBe('processor');
    expect((await getSettings()).voiceChip).toBe('processor');
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
