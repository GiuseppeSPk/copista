/**
 * The onnxruntime-web builds the voice can run on, and which one a device
 * loads: each is an entry file and its wasm engine, in bytes as of 1.30.0.
 */
export type OrtBuild = 'webgpu' | 'jspi' | 'wasm';

export const ORT_BUILDS: Record<OrtBuild, { entry: string; files: Record<string, number> }> = {
  // WebGPU and wasm, through Asyncify, for any browser.
  webgpu: {
    entry: 'ort.webgpu.min.mjs',
    files: {
      'ort.webgpu.min.mjs': 66_349,
      'ort-wasm-simd-threaded.asyncify.mjs': 53_057,
      'ort-wasm-simd-threaded.asyncify.wasm': 26_781_914,
    },
  },
  // WebGPU and wasm, through JavaScript Promise Integration, where the browser has it.
  jspi: {
    entry: 'ort.jspi.min.mjs',
    files: {
      'ort.jspi.min.mjs': 66_511,
      'ort-wasm-simd-threaded.jspi.mjs': 50_918,
      'ort-wasm-simd-threaded.jspi.wasm': 16_758_545,
    },
  },
  // Wasm only.
  wasm: {
    entry: 'ort.wasm.min.mjs',
    files: {
      'ort.wasm.min.mjs': 50_126,
      'ort-wasm-simd-threaded.mjs': 24_381,
      'ort-wasm-simd-threaded.wasm': 14_239_897,
    },
  },
};

/** Whether the browser can suspend wasm on a promise, as the JSPI build needs. */
export function hasJspi(): boolean {
  return typeof WebAssembly !== 'undefined' && 'Suspending' in WebAssembly;
}

/** The build a device loads: wasm only off the graphics chip, else JSPI where the browser has it. */
export function ortBuild(gpu: boolean, jspi: boolean = hasJspi()): OrtBuild {
  if (!gpu) return 'wasm';
  return jspi ? 'jspi' : 'webgpu';
}

/** The bytes of a build, all its files together. */
export function buildBytes(build: OrtBuild): number {
  return Object.values(ORT_BUILDS[build].files).reduce((sum, bytes) => sum + bytes, 0);
}
