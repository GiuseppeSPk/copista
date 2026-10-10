import { describe, expect, it } from 'vitest';
import { CATALOGUES } from '../../../src/ui/catalogues';
import { INCIPITS, dayOf, incipitIndex, partOfDay } from '../../../src/ui/incipits';

describe('incipits', () => {
  it('names a known catalogue for every line, and links to the edition there', () => {
    for (const line of INCIPITS) {
      const catalogue = CATALOGUES.find((c) => c.name === line.catalogue);
      expect(catalogue).toBeDefined();
      const page = new URL(line.href);
      expect(page.protocol).toBe('https:');
      expect(page.host).toBe(new URL(catalogue!.home).host);
      expect(page.search).toBe('');
      expect(line.text.trim()).not.toBe('');
      expect(line.title.trim()).not.toBe('');
    }
  });

  it('keeps one line all day and moves to the next at midnight', () => {
    const morning = new Date(2026, 9, 10, 0, 5);
    const night = new Date(2026, 9, 10, 23, 55);
    const tomorrow = new Date(2026, 9, 11, 0, 5);
    expect(incipitIndex(morning)).toBe(incipitIndex(night));
    expect(incipitIndex(tomorrow)).toBe((incipitIndex(morning) + 1) % INCIPITS.length);
  });

  it('counts days across a change of year', () => {
    expect(dayOf(new Date(2027, 0, 1)) - dayOf(new Date(2026, 11, 31))).toBe(1);
  });

  it('tells the part of the day', () => {
    expect(partOfDay(new Date(2026, 9, 10, 4, 59))).toBe('night');
    expect(partOfDay(new Date(2026, 9, 10, 5))).toBe('morning');
    expect(partOfDay(new Date(2026, 9, 10, 12))).toBe('afternoon');
    expect(partOfDay(new Date(2026, 9, 10, 18))).toBe('evening');
    expect(partOfDay(new Date(2026, 9, 10, 23))).toBe('night');
  });
});
