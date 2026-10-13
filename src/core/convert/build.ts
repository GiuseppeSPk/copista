import type { Book, Chapter, Resource, TocEntry } from '../model/book';
import { sanitizeHtml } from '../sanitize';
import { guessLanguage } from './language';

export interface NewBookMeta {
  title: string;
  author: string;
  language?: string;
}

export interface Section {
  title?: string;
  html: string;
}

/** Image types every reading system must support, by data: URL media type. */
export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

/** The stylesheet every book Copista makes carries, in the reader's colours whatever the theme. */
export const BOOK_CSS_KEY = 'styles/book.css';
const BOOK_CSS = `table { border-collapse: collapse; margin: 1em 0; max-width: 100%; }
th, td { border: 1px solid currentColor; padding: 0.3em 0.6em; text-align: left; vertical-align: top; }
td > p, th > p { margin: 0; }
pre { padding: 0.6em 0.8em; border-radius: 4px; background: rgba(128, 128, 128, 0.15);
  white-space: pre-wrap; overflow-wrap: break-word; }
code { font-family: monospace; font-size: 0.92em; }
:not(pre) > code { padding: 0 0.2em; border-radius: 3px; background: rgba(128, 128, 128, 0.15); }
blockquote { margin: 1em 1.5em; padding-left: 0.8em; border-left: 3px solid rgba(128, 128, 128, 0.5); }
img { max-width: 100%; height: auto; }
p.title { font-size: 1.8em; font-weight: bold; text-align: center; margin: 1.5em 0 0.5em; }
p.subtitle { font-size: 1.2em; font-style: italic; text-align: center; margin: 0 0 1.5em; }
p.author { font-size: 1.2em; text-align: center; margin: 0 0 2em; }
h2.notes { margin-top: 2em; }
ol.notes, ol.footnotes { font-size: 0.9em; }
`;

/** The heading put over the notes gathered at the end, by language. */
const NOTES_HEADING: Record<string, string> = {
  en: 'Notes',
  it: 'Note',
  fr: 'Notes',
  es: 'Notas',
  de: 'Anmerkungen',
};

/** A file name without its folder and last extension, to name a book that carries no title. */
export function titleFromFileName(fileName: string | undefined): string {
  return (fileName ?? '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]*$/, '')
    .trim();
}

function fragmentOf(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

function serialize(nodes: Node[]): string {
  const container = document.createElement('div');
  for (const node of nodes) container.append(node);
  return container.innerHTML;
}

function textOf(node: Node): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function hasContent(nodes: Node[]): boolean {
  return nodes.some(
    (node) =>
      textOf(node) !== '' ||
      (node instanceof Element && (node.matches('img, svg') || node.querySelector('img, svg'))),
  );
}

/**
 * Splits a document at its top-level h1 headings, or at its h2 headings when
 * it has no h1. Each heading opens its section and names it; content before
 * the first heading becomes an untitled section when it shows anything.
 */
export function splitByHeading(html: string): Section[] {
  const nodes = [...fragmentOf(html).childNodes];
  const isHeading = (tag: string) => (node: Node) =>
    node instanceof Element && node.localName === tag;
  const level = ['h1', 'h2'].find((tag) => nodes.some(isHeading(tag)));
  if (level === undefined) return [{ html: serialize(nodes) }];

  const sections: Section[] = [];
  let current: { title?: string; nodes: Node[] } = { nodes: [] };
  const close = () => {
    if (current.title !== undefined || hasContent(current.nodes)) {
      sections.push({ title: current.title, html: serialize(current.nodes) });
    }
  };
  for (const node of nodes) {
    if (isHeading(level)(node)) {
      close();
      current = { title: textOf(node), nodes: [node] };
    } else {
      current.nodes.push(node);
    }
  }
  close();
  return sections;
}

function decodeDataUrl(url: string): { mediaType: string; data: Uint8Array } | null {
  const match = /^data:([^;,]+)((?:;[^;,]*)*?)(;base64)?,(.*)$/is.exec(url.trim());
  if (match === null) return null;
  const mediaType = match[1]!.toLowerCase();
  const payload = match[4]!;
  try {
    if (match[3] !== undefined) {
      const binary = atob(payload.replace(/\s+/g, ''));
      return { mediaType, data: Uint8Array.from(binary, (c) => c.charCodeAt(0)) };
    }
    return { mediaType, data: new TextEncoder().encode(decodeURIComponent(payload)) };
  } catch {
    return null;
  }
}

/**
 * Moves inline images into the book's resources and drops images that point
 * nowhere: the sanitizer already removed the sources that would reach the
 * network, and a relative source must name a resource the book carries.
 */
function settleImages(
  html: string,
  resources: Map<string, Resource>,
  inlined: Map<string, string>,
): string {
  const fragment = fragmentOf(html);
  for (const img of fragment.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '';
    if (/^\s*data:/i.test(src)) {
      let key = inlined.get(src);
      if (key === undefined) {
        const decoded = decodeDataUrl(src);
        const extension = decoded && IMAGE_EXTENSIONS[decoded.mediaType];
        if (!decoded || extension === undefined) {
          img.remove();
          continue;
        }
        key = `images/img${String(inlined.size + 1).padStart(3, '0')}.${extension}`;
        resources.set(key, { href: key, mediaType: decoded.mediaType, data: decoded.data });
        inlined.set(src, key);
      }
      img.setAttribute('src', key);
    } else if (!resources.has(src)) {
      img.remove();
    }
  }
  return serialize([...fragment.childNodes]);
}

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/**
 * Splitting a document scatters its anchors: a "#id" link keeps working only
 * if it names the chapter that now holds the id. Links to ids that no
 * chapter holds are left alone.
 */
function linkFragments(chapters: Chapter[]): void {
  const owners = new Map<string, string>();
  const fragments = chapters.map((chapter) => fragmentOf(chapter.html));
  fragments.forEach((fragment, i) => {
    for (const element of fragment.querySelectorAll('[id]')) {
      if (!owners.has(element.id)) owners.set(element.id, chapters[i]!.href);
    }
  });
  fragments.forEach((fragment, i) => {
    let changed = false;
    for (const link of fragment.querySelectorAll('a[href^="#"]')) {
      const id = decodeFragment(link.getAttribute('href')!.slice(1));
      const owner = owners.get(id);
      if (owner === undefined) continue;
      link.setAttribute('href', `${owner}#${id}`);
      changed = true;
    }
    if (changed) chapters[i]!.html = serialize([...fragment.childNodes]);
  });
}

/**
 * Puts a heading over a list of notes (Markdown footnotes, Word footnotes and
 * endnotes) unless one is already there.
 */
function headNotes(html: string, language: string): string {
  const fragment = fragmentOf(html);
  let changed = false;
  for (const list of [...fragment.children].filter((e) => e.localName === 'ol')) {
    const first = list.firstElementChild;
    if (first?.localName !== 'li' || !/^(?:footnote|endnote)-\d+$/.test(first.id)) continue;
    if (/^h[1-6]$/.test(list.previousElementSibling?.localName ?? '')) continue;
    const heading = document.createElement('h2');
    heading.className = 'notes';
    heading.textContent = NOTES_HEADING[language.slice(0, 2).toLowerCase()] ?? 'Notes';
    list.before(heading);
    list.classList.add('notes');
    changed = true;
  }
  return changed ? serialize([...fragment.childNodes]) : html;
}

/**
 * Builds a reflowable book with one chapter per section. Section HTML is
 * sanitized; chapters are `text/c001.xhtml`, `text/c002.xhtml`, … and an
 * untitled section takes the book's title. Without a language, the text's
 * own is guessed, then English assumed. Each chapter links the book's own
 * stylesheet, which draws table borders and code boxes, and notes gathered
 * at the end get a heading.
 */
export function bookFromSections(
  sections: Section[],
  meta: NewBookMeta,
  resources: Map<string, Resource> = new Map(),
): Book {
  const inlined = new Map<string, string>();
  const chapters: Chapter[] = sections.map((section, i) => {
    const id = `c${String(i + 1).padStart(3, '0')}`;
    return {
      id,
      href: `text/${id}.xhtml`,
      title: section.title || meta.title,
      html: settleImages(sanitizeHtml(section.html), resources, inlined),
      stylesheets: [BOOK_CSS_KEY],
      inlineCss: '',
    };
  });
  const language = meta.language || guessLanguage(chapters.map((c) => c.html).join(' ')) || 'en';
  for (const chapter of chapters) chapter.html = headNotes(chapter.html, language);
  resources.set(BOOK_CSS_KEY, {
    href: BOOK_CSS_KEY,
    mediaType: 'text/css',
    data: new TextEncoder().encode(BOOK_CSS),
  });
  linkFragments(chapters);
  const toc: TocEntry[] = chapters.map((chapter, i) => ({
    label: chapter.title ?? meta.title,
    chapter: i,
    children: [],
  }));
  return {
    meta: {
      title: meta.title,
      authors: meta.author === '' ? [] : [meta.author],
      language,
      identifier: `urn:uuid:${crypto.randomUUID()}`,
      layout: 'reflowable',
    },
    chapters,
    toc,
    resources,
    warnings: [],
  };
}
