import { describe, expect, it } from 'vitest';
import { hashOf, parseHash } from '../../../src/ui/route';

describe('parseHash', () => {
  it('opens the home screen when there is no hash', () => {
    expect(parseHash('')).toEqual({ room: 'home' });
    expect(parseHash('#/')).toEqual({ room: 'home' });
  });

  it('reads each room', () => {
    expect(parseHash('#/bibliotheca')).toEqual({ room: 'bibliotheca' });
    expect(parseHash('#/scriptorium')).toEqual({ room: 'scriptorium' });
    expect(parseHash('#/archivum')).toEqual({ room: 'archivum' });
    expect(parseHash('#/lectorium')).toEqual({ room: 'lectorium' });
  });

  it('opens the Lectorium for an old link to the Auditorium, where the voice now lives', () => {
    expect(parseHash('#/auditorium')).toEqual({ room: 'lectorium' });
  });

  it('reads the book being read', () => {
    expect(parseHash('#/read/abc%2F1')).toEqual({ room: 'lectorium', bookId: 'abc/1' });
  });

  it('falls back to the home screen for an unknown hash', () => {
    expect(parseHash('#/nowhere')).toEqual({ room: 'home' });
  });

  it('falls back to the Bibliotheca for a malformed book link', () => {
    expect(parseHash('#/read/')).toEqual({ room: 'bibliotheca' });
    expect(parseHash('#/read/%E0%A4%A')).toEqual({ room: 'bibliotheca' });
  });

  it('round-trips through hashOf', () => {
    for (const route of [
      { room: 'home' },
      { room: 'bibliotheca' },
      { room: 'lectorium' },
      { room: 'lectorium', bookId: 'a b#c' },
      { room: 'scriptorium' },
      { room: 'archivum' },
    ] as const) {
      expect(parseHash(hashOf(route))).toEqual(route);
    }
  });
});
