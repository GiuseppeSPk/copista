import { describe, expect, it } from 'vitest';
import { GHOSTS, spineOf } from '../../../src/ui/spines';

describe('spineOf', () => {
  it('gives the same title the same spine every time', () => {
    expect(spineOf('Moby-Dick')).toEqual(spineOf('Moby-Dick'));
  });

  it('keeps sizes and bindings within their ranges', () => {
    for (const title of [
      '',
      'A',
      'Moby-Dick',
      'Pride and Prejudice',
      'Il nome della rosa',
      'ç∂ß',
    ]) {
      const { width, height, binding } = spineOf(title);
      expect(width).toBeGreaterThanOrEqual(30);
      expect(width).toBeLessThanOrEqual(45);
      expect(height).toBeGreaterThanOrEqual(150);
      expect(height).toBeLessThanOrEqual(195);
      expect([0, 1, 2, 3]).toContain(binding);
    }
  });

  it('varies between titles', () => {
    const spines = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((t) =>
      JSON.stringify(spineOf(t)),
    );
    expect(new Set(spines).size).toBeGreaterThan(1);
  });
});

describe('GHOSTS', () => {
  it('has enough shadows to fill the widest shelf', () => {
    expect(GHOSTS).toHaveLength(28);
  });
});
