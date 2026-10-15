/*
 * Blind tests of the voice: two settings over the same passage, in an order
 * the listener does not know, and a count of which one was preferred.
 */
import { TODAY, type Finish } from '../audio';
import type { Tuning, VoiceId } from '../narrator';
import type { PassageId } from './passages';

/** One setting of the voice: how it speaks, and how each piece ends. */
export interface Variant {
  label: string;
  tuning: Tuning;
  finish: Finish;
}

/** Two settings over one passage, read by one voice. `a` is always the voice as it read before 15 October. */
export interface Trial {
  name: string;
  passage: PassageId;
  voice: VoiceId;
  a: Variant;
  b: Variant;
}

/** What the listener chose for a trial, and which variant was played first. */
export interface Answer {
  name: string;
  first: 'a' | 'b';
  preferred: 'first' | 'second' | 'same';
}

const TODAY_VARIANT: Variant = { label: 'today', tuning: {}, finish: TODAY };

function seeds(voice: VoiceId, today: number, other: number, passage: PassageId): Trial {
  return {
    name: `seed ${voice} ${today} or ${other}`,
    passage,
    voice,
    a: { label: `seed ${today}`, tuning: { seed: today }, finish: TODAY },
    b: { label: `seed ${other}`, tuning: { seed: other }, finish: TODAY },
  };
}

/** How each voice read before the blind tests of 15 October, under the settings each trial names. */
const BEFORE: Record<VoiceId, Tuning> = { M2: { seed: 2, fixes: [] }, F1: { seed: 1, fixes: [] } };

/** The trials of 15 October, in the order they are played. */
const ROUND: readonly Trial[] = [
  {
    name: 'pauses',
    passage: 'manzoni',
    voice: 'M2',
    a: { ...TODAY_VARIANT, label: '0.3 s after every piece' },
    b: {
      label: '0.3, 0.6, 0.9, 1.5 s by what follows',
      tuning: {},
      finish: { ...TODAY, pauses: { piece: 0.3, paragraph: 0.6, heading: 0.9, chapter: 1.5 } },
    },
  },
  {
    name: 'fade',
    passage: 'collodi',
    voice: 'F1',
    a: { ...TODAY_VARIANT, label: 'no fade' },
    b: { label: '15 ms fade', tuning: {}, finish: { ...TODAY, fadeMs: 15 } },
  },
  {
    name: 'abbreviations',
    passage: 'fixes',
    voice: 'M2',
    a: { ...TODAY_VARIANT, label: 'abbreviations as written' },
    b: { label: 'abbreviations spelt out', tuning: { fixes: ['abbreviations'] }, finish: TODAY },
  },
  {
    name: 'roman numerals',
    passage: 'fixes',
    voice: 'F1',
    a: { ...TODAY_VARIANT, label: 'numerals as written' },
    b: { label: 'numerals as ordinals', tuning: { fixes: ['roman'] }, finish: TODAY },
  },
  {
    name: 'noise',
    passage: 'dialogue',
    voice: 'F1',
    a: { ...TODAY_VARIANT, label: 'latent noise' },
    b: { label: 'frame noise', tuning: { noise: 'frame' }, finish: TODAY },
  },
  {
    name: 'tone',
    passage: 'austen',
    voice: 'M2',
    a: { ...TODAY_VARIANT, label: 'tone off' },
    b: { label: 'tone on', tuning: {}, finish: { ...TODAY, tone: true } },
  },
  seeds('M2', 2, 5, 'collodi'),
  seeds('M2', 2, 7, 'collodi'),
  seeds('F1', 1, 3, 'manzoni'),
  seeds('F1', 1, 4, 'manzoni'),
  {
    name: 'speed',
    passage: 'manzoni',
    voice: 'M2',
    a: { ...TODAY_VARIANT, label: 'speed 1.1' },
    b: { label: 'speed 1.0', tuning: { speed: 1 }, finish: TODAY },
  },
];

/** A small seeded generator (mulberry32), so a run can be played again in the same order. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/**
 * The trials in their order, each with the variant to play first: a and b
 * first equally often, give or take one, placed at random by the seed.
 */
export function shuffle(
  trials: readonly Trial[],
  seed: number,
): { trial: Trial; first: 'a' | 'b' }[] {
  const next = random(seed);
  const firsts = trials.map((_, i): 'a' | 'b' => (i % 2 === 0 ? 'a' : 'b'));
  if (next() < 0.5)
    for (let i = 0; i < firsts.length; i++) firsts[i] = firsts[i] === 'a' ? 'b' : 'a';
  for (let i = firsts.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [firsts[i], firsts[j]] = [firsts[j]!, firsts[i]!];
  }
  return trials.map((trial, i) => ({ trial, first: firsts[i]! }));
}

/** How often each trial's a, b, or neither was preferred. */
export function tally(
  answers: readonly Answer[],
): Record<string, { a: number; b: number; same: number }> {
  const counts: Record<string, { a: number; b: number; same: number }> = {};
  for (const { name, first, preferred } of answers) {
    const count = (counts[name] ??= { a: 0, b: 0, same: 0 });
    if (preferred === 'same') count.same++;
    else if ((preferred === 'first') === (first === 'a')) count.a++;
    else count.b++;
  }
  return counts;
}

/** The trials, heard as on 15 October whatever the voice's defaults are now. */
export const TRIALS: readonly Trial[] = ROUND.map((trial) => ({
  ...trial,
  a: { ...trial.a, tuning: { ...BEFORE[trial.voice], ...trial.a.tuning } },
  b: { ...trial.b, tuning: { ...BEFORE[trial.voice], ...trial.b.tuning } },
}));
