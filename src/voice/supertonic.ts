/*
 * Adapted from Supertonic's web/helper.js (https://github.com/supertone-inc/supertonic),
 * rewritten on typed arrays and cut down to one voice and one piece per call.
 *
 * MIT License
 *
 * Copyright (c) 2025 Supertone Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type * as Ort from 'onnxruntime-web';
import type { Lang } from './text';

export type OrtModule = typeof Ort;

/** The four models, as the bytes of their files. */
export interface ModelBytes {
  durationPredictor: Uint8Array;
  textEncoder: Uint8Array;
  vectorEstimator: Uint8Array;
  vocoder: Uint8Array;
}

/** The part of `tts.json` the voice needs. */
export interface TtsConfig {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { chunk_compress_factor: number; latent_dim: number };
}

/** A voice: the two style tensors from its JSON file, flattened. */
export interface Style {
  ttl: Float32Array;
  ttlDims: number[];
  dp: Float32Array;
  dpDims: number[];
}

/** The pause after each piece, in seconds. */
const SILENCE = 0.3;

const EMOJI =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;

const SYMBOLS: [string, string][] = [
  ['–', '-'],
  ['‑', '-'],
  ['—', '-'],
  ['_', ' '],
  ['“', '"'],
  ['”', '"'],
  ['‘', "'"],
  ['’', "'"],
  ['´', "'"],
  ['`', "'"],
  ['[', ' '],
  [']', ' '],
  ['|', ' '],
  ['/', ' '],
  ['#', ' '],
  ['→', ' '],
  ['←', ' '],
];

const EXPRESSIONS: [string, string][] = [
  ['@', ' at '],
  ['e.g.,', 'for example, '],
  ['i.e.,', 'that is, '],
];

/** Normalises a piece the way the model was trained to read it, and tags its language. */
export function preprocessText(text: string, lang: Lang): string {
  text = text.normalize('NFKD').replace(EMOJI, '');
  for (const [from, to] of SYMBOLS) text = text.replaceAll(from, to);
  text = text.replace(/[♥☆♡©\\]/g, '');
  for (const [from, to] of EXPRESSIONS) text = text.replaceAll(from, to);
  text = text.replace(/ ([,.!?;:'])/g, '$1');
  text = text.replace(/"{2,}/g, '"').replace(/'{2,}/g, "'");
  text = text.replace(/\s+/g, ' ').trim();
  if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(text)) text += '.';
  return `<${lang}>${text}</${lang}>`;
}

/** Turns a piece into the model's text ids. */
export class TextIds {
  constructor(private readonly indexer: number[]) {}

  encode(text: string, lang: Lang): BigInt64Array {
    const prepared = preprocessText(text, lang);
    const ids = new BigInt64Array(prepared.length);
    for (let i = 0; i < prepared.length; i++) {
      // Code units, as the original does: a surrogate pair gives two ids.
      const point = prepared.codePointAt(i)!;
      ids[i] = BigInt(point < this.indexer.length ? this.indexer[point]! : -1);
    }
    return ids;
  }
}

interface StyleTensor {
  dims: number[];
  data: unknown[];
}

function isStyleTensor(value: unknown): value is StyleTensor {
  const t = value as StyleTensor | undefined;
  return Array.isArray(t?.dims) && t.dims.length === 3 && Array.isArray(t.data);
}

function flatten(tensor: StyleTensor, name: string): Float32Array {
  const data = new Float32Array(tensor.data.flat(Infinity) as number[]);
  if (data.length !== tensor.dims.reduce((a, b) => a * b, 1)) {
    throw new Error(`The voice style's ${name} does not match its dims`);
  }
  return data;
}

/** Reads a voice style file. */
export function parseStyle(json: unknown): Style {
  const { style_ttl: ttl, style_dp: dp } = (json ?? {}) as Record<string, unknown>;
  if (!isStyleTensor(ttl) || !isStyleTensor(dp)) throw new Error('Not a voice style');
  return {
    ttl: flatten(ttl, 'style_ttl'),
    ttlDims: ttl.dims,
    dp: flatten(dp, 'style_dp'),
    dpDims: dp.dims,
  };
}

/** The noisy latent's shape for a piece lasting `seconds`. */
export function latentSize(seconds: number, cfg: TtsConfig): { length: number; dim: number } {
  const chunk = cfg.ae.base_chunk_size * cfg.ttl.chunk_compress_factor;
  const samples = Math.floor(seconds * cfg.ae.sample_rate);
  return {
    length: Math.max(1, Math.ceil(samples / chunk)),
    dim: cfg.ttl.latent_dim * cfg.ttl.chunk_compress_factor,
  };
}

/** Standard normal noise, by Box-Muller. */
function noise(size: number): Float32Array {
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const u1 = Math.max(0.0001, Math.random());
    const u2 = Math.random();
    out[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  return out;
}

/** The Supertonic voice, run with onnxruntime-web. */
export class Supertonic {
  readonly sampleRate: number;

  private constructor(
    private readonly ort: OrtModule,
    private readonly sessions: Record<keyof ModelBytes, Ort.InferenceSession>,
    private readonly cfg: TtsConfig,
    private readonly ids: TextIds,
  ) {
    this.sampleRate = cfg.ae.sample_rate;
  }

  static async create(
    ort: OrtModule,
    models: ModelBytes,
    cfg: TtsConfig,
    indexer: number[],
    options: { backend: 'webgpu' | 'wasm' },
  ): Promise<Supertonic> {
    const sessionOptions: Ort.InferenceSession.SessionOptions = {
      executionProviders: [options.backend],
      graphOptimizationLevel: 'all',
    };
    const open = (bytes: Uint8Array) => ort.InferenceSession.create(bytes, sessionOptions);
    const sessions = {
      durationPredictor: await open(models.durationPredictor),
      textEncoder: await open(models.textEncoder),
      vectorEstimator: await open(models.vectorEstimator),
      vocoder: await open(models.vocoder),
    };
    return new Supertonic(ort, sessions, cfg, new TextIds(indexer));
  }

  /** Reads one piece aloud: its samples, then a short pause. */
  async speak(
    text: string,
    lang: Lang,
    style: Style,
    steps: number,
    speed: number,
  ): Promise<Float32Array> {
    const { Tensor } = this.ort;
    const s = this.sessions;
    const ids = this.ids.encode(text, lang);
    const textIds = new Tensor('int64', ids, [1, ids.length]);
    const textMask = new Tensor('float32', new Float32Array(ids.length).fill(1), [
      1,
      1,
      ids.length,
    ]);
    const styleTtl = new Tensor('float32', style.ttl, style.ttlDims);
    const styleDp = new Tensor('float32', style.dp, style.dpDims);

    const { duration } = await s.durationPredictor.run({
      text_ids: textIds,
      style_dp: styleDp,
      text_mask: textMask,
    });
    const seconds = (duration!.data as Float32Array)[0]! / speed;

    const { text_emb: textEmb } = await s.textEncoder.run({
      text_ids: textIds,
      style_ttl: styleTtl,
      text_mask: textMask,
    });

    const { length, dim } = latentSize(seconds, this.cfg);
    let latent = noise(dim * length);
    const latentMask = new Tensor('float32', new Float32Array(length).fill(1), [1, 1, length]);
    const totalStep = new Tensor('float32', new Float32Array([steps]), [1]);
    for (let step = 0; step < steps; step++) {
      const { denoised_latent: denoised } = await s.vectorEstimator.run({
        noisy_latent: new Tensor('float32', latent, [1, dim, length]),
        text_emb: textEmb!,
        style_ttl: styleTtl,
        latent_mask: latentMask,
        text_mask: textMask,
        current_step: new Tensor('float32', new Float32Array([step]), [1]),
        total_step: totalStep,
      });
      latent = denoised!.data as Float32Array;
    }

    const { wav_tts: wav } = await s.vocoder.run({
      latent: new Tensor('float32', latent, [1, dim, length]),
    });
    const samples = wav!.data as Float32Array;
    const spoken = Math.min(samples.length, Math.floor(seconds * this.sampleRate));
    const out = new Float32Array(spoken + Math.floor(SILENCE * this.sampleRate));
    out.set(samples.subarray(0, spoken));
    return out;
  }

  async release(): Promise<void> {
    await Promise.all(Object.values(this.sessions).map((session) => session.release()));
  }
}
