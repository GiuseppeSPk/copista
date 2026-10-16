import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FILES,
  TOTAL_BYTES,
  VOICE_CACHE,
  VoiceDownloadError,
  fileUrl,
  forgetProfile,
  getProfile,
  install,
  isFit,
  isInstalled,
  readFile,
  remove,
  saveVerdict,
  spaceUsed,
  type VoiceFile,
} from '../../../src/voice/store';

/** A CacheStorage kept in memory, enough for the store. */
class FakeCaches {
  readonly stores = new Map<string, Map<string, Response>>();

  async open(name: string) {
    let store = this.stores.get(name);
    if (store === undefined) this.stores.set(name, (store = new Map()));
    return {
      match: async (key: string | Request) =>
        store.get(typeof key === 'string' ? key : key.url)?.clone(),
      put: async (url: string, response: Response) => void store.set(url, response),
      keys: async () => [...store.keys()].map((url) => new Request(url)),
      delete: async (url: string) => store.delete(url),
    };
  }

  async has(name: string) {
    return this.stores.has(name);
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }

  async match(url: string, options: { cacheName: string }) {
    return this.stores.get(options.cacheName)?.get(url)?.clone();
  }
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const contents = Array.from({ length: 8 }, (_, i) =>
  new TextEncoder().encode(`file ${i} `.repeat(i + 1)),
);
let files: VoiceFile[];
let caches: FakeCaches;
let fetches: string[];
let respond: (url: string, count: number) => Promise<Response>;

function bodyOf(url: string): Uint8Array<ArrayBuffer> {
  return contents[files.findIndex((f) => fileUrl(f.path) === url)]!;
}

beforeEach(async () => {
  files = await Promise.all(
    contents.map(async (c, i) => ({
      path: `onnx/f${i}.bin`,
      bytes: c.length,
      sha256: await sha256(c),
    })),
  );
  caches = new FakeCaches();
  fetches = [];
  respond = async (url) => new Response(bodyOf(url));
  vi.stubGlobal('caches', caches);
  vi.stubGlobal('navigator', { storage: { persist: vi.fn(async () => true) } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetches.push(url);
      return respond(url, fetches.filter((u) => u === url).length);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the voice files', () => {
  it('lists the eight files of the pinned revision', () => {
    expect(FILES).toHaveLength(8);
    expect(TOTAL_BYTES).toBe(FILES.reduce((sum, f) => sum + f.bytes, 0));
    expect(fileUrl('onnx/tts.json')).toBe(
      'https://huggingface.co/GiuseppeSPk/copista-voice/resolve/cddb9ee79954ec63e65ebc147464b0610b648c2c/onnx/tts.json',
    );
  });
});

describe('install', () => {
  it('stores every file and reports the whole size last', async () => {
    const progress = vi.fn();
    await install(progress, undefined, files);
    const total = files.reduce((sum, f) => sum + f.bytes, 0);
    expect(caches.stores.get(VOICE_CACHE)!.size).toBe(8);
    expect(progress).toHaveBeenLastCalledWith(total, total);
    expect(await isInstalled(files)).toBe(true);
    expect(navigator.storage.persist).toHaveBeenCalled();
  });

  it('fetches a file again when it arrives corrupted once', async () => {
    respond = async (url, count) =>
      url.endsWith('f2.bin') && count === 1 ? new Response('broken') : new Response(bodyOf(url));
    await install(() => {}, undefined, files);
    expect(await isInstalled(files)).toBe(true);
  });

  it('gives up on a file corrupted twice, and keeps nothing of it', async () => {
    respond = async (url) =>
      url.endsWith('f2.bin') ? new Response('broken') : new Response(bodyOf(url));
    await expect(install(() => {}, undefined, files)).rejects.toBeInstanceOf(VoiceDownloadError);
    const urls = [...caches.stores.get(VOICE_CACHE)!.keys()];
    expect(urls.some((u) => u.endsWith('f2.bin'))).toBe(false);
  });

  it('after a broken connection, fetches only what is missing', async () => {
    respond = async (url) => {
      if (url.endsWith('f2.bin')) throw new TypeError('Failed to fetch');
      return new Response(bodyOf(url));
    };
    await expect(install(() => {}, undefined, files)).rejects.toBeInstanceOf(VoiceDownloadError);
    expect(caches.stores.get(VOICE_CACHE)!.size).toBe(2);
    expect(await isInstalled(files)).toBe(false);

    respond = async (url) => new Response(bodyOf(url));
    fetches = [];
    await install(() => {}, undefined, files);
    expect(fetches).toHaveLength(6);
    expect(await isInstalled(files)).toBe(true);
  });

  it('stops when asked, with the abort error', async () => {
    const controller = new AbortController();
    controller.abort();
    respond = async () => {
      throw new DOMException('Aborted', 'AbortError');
    };
    await expect(install(() => {}, controller.signal, files)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('reading and removing', () => {
  it('reads a stored file back', async () => {
    await install(() => {}, undefined, files);
    // Compared as numbers: the test's arrays and the fetched ones come from different realms.
    expect([...new Uint8Array(await readFile(files[3]!.path))]).toEqual([...contents[3]!]);
  });

  it('does not create the cache just by looking', async () => {
    expect(await isInstalled(files)).toBe(false);
    expect(await spaceUsed()).toBe(0);
    expect(await getProfile()).toEqual({});
    await expect(readFile(files[0]!.path)).rejects.toBeInstanceOf(VoiceDownloadError);
    expect(await caches.has(VOICE_CACHE)).toBe(false);
  });

  it('removes the files and the profile together', async () => {
    await install(() => {}, undefined, files);
    await saveVerdict('wasm', { steps: 6 });
    expect(await getProfile()).toEqual({ wasm: { steps: 6 } });
    expect(await spaceUsed()).toBeGreaterThan(0);
    await remove();
    expect(await spaceUsed()).toBe(0);
    expect(await getProfile()).toEqual({});
  });

  it("keeps each backend's verdict beside the other's", async () => {
    await saveVerdict('webgpu', { unfit: 'stalled' });
    await saveVerdict('wasm', { steps: 16 });
    expect(await getProfile()).toEqual({ webgpu: { unfit: 'stalled' }, wasm: { steps: 16 } });
  });

  it('forgets the verdicts and keeps the files, so the device is tested again', async () => {
    await install(() => {}, undefined, files);
    await saveVerdict('webgpu', { unfit: 'noise' });
    await forgetProfile();
    expect(await getProfile()).toEqual({});
    expect(await isInstalled(files)).toBe(true);
  });

  it('ignores a verdict it cannot read', async () => {
    const cache = await caches.open(VOICE_CACHE);
    await cache.put(
      fileUrl('copista-profile-3.json'),
      new Response(JSON.stringify({ webgpu: { steps: 7 }, wasm: { unfit: 'tired' } })),
    );
    expect(await getProfile()).toEqual({});
  });
});

describe('isFit', () => {
  it('is yes once a backend passed, no once wasm failed, and unknown before', () => {
    expect(isFit({})).toBeNull();
    expect(isFit({ webgpu: { steps: 8 } })).toBe(true);
    expect(isFit({ webgpu: { unfit: 'noise' } })).toBeNull();
    expect(isFit({ webgpu: { unfit: 'noise' }, wasm: { steps: 6 } })).toBe(true);
    expect(isFit({ webgpu: { unfit: 'stalled' }, wasm: { unfit: 'slow' } })).toBe(false);
    expect(isFit({ wasm: { unfit: 'slow' } })).toBe(false);
  });
});
