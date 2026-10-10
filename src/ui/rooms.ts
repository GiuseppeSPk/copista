import type { IconName } from './icons';
import type { Room } from './route';

export type RoomName = Exclude<Room, 'home'>;

export interface RoomInfo {
  room: RoomName;
  /** The Latin name, set large on the room's own page. */
  name: string;
  /** What the visitor does there: the label of its door and tab. */
  action: string;
  /** The tab label on a phone's bottom bar. */
  short: string;
  icon: IconName;
  /** What the room is, in one or two sentences. */
  about: string;
  /** What can be done there. */
  can: string[];
}

/** The four rooms, in the order of the tabs and of the keys 1 to 4. */
export const ROOMS: readonly RoomInfo[] = [
  {
    room: 'bibliotheca',
    name: 'Bibliotheca',
    action: 'Keep your books',
    short: 'Books',
    icon: 'library',
    about:
      'The library. Every EPUB you add stays in this browser, ready to read or to copy into another format.',
    can: [
      'Add EPUB books or drop them here',
      'Open a book where you left it',
      'Send a book to convert',
    ],
  },
  {
    room: 'lectorium',
    name: 'Lectorium',
    action: 'Read a book',
    short: 'Read',
    icon: 'read',
    about: 'The reading room. Pages turn like a book, and your place is kept for next time.',
    can: ['Tap or swipe to turn pages', 'Pin notes to a page', 'Keep bookmarks'],
  },
  {
    room: 'scriptorium',
    name: 'Scriptorium',
    action: 'Convert a file',
    short: 'Convert',
    icon: 'convert',
    about:
      'The copying room. A file goes in and the same text comes out in another format, made here in your browser.',
    can: [
      'Read EPUB, Word, Markdown and text',
      'Write EPUB, Word, Markdown, text, HTML and PDF',
      'Nothing is uploaded or kept',
    ],
  },
  {
    room: 'archivum',
    name: 'Archivum',
    action: 'Manage your data',
    short: 'Data',
    icon: 'archive',
    about:
      'The records room. See what Copista keeps on this device, set how pages look, and erase it all whenever you like.',
    can: [
      'See the space your books use',
      'Set text size and page colours',
      'Delete everything at once',
    ],
  },
];

export function roomInfo(room: RoomName): RoomInfo {
  return ROOMS.find((info) => info.room === room)!;
}

export const GITHUB_URL = 'https://github.com/GiuseppeSPk/copista';
