import { describe, expect, it } from 'vitest';
import {
  DECK,
  HEADLINES,
  LENGTHS,
  MOODS,
  asked,
  deal,
  headline,
  lengthOf,
  lengthsFor,
  lotBySlug,
  monthKey,
  monthName,
  nextDraw,
  pace,
  readingTime,
  type LengthChoice,
  type MoodChoice,
} from '../../../src/ui/sortes';

/** A small seeded source of numbers in [0, 1), so a failing hand can be dealt again. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const moods = MOODS.map((m) => m.value);
const lengths = LENGTHS.map((l) => l.value);

describe('the deck', () => {
  it('holds each book once, linked to its page at Standard Ebooks', () => {
    expect(new Set(DECK.map((lot) => lot.slug)).size).toBe(DECK.length);
    for (const lot of DECK) {
      const page = new URL(lot.href);
      expect(page.protocol).toBe('https:');
      expect(page.host).toBe('standardebooks.org');
      expect(page.pathname).toBe(`/ebooks/${lot.slug}`);
      expect(page.search).toBe('');
      expect(lot.title.trim()).not.toBe('');
      expect(lot.author.trim()).not.toBe('');
      expect(lot.hook.trim()).not.toBe('');
    }
  });

  it('gives every book a plausible count and reading time', () => {
    for (const lot of DECK) {
      expect(Number.isInteger(lot.words)).toBe(true);
      expect(Number.isInteger(lot.minutes)).toBe(true);
      expect(lot.minutes).toBeGreaterThan(0);
      // Standard Ebooks reckons about 275 words a minute; allow for rounding and verse.
      expect(lot.words / lot.minutes).toBeGreaterThan(200);
      expect(lot.words / lot.minutes).toBeLessThan(350);
    }
  });

  it('has at least four books for every mood, so a redraw still deals three', () => {
    for (const mood of moods.filter((m) => m !== 'any')) {
      expect(DECK.filter((lot) => lot.mood === mood).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('finds a book by its slug, and nothing for a slug it does not hold', () => {
    const first = DECK[0]!;
    expect(lotBySlug(first.slug)).toBe(first);
    expect(lotBySlug('nobody/nothing')).toBeUndefined();
    expect(lotBySlug('')).toBeUndefined();
  });
});

describe('lengths', () => {
  it('splits at three and eight hours', () => {
    expect(lengthOf(1)).toBe('evening');
    expect(lengthOf(180)).toBe('evening');
    expect(lengthOf(181)).toBe('evenings');
    expect(lengthOf(480)).toBe('evenings');
    expect(lengthOf(481)).toBe('season');
  });

  it('offers only the lengths a mood can fill, and always any length last', () => {
    for (const mood of moods) {
      const offered = lengthsFor(mood);
      expect(offered.at(-1)).toBe('any');
      for (const length of offered.filter((l) => l !== 'any')) {
        expect(
          DECK.some(
            (lot) => (mood === 'any' || lot.mood === mood) && lengthOf(lot.minutes) === length,
          ),
        ).toBe(true);
      }
    }
    expect(lengthsFor('any')).toEqual(lengths);
  });
});

describe('deal', () => {
  const every: [MoodChoice, LengthChoice][] = moods.flatMap((mood) =>
    lengths.map((length): [MoodChoice, LengthChoice] => [mood, length]),
  );

  it('deals three different cards for every pair of answers', () => {
    for (const [mood, length] of every) {
      for (let seed = 1; seed <= 20; seed++) {
        const hand = deal(mood, length, seeded(seed));
        expect(hand).toHaveLength(3);
        expect(new Set(hand.map((lot) => lot.slug)).size).toBe(3);
        for (const lot of hand) {
          if (mood !== 'any') expect(lot.mood).toBe(mood);
        }
      }
    }
  });

  it('deals only books of the length asked for when there are three of them', () => {
    for (const [mood, length] of every) {
      if (length === 'any') continue;
      const fits = DECK.filter(
        (lot) => (mood === 'any' || lot.mood === mood) && lengthOf(lot.minutes) === length,
      );
      const hand = deal(mood, length, seeded(7));
      const fitting = hand.filter((lot) => lengthOf(lot.minutes) === length).length;
      expect(fitting).toBe(Math.min(3, fits.length));
    }
  });

  it('fills a short hand with the books nearest in length', () => {
    for (const [mood, length] of every) {
      if (length === 'any' || mood === 'any') continue;
      const books = DECK.filter((lot) => lot.mood === mood);
      const fits = books.filter((lot) => lengthOf(lot.minutes) === length);
      if (fits.length >= 3) continue;
      const others = books.filter((lot) => !fits.includes(lot));
      const hand = deal(mood, length, seeded(3));
      const fillers = hand.filter((lot) => !fits.includes(lot));
      const middle = { evening: 120, evenings: 330, season: 900 }[length];
      const distance = (minutes: number) => Math.abs(minutes - middle);
      const furthest = Math.max(...fillers.map((lot) => distance(lot.minutes)));
      const left = others.filter((lot) => !fillers.includes(lot));
      for (const lot of left) expect(distance(lot.minutes)).toBeGreaterThanOrEqual(furthest);
    }
  });

  it('never deals back the book it is told to leave out', () => {
    for (const lot of DECK) {
      for (const length of lengths) {
        const hand = deal(lot.mood, length, seeded(lot.words), lot.slug);
        expect(hand).toHaveLength(3);
        expect(hand.map((l) => l.slug)).not.toContain(lot.slug);
      }
    }
  });

  it('deals the same hand from the same seed, and varies across seeds', () => {
    const hand = (seed: number) =>
      deal('any', 'any', seeded(seed))
        .map((lot) => lot.slug)
        .join();
    expect(hand(42)).toBe(hand(42));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(hand)).size).toBeGreaterThan(1);
  });

  it('copes with a source that returns its upper bound', () => {
    expect(deal('any', 'any', () => 0.9999999999)).toHaveLength(3);
    expect(deal('mystery', 'evening', () => 0)).toHaveLength(3);
  });
});

describe('what the draw says', () => {
  it('picks the same headline for the same draw', () => {
    const seed = '2026-10' + DECK[0]!.slug;
    expect(headline(seed)).toBe(headline(seed));
    expect(HEADLINES).toContain(headline(seed));
    expect(HEADLINES).toContain(headline(''));
  });

  it('uses more than one headline across the deck', () => {
    const lines = new Set(DECK.map((lot) => headline('2026-10' + lot.slug)));
    expect(lines.size).toBeGreaterThan(3);
  });

  it('says a word on the time a book asks for', () => {
    expect(pace(45)).toBe('Under two hours. Tonight, then.');
    expect(pace(120)).toBe('One long evening, or two short ones.');
    expect(pace(240)).toBe('One long evening, or two short ones.');
    expect(pace(241)).toBe('A weekend’s worth.');
    expect(pace(480)).toBe('A weekend’s worth.');
    expect(pace(1200)).toBe('A long one. Worth every hour.');
    expect(pace(1201)).toBe('A whole season. Pace yourself.');
  });

  it('writes reading time in hours and minutes', () => {
    expect(readingTime(45)).toBe('45 min');
    expect(readingTime(120)).toBe('2 h');
    expect(readingTime(216)).toBe('3 h 36 min');
    expect(readingTime(1679)).toBe('27 h 59 min');
  });

  it('repeats the answers, and nothing for answers it does not know', () => {
    expect(asked('mystery', 'evenings')).toBe('You asked for a mystery, for a few evenings.');
    expect(asked('any', 'any')).toBe('You asked for a surprise, of any length.');
    expect(asked('romance', 'evening')).toBeNull();
    expect(asked('mystery', 'forever')).toBeNull();
  });
});

describe('months', () => {
  it('keys a draw to the month by the local clock', () => {
    expect(monthKey(new Date(2026, 9, 1, 0, 0))).toBe('2026-10');
    expect(monthKey(new Date(2026, 9, 31, 23, 59))).toBe('2026-10');
    expect(monthKey(new Date(2027, 0, 1))).toBe('2027-01');
  });

  it('names the month, and the first of the next one', () => {
    expect(monthName(new Date(2026, 9, 10))).toBe('October');
    expect(nextDraw(new Date(2026, 9, 10))).toBe('1 November');
    expect(nextDraw(new Date(2026, 11, 31))).toBe('1 January');
  });
});
