/**
 * Libraries that give away books whose copyright has ended. Copista only links to them: the
 * link opens their site in a new tab, the reader downloads the EPUB there and drops it here.
 * Nothing is fetched from these sites, so the content security policy stays as it is.
 */

export interface Classic {
  title: string;
  author: string;
  /** The book's own page in the catalogue, checked by hand, where the EPUB is one click away. */
  href: string;
}

export interface Catalogue {
  name: string;
  /** The page a link opens when there is nothing to search for. */
  home: string;
  /** The site's own search page, with the query appended. */
  search: string;
  languages: string;
  about: string;
  /** A few books the site has, shown as covers that open their page. */
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
      {
        title: 'Pride and Prejudice',
        author: 'Jane Austen',
        href: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice',
      },
      {
        title: 'The Divine Comedy',
        author: 'Dante Alighieri',
        href: 'https://standardebooks.org/ebooks/dante-alighieri/the-divine-comedy/henry-wadsworth-longfellow',
      },
      {
        title: 'Moby-Dick',
        author: 'Herman Melville',
        href: 'https://standardebooks.org/ebooks/herman-melville/moby-dick',
      },
      {
        title: 'Frankenstein',
        author: 'Mary Shelley',
        href: 'https://standardebooks.org/ebooks/mary-shelley/frankenstein',
      },
    ],
  },
  {
    name: 'Project Gutenberg',
    home: 'https://www.gutenberg.org/',
    search: 'https://www.gutenberg.org/ebooks/search/?query=',
    languages: 'Many languages',
    about:
      'The oldest digital library, with tens of thousands of books. Choose “EPUB3”. Some Italian internet providers block it.',
    classics: [
      {
        title: 'Alice’s Adventures in Wonderland',
        author: 'Lewis Carroll',
        href: 'https://www.gutenberg.org/ebooks/11',
      },
      {
        title: 'Don Quixote',
        author: 'Miguel de Cervantes',
        href: 'https://www.gutenberg.org/ebooks/996',
      },
      { title: 'The Odyssey', author: 'Homer', href: 'https://www.gutenberg.org/ebooks/1727' },
      { title: 'Dracula', author: 'Bram Stoker', href: 'https://www.gutenberg.org/ebooks/345' },
    ],
  },
  {
    name: 'Liber Liber',
    home: 'https://liberliber.it/',
    search: 'https://liberliber.it/?s=',
    languages: 'Italian',
    about: 'Italian classics from Progetto Manuzio, free to download as EPUB.',
    classics: [
      {
        title: 'I promessi sposi',
        author: 'Alessandro Manzoni',
        href: 'https://liberliber.it/autori/autori-m/alessandro-francesco-tommaso-manzoni/i-promessi-sposi-edizione-a-mondadori-1985/',
      },
      {
        title: 'Le avventure di Pinocchio',
        author: 'Carlo Collodi',
        href: 'https://liberliber.it/autori/autori-c/carlo-collodi-alias-carlo-lorenzini/pinocchio/',
      },
      {
        title: 'I Malavoglia',
        author: 'Giovanni Verga',
        href: 'https://liberliber.it/autori/autori-v/giovanni-verga/i-malavoglia/',
      },
      {
        title: 'Canti',
        author: 'Giacomo Leopardi',
        href: 'https://liberliber.it/autori/autori-l/giacomo-leopardi/canti/',
      },
    ],
  },
  {
    name: 'Wikisource',
    home: 'https://en.wikisource.org/',
    search: 'https://en.wikisource.org/w/index.php?search=',
    languages: 'Many languages',
    about: 'Texts transcribed by volunteers. Each work has a “Download EPUB” link.',
    classics: [
      {
        title: 'The Prince',
        author: 'Niccolò Machiavelli',
        href: 'https://en.wikisource.org/wiki/The_Prince_(Marriott)',
      },
      {
        title: 'Meditations',
        author: 'Marcus Aurelius',
        href: 'https://en.wikisource.org/wiki/The_Thoughts_of_the_Emperor_Marcus_Aurelius_Antoninus',
      },
      {
        title: 'Leaves of Grass',
        author: 'Walt Whitman',
        href: 'https://en.wikisource.org/wiki/Leaves_of_Grass_(1855)',
      },
      {
        title: 'The Art of War',
        author: 'Sun Tzu',
        href: 'https://en.wikisource.org/wiki/The_Art_of_War_(Giles)',
      },
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
