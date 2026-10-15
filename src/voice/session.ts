export interface SessionActions {
  play(): void;
  pause(): void;
  previous(): void;
  next(): void;
}

export interface LockScreen {
  /** Tells the system whether the reading is playing or paused. */
  playing(on: boolean): void;
  /** Takes the book and the buttons off the lock screen. */
  release(): void;
}

const ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack'] as const;

/**
 * Shows the book on the lock screen and in the system's media controls, and
 * passes their play, pause, previous and next buttons to the reading. Does
 * nothing where the browser has no Media Session.
 */
export function mediaSession(
  meta: { title: string; artist: string },
  actions: SessionActions,
): LockScreen {
  const session = typeof navigator === 'undefined' ? undefined : navigator.mediaSession;
  if (session === undefined || typeof MediaMetadata === 'undefined') {
    return { playing: () => {}, release: () => {} };
  }
  const handlers = {
    play: actions.play,
    pause: actions.pause,
    previoustrack: actions.previous,
    nexttrack: actions.next,
  };
  session.metadata = new MediaMetadata(meta);
  for (const action of ACTIONS) setHandler(session, action, () => handlers[action]());
  return {
    playing: (on) => (session.playbackState = on ? 'playing' : 'paused'),
    release: () => {
      for (const action of ACTIONS) setHandler(session, action, null);
      session.metadata = null;
      session.playbackState = 'none';
    },
  };
}

/** Some browsers throw for an action they do not support. */
function setHandler(
  session: MediaSession,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
): void {
  try {
    session.setActionHandler(action, handler);
  } catch {
    // The button is simply missing there.
  }
}
