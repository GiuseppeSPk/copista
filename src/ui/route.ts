/** Where the app is, kept in the URL hash so a reload lands in the same room and book. */
export type Route =
  | { room: 'home' }
  | { room: 'bibliotheca' }
  | { room: 'lectorium'; bookId?: string }
  | { room: 'scriptorium' }
  | { room: 'archivum' };

export type Room = Route['room'];

const ROOMS: readonly Room[] = ['bibliotheca', 'lectorium', 'scriptorium', 'archivum'];

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path.startsWith('read/')) {
    try {
      const bookId = decodeURIComponent(path.slice('read/'.length));
      if (bookId) return { room: 'lectorium', bookId };
    } catch {
      // A malformed escape: fall through to the library.
    }
    return { room: 'bibliotheca' };
  }
  // The voice had a room of its own before it moved into the Lectorium.
  if (path === 'auditorium') return { room: 'lectorium' };
  const room = ROOMS.find((name) => name === path);
  return room ? ({ room } as Route) : { room: 'home' };
}

export function hashOf(route: Route): string {
  if (route.room === 'home') return '#/';
  if (route.room === 'lectorium' && route.bookId !== undefined) {
    return `#/read/${encodeURIComponent(route.bookId)}`;
  }
  return `#/${route.room}`;
}
