import type { Classic } from './catalogues';

/**
 * The month's draw. The Romans opened Virgil at random to learn their future (the sortes
 * Virgilianae); here a reader answers two questions and turns one of three cards to learn their
 * next book. Every book is free at Standard Ebooks, and every word count and reading time below
 * is the one that edition's page gives (checked on 10 October 2026).
 */

export type Mood = 'mystery' | 'horror' | 'adventure' | 'love' | 'strange' | 'laugh' | 'ideas';
export type MoodChoice = Mood | 'any';
export type Length = 'evening' | 'evenings' | 'season';
export type LengthChoice = Length | 'any';

export interface Lot extends Classic {
  /** The edition's path at Standard Ebooks, which also names the lot in storage. */
  slug: string;
  mood: Mood;
  words: number;
  /** Reading time in minutes, as Standard Ebooks estimates it. */
  minutes: number;
  /** One line that makes the book worth opening, without giving it away. */
  hook: string;
}

export const SOURCE = 'Standard Ebooks';
const BASE = 'https://standardebooks.org/ebooks/';

type Entry = [
  slug: string,
  title: string,
  author: string,
  words: number,
  minutes: number,
  hook: string,
];

const ENTRIES: Record<Mood, Entry[]> = {
  mystery: [
    [
      'arthur-conan-doyle/a-study-in-scarlet',
      'A Study in Scarlet',
      'Arthur Conan Doyle',
      43367,
      158,
      'The first time Holmes and Watson meet. It starts with a corpse.',
    ],
    [
      'arthur-conan-doyle/the-hound-of-the-baskervilles',
      'The Hound of the Baskervilles',
      'Arthur Conan Doyle',
      59283,
      216,
      'A family curse, a moor in the fog, and something howling out there.',
    ],
    [
      'agatha-christie/the-murder-of-roger-ackroyd',
      'The Murder of Roger Ackroyd',
      'Agatha Christie',
      70092,
      255,
      'Readers have argued about its ending for a century. Do not let anyone spoil it.',
    ],
    [
      'g-k-chesterton/the-innocence-of-father-brown',
      'The Innocence of Father Brown',
      'G. K. Chesterton',
      79040,
      288,
      'A small priest with an umbrella who understands criminals too well.',
    ],
    [
      'wilkie-collins/the-moonstone',
      'The Moonstone',
      'Wilkie Collins',
      196206,
      714,
      'A stolen diamond, a country house, and a crowd of narrators who all saw something.',
    ],
    [
      'wilkie-collins/the-woman-in-white',
      'The Woman in White',
      'Wilkie Collins',
      247378,
      900,
      'A midnight road outside London, and a woman dressed all in white who should not be there.',
    ],
  ],
  horror: [
    [
      'robert-louis-stevenson/the-strange-case-of-dr-jekyll-and-mr-hyde',
      'The Strange Case of Dr. Jekyll and Mr. Hyde',
      'Robert Louis Stevenson',
      25664,
      94,
      'A respectable doctor, a locked laboratory, and a man nobody can describe.',
    ],
    [
      'henry-james/the-turn-of-the-screw',
      'The Turn of the Screw',
      'Henry James',
      42795,
      156,
      'A governess, two children, and ghosts that may or may not be there.',
    ],
    [
      'robert-w-chambers/the-king-in-yellow',
      'The King in Yellow',
      'Robert W. Chambers',
      71937,
      262,
      'Stories around a play that drives its readers mad. You are about to read about it.',
    ],
    [
      'mary-shelley/frankenstein',
      'Frankenstein',
      'Mary Shelley',
      77898,
      284,
      'The creature talks, reads Milton, and wants answers from the man who made him.',
    ],
    [
      'oscar-wilde/the-picture-of-dorian-gray',
      'The Picture of Dorian Gray',
      'Oscar Wilde',
      79057,
      288,
      'A portrait ages so its owner never has to. Then the bill comes.',
    ],
    [
      'bram-stoker/dracula',
      'Dracula',
      'Bram Stoker',
      161105,
      586,
      'Told in letters, diaries and telegrams, by people who slowly understand.',
    ],
  ],
  adventure: [
    [
      'jack-london/the-call-of-the-wild',
      'The Call of the Wild',
      'Jack London',
      31792,
      116,
      'A dog stolen from a California ranch, and remade by the Yukon.',
    ],
    [
      'john-buchan/the-thirty-nine-steps',
      'The Thirty-Nine Steps',
      'John Buchan',
      41003,
      150,
      'A man on the run across Scotland with a dead stranger’s notebook.',
    ],
    [
      'jules-verne/around-the-world-in-eighty-days/george-makepeace-towle',
      'Around the World in Eighty Days',
      'Jules Verne',
      62832,
      229,
      'It starts with a bet at a London club, and the clock never stops.',
    ],
    [
      'robert-louis-stevenson/treasure-island',
      'Treasure Island',
      'Robert Louis Stevenson',
      68365,
      249,
      'A map, an inn on the coast, and Long John Silver.',
    ],
    [
      'h-rider-haggard/king-solomons-mines',
      'King Solomon’s Mines',
      'H. Rider Haggard',
      81611,
      297,
      'Three Englishmen, an old map drawn in blood, and a desert to cross.',
    ],
    [
      'herman-melville/moby-dick',
      'Moby-Dick',
      'Herman Melville',
      211202,
      769,
      'Everyone knows the first line. Few have met the whale.',
    ],
    [
      'alexandre-dumas/the-three-musketeers/william-robson',
      'The Three Musketeers',
      'Alexandre Dumas',
      229639,
      836,
      'D’Artagnan arrives in Paris and picks three duels in one morning.',
    ],
    [
      'alexandre-dumas/the-count-of-monte-cristo/chapman-and-hall',
      'The Count of Monte Cristo',
      'Alexandre Dumas',
      461521,
      1679,
      'Revenge has never been this patient.',
    ],
  ],
  love: [
    [
      'e-m-forster/a-room-with-a-view',
      'A Room With a View',
      'E. M. Forster',
      67007,
      244,
      'Florence, a room without a view, and a kiss among the violets.',
    ],
    [
      'jane-austen/persuasion',
      'Persuasion',
      'Jane Austen',
      83304,
      303,
      'She turned him down eight years ago. Now he is back.',
    ],
    [
      'edith-wharton/the-age-of-innocence',
      'The Age of Innocence',
      'Edith Wharton',
      101823,
      371,
      'Old New York, a perfect engagement, and the cousin who should not have come home.',
    ],
    [
      'emily-bronte/wuthering-heights',
      'Wuthering Heights',
      'Emily Brontë',
      116440,
      424,
      'A storm on the moors that lasts two generations.',
    ],
    [
      'jane-austen/pride-and-prejudice',
      'Pride and Prejudice',
      'Jane Austen',
      121970,
      444,
      'First impressions, second thoughts.',
    ],
    [
      'elizabeth-gaskell/north-and-south',
      'North and South',
      'Elizabeth Gaskell',
      182124,
      663,
      'A parson’s daughter, a mill owner, and a city of smoke between them.',
    ],
    [
      'charlotte-bronte/jane-eyre',
      'Jane Eyre',
      'Charlotte Brontë',
      186958,
      680,
      'She has a mind of her own. And there is something in the attic.',
    ],
  ],
  strange: [
    [
      'karel-capek/r-u-r/paul-selver_nigel-playfair',
      'R.U.R.',
      'Karel Čapek',
      19917,
      73,
      'The play that gave the world the word robot.',
    ],
    [
      'h-g-wells/the-time-machine',
      'The Time Machine',
      'H. G. Wells',
      32429,
      118,
      'Eight hundred thousand years ahead, and it is not paradise.',
    ],
    [
      'edwin-a-abbott/flatland',
      'Flatland',
      'Edwin A. Abbott',
      33546,
      122,
      'A square in a world of two dimensions is visited by a sphere.',
    ],
    [
      'charlotte-perkins-gilman/herland',
      'Herland',
      'Charlotte Perkins Gilman',
      53073,
      193,
      'Three explorers find a country where only women have lived for two thousand years.',
    ],
    [
      'h-g-wells/the-war-of-the-worlds',
      'The War of the Worlds',
      'H. G. Wells',
      60181,
      219,
      'Cylinders fall on Surrey, and something unscrews the lids.',
    ],
    [
      'yevgeny-zamyatin/we/gregory-zilboorg',
      'We',
      'Yevgeny Zamyatin',
      63805,
      233,
      'A glass city that runs on a timetable, and an engineer who begins to dream.',
    ],
    [
      'edgar-rice-burroughs/a-princess-of-mars',
      'A Princess of Mars',
      'Edgar Rice Burroughs',
      67087,
      244,
      'A Civil War veteran is trapped in an Arizona cave, and finds himself on Mars.',
    ],
  ],
  laugh: [
    [
      'oscar-wilde/the-importance-of-being-earnest',
      'The Importance of Being Earnest',
      'Oscar Wilde',
      20536,
      75,
      'Two men with double lives, and both of them are called Ernest.',
    ],
    [
      'voltaire/candide/the-modern-library',
      'Candide',
      'Voltaire',
      33693,
      123,
      'Everything is for the best in the best of all possible worlds. Everything.',
    ],
    [
      'jerome-k-jerome/three-men-in-a-boat',
      'Three Men in a Boat',
      'Jerome K. Jerome',
      66909,
      244,
      'Three friends, a dog and the Thames. To say nothing of the dog.',
    ],
    [
      'p-g-wodehouse/right-ho-jeeves',
      'Right Ho, Jeeves',
      'P. G. Wodehouse',
      74071,
      270,
      'Bertie Wooster has a plan. Jeeves has a better one.',
    ],
    [
      'jane-austen/northanger-abbey',
      'Northanger Abbey',
      'Jane Austen',
      77464,
      282,
      'A girl who has read too many Gothic novels is invited to an abbey.',
    ],
    [
      'mark-twain/a-connecticut-yankee-in-king-arthurs-court',
      'A Connecticut Yankee in King Arthur’s Court',
      'Mark Twain',
      118328,
      431,
      'A factory foreman wakes up in Camelot and starts to modernise it.',
    ],
    [
      'charles-dickens/the-pickwick-papers',
      'The Pickwick Papers',
      'Charles Dickens',
      302088,
      1099,
      'A club of gentlemen sets out to study England. England studies them back.',
    ],
  ],
  ideas: [
    [
      'niccolo-machiavelli/the-prince/w-k-marriott',
      'The Prince',
      'Niccolò Machiavelli',
      34990,
      128,
      'Is it better to be loved or feared? He has an answer.',
    ],
    [
      'fyodor-dostoevsky/notes-from-underground/constance-garnett',
      'Notes from Underground',
      'Fyodor Dostoevsky',
      43991,
      160,
      'A bitter man in a basement, arguing with himself and with you.',
    ],
    [
      'marcus-aurelius/meditations/george-long',
      'Meditations',
      'Marcus Aurelius',
      45608,
      166,
      'An emperor’s notes to himself, never meant for you to read.',
    ],
    [
      'john-stuart-mill/on-liberty',
      'On Liberty',
      'John Stuart Mill',
      50855,
      185,
      'Where the power of society over you ends.',
    ],
    [
      'henry-david-thoreau/walden',
      'Walden',
      'Henry David Thoreau',
      106677,
      388,
      'Two years in a cabin by a pond, to see what life is when you strip it down.',
    ],
  ],
};

export const DECK: readonly Lot[] = (Object.keys(ENTRIES) as Mood[]).flatMap((mood) =>
  ENTRIES[mood].map(([slug, title, author, words, minutes, hook]) => ({
    slug,
    title,
    author,
    href: BASE + slug,
    mood,
    words,
    minutes,
    hook,
  })),
);

/** Each answer as a button says it, and as the summary of a draw repeats it. */
export const MOODS: readonly { value: MoodChoice; label: string; asked: string }[] = [
  { value: 'mystery', label: 'A mystery', asked: 'a mystery' },
  { value: 'horror', label: 'A scare', asked: 'a scare' },
  { value: 'adventure', label: 'An adventure', asked: 'an adventure' },
  { value: 'love', label: 'A love story', asked: 'a love story' },
  { value: 'strange', label: 'Strange worlds', asked: 'strange worlds' },
  { value: 'laugh', label: 'A good laugh', asked: 'a good laugh' },
  { value: 'ideas', label: 'Something to think about', asked: 'something to think about' },
  { value: 'any', label: 'Surprise me', asked: 'a surprise' },
];

export const LENGTHS: readonly { value: LengthChoice; label: string; asked: string }[] = [
  { value: 'evening', label: 'One evening', asked: 'for one evening' },
  { value: 'evenings', label: 'A few evenings', asked: 'for a few evenings' },
  { value: 'season', label: 'A long season', asked: 'for a long season' },
  { value: 'any', label: 'Any length', asked: 'of any length' },
];

/** "You asked for a mystery, for a few evenings.", or null for answers this version does not know. */
export function asked(mood: string, length: string): string | null {
  const m = MOODS.find((x) => x.value === mood);
  const l = LENGTHS.find((x) => x.value === length);
  return m && l ? `You asked for ${m.asked}, ${l.asked}.` : null;
}

/** One evening is up to three hours; a few evenings, up to eight. */
export function lengthOf(minutes: number): Length {
  if (minutes <= 180) return 'evening';
  if (minutes <= 480) return 'evenings';
  return 'season';
}

const MIDDLE: Record<Length, number> = { evening: 120, evenings: 330, season: 900 };

function inMood(mood: MoodChoice): Lot[] {
  return DECK.filter((lot) => mood === 'any' || lot.mood === mood);
}

/** The lengths worth offering for a mood: those that hold at least one book, then any. */
export function lengthsFor(mood: MoodChoice): LengthChoice[] {
  const books = inMood(mood);
  return LENGTHS.map((l) => l.value).filter(
    (value) => value === 'any' || books.some((lot) => lengthOf(lot.minutes) === value),
  );
}

/** A random index in [0, n), from a source of numbers in [0, 1). */
function pick(n: number, random: () => number): number {
  return Math.min(n - 1, Math.floor(random() * n));
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = pick(i + 1, random);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Three cards for the answers given. When the length asked for holds fewer than three books of
 * that mood, the nearest lengths fill the hand, so every hand has three. A book just drawn can be
 * left out, so drawing again never deals it back.
 */
export function deal(
  mood: MoodChoice,
  length: LengthChoice,
  random: () => number = Math.random,
  without?: string,
): Lot[] {
  const books = inMood(mood).filter((lot) => lot.slug !== without);
  if (length === 'any') return shuffle(books, random).slice(0, 3);
  const fits = books.filter((lot) => lengthOf(lot.minutes) === length);
  const hand = shuffle(fits, random).slice(0, 3);
  if (hand.length < 3) {
    const nearest = books
      .filter((lot) => !fits.includes(lot))
      .sort((a, b) => Math.abs(a.minutes - MIDDLE[length]) - Math.abs(b.minutes - MIDDLE[length]));
    hand.push(...nearest.slice(0, 3 - hand.length));
  }
  return shuffle(hand, random);
}

/** What the drawn card says first. */
export const HEADLINES: readonly string[] = [
  'Bet you haven’t read this one.',
  'The lot has fallen.',
  'Of all the books in all the world…',
  'This one has been waiting for you.',
  'Lucky you.',
  'Clear your calendar.',
  'A good draw. A very good draw.',
  'The cards have spoken.',
];

/** The line for a draw. It follows from the draw itself, so it reads the same after a reload. */
export function headline(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return HEADLINES[hash % HEADLINES.length]!;
}

/** A word on the time the book asks for. */
export function pace(minutes: number): string {
  if (minutes < 120) return 'Under two hours. Tonight, then.';
  if (minutes <= 240) return 'One long evening, or two short ones.';
  if (minutes <= 480) return 'A weekend’s worth.';
  if (minutes <= 1200) return 'A long one. Worth every hour.';
  return 'A whole season. Pace yourself.';
}

/** "1 h 36 min", "45 min", "27 h 59 min". */
export function readingTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-10": a draw belongs to the month it was made in, by the reader's own clock. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthName(date: Date): string {
  return MONTHS[date.getMonth()]!;
}

/** "1 November": when the next month's draw opens. */
export function nextDraw(date: Date): string {
  return `1 ${MONTHS[(date.getMonth() + 1) % 12]}`;
}

export function lotBySlug(slug: string): Lot | undefined {
  return DECK.find((lot) => lot.slug === slug);
}
