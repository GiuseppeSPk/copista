import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaSession } from '../../../src/voice/session';

/** A Media Session that keeps what the page gave it. */
function stubSession() {
  const handlers = new Map<string, (() => void) | null>();
  const session = {
    metadata: null as unknown,
    playbackState: 'none' as string,
    setActionHandler: (action: string, handler: (() => void) | null) =>
      handlers.set(action, handler),
  };
  vi.stubGlobal('navigator', { ...navigator, mediaSession: session });
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(readonly init: { title: string; artist: string }) {}
    },
  );
  return { session, handlers };
}

afterEach(() => vi.unstubAllGlobals());

describe('the lock screen', () => {
  it('shows the book and passes play, pause, previous and next to the reading', () => {
    const { session, handlers } = stubSession();
    const calls: string[] = [];
    const lock = mediaSession(
      { title: 'Long Book', artist: 'A. Writer' },
      {
        play: () => calls.push('play'),
        pause: () => calls.push('pause'),
        previous: () => calls.push('previous'),
        next: () => calls.push('next'),
      },
    );
    expect(session.metadata).toMatchObject({ init: { title: 'Long Book', artist: 'A. Writer' } });
    for (const action of ['play', 'pause', 'previoustrack', 'nexttrack']) {
      handlers.get(action)!();
    }
    expect(calls).toEqual(['play', 'pause', 'previous', 'next']);

    lock.playing(true);
    expect(session.playbackState).toBe('playing');
    lock.playing(false);
    expect(session.playbackState).toBe('paused');

    lock.release();
    for (const action of ['play', 'pause', 'previoustrack', 'nexttrack']) {
      expect(handlers.get(action)).toBeNull();
    }
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
  });

  it('does nothing where the browser has no Media Session', () => {
    vi.stubGlobal('navigator', { ...navigator, mediaSession: undefined });
    const noop = (): void => {};
    const lock = mediaSession(
      { title: 'Long Book', artist: '' },
      { play: noop, pause: noop, previous: noop, next: noop },
    );
    expect(() => {
      lock.playing(true);
      lock.release();
    }).not.toThrow();
  });
});
