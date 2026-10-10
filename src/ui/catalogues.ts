/**
 * Libraries that give away books whose copyright has ended. Copista only links to them: the
 * link opens their site in a new tab, the reader downloads the EPUB there and drops it here.
 * Nothing is fetched from these sites, so the content security policy stays as it is.
 */

export interface Classic {
  title: string;
  author: string;
}

export interface Catalogue {
  name: string;
  /** The page a link opens when there is nothing to search for. */
  home: string;
  /** The site's own search page, with the query appended. */
  search: string;
  languages: string;
  about: string;
  /** A few books the site has, shown as covers that search for themselves. */
  classics: Classic[];
}

export const CATALOGUES: Catalogue[] = [
  {
    name: 'Standard Ebooks',
    home: 'https://standardebooks.org/ebooks',
    search: 'https://standardebooks.org/ebooks?query=',
    languages: 'English',
    about: 'Carefully typeset editions, proofread by volunteers. The best-looking EPUBs.',
    classics: [
      { title: 'Pride and Prejudice', author: 'Jane Austen' },
      { title: 'The Divine Comedy', author: 'Dante Alighieri' },
      { title: 'Moby-Dick', author: 'Herman Melville' },
      { title: 'Frankenstein', author: 'Mary Shelley' },
    ],
  },
  {
    name: 'Project Gutenberg',
    home: 'https://www.gutenberg.org/',
    search: 'https://www.gutenberg.org/ebooks/search/?query=',
    languages: 'Many languages',
    about: 'The oldest digital library, with tens of thousands of books. Choose “EPUB3”.',
    classics: [
      { title: 'Alice’s Adventures in Wonderland', author: 'Lewis Carroll' },
      { title: 'Don Quixote', author: 'Miguel de Cervantes' },
      { title: 'The Odyssey', author: 'Homer' },
      { title: 'Dracula', author: 'Bram Stoker' },
    ],
  },
  {
    name: 'Liber Liber',
    home: 'https://liberliber.it/',
    search: 'https://liberliber.it/?s=',
    languages: 'Italian',
    about: 'Italian classics from Progetto Manuzio, free to download as EPUB.',
    classics: [
      { title: 'I promessi sposi', author: 'Alessandro Manzoni' },
      { title: 'Le avventure di Pinocchio', author: 'Carlo Collodi' },
      { title: 'I Malavoglia', author: 'Giovanni Verga' },
      { title: 'Canti', author: 'Giacomo Leopardi' },
    ],
  },
  {
    name: 'Wikisource',
    home: 'https://en.wikisource.org/',
    search: 'https://en.wikisource.org/w/index.php?search=',
    languages: 'Many languages',
    about: 'Texts transcribed by volunteers. Each work has a “Download EPUB” link.',
    classics: [
      { title: 'The Prince', author: 'Niccolò Machiavelli' },
      { title: 'Meditations', author: 'Marcus Aurelius' },
      { title: 'Leaves of Grass', author: 'Walt Whitman' },
      { title: 'The Art of War', author: 'Sun Tzu' },
    ],
  },
];

/** Where a link to the catalogue goes: its search for the query, or its home page. */
export function catalogueHref(catalogue: Catalogue, query: string): string {
  const q = query.trim();
  return q ? catalogue.search + encodeURIComponent(q) : catalogue.home;
}

/** A handful of classics from every catalogue, for rooms that have no books of their own. */
export const SAMPLE: Classic[] = CATALOGUES.flatMap((catalogue) => catalogue.classics.slice(0, 1));
