import { Marked, type Tokens } from 'marked';
import type { Book, Resource } from '../model/book';
import {
  bookFromSections,
  IMAGE_EXTENSIONS,
  splitByHeading,
  titleFromFileName,
  type NewBookMeta,
} from './build';
import { decodeText } from './decode';

const NOTE_LABELS = /^\[\^([^\]\s]+)\]:/gm;
/** A note: `[^label]: text`, with any further lines indented. */
const NOTE = /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n(?: {2,}|\t)[^\n]*)*)(?:\n|$)/;
const NOTE_REF = /^\[\^([^\]\s]+)\]/;

interface NoteToken extends Tokens.Generic {
  label: string;
  tokens: Tokens.Generic[];
}

interface NoteRefToken extends Tokens.Generic {
  n: number;
  first: boolean;
}

/**
 * A Markdown reader for one document. GitHub-style footnotes become numbered
 * references and a list of notes at the end, linked both ways as Word notes
 * are; task list boxes become ☐ and ☑, since a book cannot hold a form.
 */
function reader(body: string): { parse: (md: string) => string } {
  const defined = new Set([...body.matchAll(NOTE_LABELS)].map((m) => m[1]!));
  const numbers = new Map<string, number>();
  const notes = new Map<string, string>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      checkbox: ({ checked }) => (checked ? '☑ ' : '☐ '),
    },
    extensions: [
      {
        name: 'note',
        level: 'block',
        // Only the paragraph at hand can run into a note; a long book's notes come at its
        // end, and seeking them from every paragraph took minutes.
        start: (src) => {
          const end = src.indexOf('\n\n');
          return /^\[\^/m.exec(end === -1 ? src : src.slice(0, end))?.index;
        },
        tokenizer(src) {
          const match = NOTE.exec(src);
          if (match === null) return undefined;
          const text = match[2]!.replace(/\n(?: {2,}|\t)/g, '\n').trim();
          return {
            type: 'note',
            raw: match[0],
            label: match[1]!,
            tokens: this.lexer.inlineTokens(text),
          };
        },
        renderer(token) {
          const note = token as NoteToken;
          notes.set(note.label, this.parser.parseInline(note.tokens));
          return '';
        },
      },
      {
        name: 'noteRef',
        level: 'inline',
        start: (src) => src.indexOf('[^'),
        tokenizer(src) {
          const match = NOTE_REF.exec(src);
          if (match === null || !defined.has(match[1]!)) return undefined;
          const first = !numbers.has(match[1]!);
          if (first) numbers.set(match[1]!, numbers.size + 1);
          return { type: 'noteRef', raw: match[0], n: numbers.get(match[1]!)!, first };
        },
        renderer(token) {
          const { n, first } = token as NoteRefToken;
          const id = first ? ` id="footnote-ref-${n}"` : '';
          return `<sup><a href="#footnote-${n}"${id}>[${n}]</a></sup>`;
        },
      },
    ],
  });
  return {
    parse(md) {
      const html = marked.parse(md, { async: false });
      const referenced = new Set(numbers.keys());
      // Notes nothing points to still print, numbered after the others.
      for (const label of notes.keys())
        if (!numbers.has(label)) numbers.set(label, numbers.size + 1);
      const items = [...numbers]
        .filter(([label]) => notes.has(label))
        .map(([label, n]) => {
          const back = referenced.has(label) ? ` <a href="#footnote-ref-${n}">↑</a>` : '';
          return `<li id="footnote-${n}"><p>${notes.get(label)!}${back}</p></li>`;
        });
      return items.length === 0 ? html : `${html}<ol class="footnotes">${items.join('')}</ol>`;
    },
  };
}

/** Reads a leading `---` block of `key: value` lines; anything else is body. */
export function parseFrontMatter(md: string): { fields: Record<string, string>; body: string } {
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(md);
  if (match === null) return { fields: {}, body: md };
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, '$2');
    if (key !== '' && value !== '') fields[key] = value;
  }
  return { fields, body: md.slice(match[0].length) };
}

/** A picture chosen with a Markdown file, which shows it by its file name. */
export interface Picture {
  name: string;
  data: Uint8Array;
}

const PICTURE_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

function imagesOf(html: string): { root: DocumentFragment; images: HTMLImageElement[] } {
  const template = document.createElement('template');
  template.innerHTML = html;
  return { root: template.content, images: [...template.content.querySelectorAll('img')] };
}

/**
 * The file name a relative image source ends in; null for sources with a
 * scheme or a host, which carry or fetch their own data.
 */
function pictureName(src: string): string | null {
  const path = src.trim().replace(/[?#].*$/s, '');
  if (/^[a-z][a-z0-9+.-]+:|^\/\//i.test(path)) return null;
  let name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  try {
    name = decodeURIComponent(name);
  } catch {
    // Kept as written.
  }
  return name === '' ? null : name;
}

/** The file names of the pictures a Markdown file shows by a relative path, each once. */
export function picturesNamed(data: Uint8Array): string[] {
  const { body } = parseFrontMatter(decodeText(data));
  const names = new Map<string, string>();
  for (const img of imagesOf(reader(body).parse(body)).images) {
    const name = pictureName(img.getAttribute('src') ?? '');
    if (name !== null && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return [...names.values()];
}

/**
 * Points each relative image at the chosen picture with the same file name,
 * ignoring case and folders, and adds that picture to the book's resources.
 * Images without a picture are left for the book builder to drop.
 */
function attachPictures(
  html: string,
  pictures: Picture[],
  resources: Map<string, Resource>,
): string {
  const byName = new Map<string, { picture: Picture; mediaType: string }>();
  for (const picture of pictures) {
    const mediaType = PICTURE_TYPES[picture.name.split('.').pop()!.toLowerCase()];
    if (mediaType !== undefined) byName.set(picture.name.toLowerCase(), { picture, mediaType });
  }
  if (byName.size === 0) return html;
  const keys = new Map<Picture, string>();
  const { root, images } = imagesOf(html);
  for (const img of images) {
    const name = pictureName(img.getAttribute('src') ?? '');
    const found = name === null ? undefined : byName.get(name.toLowerCase());
    if (found === undefined) continue;
    let key = keys.get(found.picture);
    if (key === undefined) {
      const extension = IMAGE_EXTENSIONS[found.mediaType]!;
      key = `images/pic${String(keys.size + 1).padStart(3, '0')}.${extension}`;
      resources.set(key, { href: key, mediaType: found.mediaType, data: found.picture.data });
      keys.set(found.picture, key);
    }
    img.setAttribute('src', key);
  }
  const container = document.createElement('div');
  container.append(root);
  return container.innerHTML;
}

/** The text of the document's level-one heading when it has exactly one, which names it. */
function soleTitle(html: string): string {
  const headings = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('h1');
  return headings.length === 1 ? (headings[0]!.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
}

/**
 * Converts a Markdown file to a book, split at its level-one headings (or
 * level-two when it has none). Metadata the caller leaves empty comes from
 * the front matter; the title then from a level-one heading that is the only
 * one, then the file name, then "Untitled"; the author defaults to
 * "Unknown". Relative images show the pictures chosen with the file; the
 * others are left out.
 */
export async function fromMarkdown(
  data: Uint8Array,
  meta: Partial<NewBookMeta>,
  pictures: Picture[] = [],
  opts: { fileName?: string } = {},
): Promise<Book> {
  const { fields, body } = parseFrontMatter(decodeText(data));
  const resources = new Map<string, Resource>();
  const html = attachPictures(reader(body).parse(body), pictures, resources);
  return bookFromSections(
    splitByHeading(html),
    {
      title:
        meta.title ||
        fields['title'] ||
        soleTitle(html) ||
        titleFromFileName(opts.fileName) ||
        'Untitled',
      author: meta.author || fields['author'] || 'Unknown',
      language: meta.language || fields['language'] || fields['lang'],
    },
    resources,
  );
}
