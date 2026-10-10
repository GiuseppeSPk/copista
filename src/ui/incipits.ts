/**
 * First lines of books whose copyright has ended, one for each day, shown in the hall and on an
 * empty shelf. The text is copied from the editions the catalogues give away (the same ones in
 * tests/fixtures/corpus), so the line a reader finds there is the line they read here.
 */

export interface Incipit {
  /** The opening words. Lines of verse are separated by a newline. */
  text: string;
  title: string;
  author: string;
  translator?: string;
  /** The catalogue, by name, that has this edition. */
  catalogue: string;
  /** The edition's page in that catalogue. */
  href: string;
  /** Set when the text is not in English. */
  lang?: string;
}

export const INCIPITS: Incipit[] = [
  {
    text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice',
  },
  {
    text: 'Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.',
    title: 'Moby-Dick',
    author: 'Herman Melville',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/herman-melville/moby-dick',
  },
  {
    text: 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice “without pictures or conversations?”',
    title: 'Alice’s Adventures in Wonderland',
    author: 'Lewis Carroll',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/john-tenniel',
  },
  {
    text: 'Midway upon the journey of our life\nI found myself within a forest dark,\nFor the straightforward pathway had been lost.',
    title: 'The Divine Comedy',
    author: 'Dante Alighieri',
    translator: 'Henry Wadsworth Longfellow',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/dante-alighieri/the-divine-comedy/henry-wadsworth-longfellow',
  },
  {
    text: 'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity…',
    title: 'A Tale of Two Cities',
    author: 'Charles Dickens',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/charles-dickens/a-tale-of-two-cities',
  },
  {
    text: 'On an exceptionally hot evening early in July a young man came out of the garret in which he lodged in S—— Place and walked slowly, as though in hesitation, towards K—— bridge.',
    title: 'Crime and Punishment',
    author: 'Fyodor Dostoevsky',
    translator: 'Constance Garnett',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/fyodor-dostoevsky/crime-and-punishment/constance-garnett',
  },
  {
    text: 'Quel ramo del lago di Como, che volge a mezzogiorno, tra due catene non interrotte di monti, tutte a seni e a golfi, a seconda dello sporgere e del rientrare di quelli, vien, quasi a un tratto, a ristringersi, e a prender corso e figura di fiume…',
    title: 'I promessi sposi',
    author: 'Alessandro Manzoni',
    catalogue: 'Liber Liber',
    href: 'https://liberliber.it/autori/autori-m/alessandro-francesco-tommaso-manzoni/i-promessi-sposi-edizione-a-mondadori-1985/',
    lang: 'it',
  },
  {
    text: 'The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us. His grey eyes shone and twinkled, and his usually pale face was flushed and animated.',
    title: 'The Time Machine',
    author: 'H. G. Wells',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/h-g-wells/the-time-machine',
  },
  {
    text: 'To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name.',
    title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/arthur-conan-doyle/the-adventures-of-sherlock-holmes',
  },
  {
    text: 'A thing of beauty is a joy for ever:\nIts loveliness increases; it will never\nPass into nothingness; but still will keep\nA bower quiet for us, and a sleep\nFull of sweet dreams, and health, and quiet breathing.',
    title: 'Endymion',
    author: 'John Keats',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/john-keats/poetry',
  },
  {
    text: 'Miss Brooke had that kind of beauty which seems to be thrown into relief by poor dress.',
    title: 'Middlemarch',
    author: 'George Eliot',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/george-eliot/middlemarch',
  },
  {
    text: 'Left Munich at 8:35 p.m., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late.',
    title: 'Dracula',
    author: 'Bram Stoker',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/bram-stoker/dracula',
  },
  {
    text: 'Dorothy lived in the midst of the great Kansas prairies, with Uncle Henry, who was a farmer, and Aunt Em, who was the farmer’s wife.',
    title: 'The Wonderful Wizard of Oz',
    author: 'L. Frank Baum',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/l-frank-baum/the-wonderful-wizard-of-oz',
  },
  {
    text: 'I celebrate myself, and sing myself,\nAnd what I assume you shall assume,\nFor every atom belonging to me as good belongs to you.',
    title: 'Leaves of Grass',
    author: 'Walt Whitman',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/walt-whitman/leaves-of-grass',
  },
  {
    text: '“Well, Prince, so Genoa and Lucca are now just family estates of the Buonapartes.”',
    title: 'War and Peace',
    author: 'Leo Tolstoy',
    translator: 'Louise and Aylmer Maude',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/leo-tolstoy/war-and-peace/louise-maude_aylmer-maude',
  },
  {
    text: 'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings.',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/mary-shelley/frankenstein',
  },
  {
    text: 'From my grandfather Verus I learned good morals and the government of my temper.',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    translator: 'George Long',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/marcus-aurelius/meditations/george-long',
  },
  {
    text: 'When on board H.M.S. Beagle, as naturalist, I was much struck with certain facts in the distribution of the organic beings inhabiting South America…',
    title: 'On the Origin of Species',
    author: 'Charles Darwin',
    catalogue: 'Standard Ebooks',
    href: 'https://standardebooks.org/ebooks/charles-darwin/the-origin-of-species',
  },
];

/** Whole days since 1 January 1970 in the reader's own time zone, so the line turns at midnight. */
export function dayOf(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** The position of the day's first line; the same all day, the next one tomorrow. */
export function incipitIndex(date: Date): number {
  return dayOf(date) % INCIPITS.length;
}

/** Which part of the day it is, for the line's heading. */
export function partOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}
