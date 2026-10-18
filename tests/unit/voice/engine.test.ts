import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORT_BUILDS, buildBytes, ortBuild } from '../../../src/voice/engine';

const dist = dirname(createRequire(import.meta.url).resolve('onnxruntime-web'));

describe('ortBuild', () => {
  it('loads wasm alone off the graphics chip, whatever the browser can do', () => {
    expect(ortBuild(false, true)).toBe('wasm');
    expect(ortBuild(false, false)).toBe('wasm');
  });

  it('loads the JSPI build on the graphics chip where the browser has JSPI, else Asyncify', () => {
    expect(ortBuild(true, true)).toBe('jspi');
    expect(ortBuild(true, false)).toBe('webgpu');
  });
});

describe('ORT_BUILDS', () => {
  it('names each file with its size in the onnxruntime-web installed', () => {
    for (const { entry, files } of Object.values(ORT_BUILDS)) {
      expect(Object.keys(files)[0]).toBe(entry);
      for (const [name, bytes] of Object.entries(files)) {
        expect(statSync(join(dist, name)).size, name).toBe(bytes);
      }
    }
  });

  it('pairs each entry with the wasm engine it imports', () => {
    for (const { entry, files } of Object.values(ORT_BUILDS)) {
      const engine = Object.keys(files).find((name) => name.endsWith('.mjs') && name !== entry)!;
      expect(readFileSync(join(dist, entry), 'utf8'), entry).toContain(engine);
    }
  });

  it('downloads less for wasm alone than for WebGPU', () => {
    expect(buildBytes('wasm')).toBe(50_126 + 24_381 + 14_239_897);
    expect(buildBytes('wasm')).toBeLessThan(buildBytes('jspi'));
    expect(buildBytes('jspi')).toBeLessThan(buildBytes('webgpu'));
  });
});
