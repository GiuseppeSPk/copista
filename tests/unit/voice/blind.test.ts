import { describe, expect, it } from 'vitest';
import { TODAY } from '../../../src/voice/audio';
import { TRIALS, shuffle, tally, type Trial } from '../../../src/voice/lab/blind';
import { PASSAGES, passageDocument } from '../../../src/voice/lab/passages';
import { piecesOf } from '../../../src/voice/text';

function trial(name: string): Trial {
  return {
    name,
    passage: 'collodi',
    voice: 'M2',
    a: { label: `${name} a`, tuning: {}, finish: TODAY },
    b: { label: `${name} b`, tuning: { speed: 1 }, finish: TODAY },
  };
}

const SEVEN = ['1', '2', '3', '4', '5', '6', '7'].map(trial);

describe('shuffle', () => {
  it('keeps the trials in order and gives the same hidden order for the same seed', () => {
    const once = shuffle(SEVEN, 42);
    expect(once.map(({ trial }) => trial.name)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(shuffle(SEVEN, 42)).toEqual(once);
  });

  it('plays a first about as often as b', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const firsts = shuffle(SEVEN, seed).map(({ first }) => first);
      const a = firsts.filter((first) => first === 'a').length;
      expect(Math.abs(a - (firsts.length - a))).toBeLessThanOrEqual(1);
    }
  });

  it('gives different hidden orders for different seeds', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      orders.add(
        shuffle(SEVEN, seed)
          .map(({ first }) => first)
          .join(''),
      );
    }
    expect(orders.size).toBeGreaterThan(5);
  });
});

describe('tally', () => {
  it('counts each answer for the variant that was heard in that place', () => {
    expect(
      tally([
        { name: 'pauses', first: 'a', preferred: 'first' },
        { name: 'pauses', first: 'b', preferred: 'first' },
        { name: 'pauses', first: 'b', preferred: 'second' },
        { name: 'pauses', first: 'a', preferred: 'same' },
        { name: 'tone', first: 'b', preferred: 'second' },
      ]),
    ).toEqual({
      pauses: { a: 2, b: 1, same: 1 },
      tone: { a: 1, b: 0, same: 0 },
    });
  });

  it('is empty with no answers', () => {
    expect(tally([])).toEqual({});
  });
});

describe('the passages', () => {
  it('each split into a heading, paragraphs and the end of a chapter', () => {
    for (const passage of Object.values(PASSAGES)) {
      const ends = piecesOf(passageDocument(passage), passage.lang, 0).map(({ ends }) => ends);
      expect(ends[0]).toBe('heading');
      expect(ends).toContain('paragraph');
      expect(ends.at(-1)).toBe('chapter');
    }
  });

  it('give the text fixes something to fix', () => {
    const text = [PASSAGES.fixes.heading, ...PASSAGES.fixes.paragraphs].join(' ');
    for (const written of ['Capitolo XIV', 'sig.', 'sig.ra', 'ecc.', 'p. es.', 'Libro III']) {
      expect(text).toContain(written);
    }
  });
});

describe('the trials', () => {
  it('are the eleven the plan lists, each named once', () => {
    expect(TRIALS.map(({ name }) => name)).toEqual([
      'pauses',
      'fade',
      'abbreviations',
      'roman numerals',
      'noise',
      'tone',
      'seed M2 2 or 5',
      'seed M2 2 or 7',
      'seed F1 1 or 3',
      'seed F1 1 or 4',
      'speed',
    ]);
  });

  it('each set two different variants against each other', () => {
    for (const { a, b } of TRIALS) {
      expect(a.label).not.toBe(b.label);
      expect({ ...a, label: '' }).not.toEqual({ ...b, label: '' });
    }
  });

  it('are heard as on 15 October, whatever the voice reads with now', () => {
    for (const { voice, a, b } of TRIALS) {
      expect(a.tuning.fixes).toEqual([]);
      expect(a.tuning.seed).toBe({ M2: 2, F1: 1 }[voice]);
      expect(b.tuning.fixes).toBeDefined();
      expect(b.tuning.seed).toBeDefined();
    }
  });

  it('keep today as the a side', () => {
    for (const { a } of TRIALS) {
      expect(a.finish).toEqual(TODAY);
    }
  });
});
