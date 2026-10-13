import { Marked, type Tokens } from 'marked';
import type { Book } from '../model/book';
import { bookFromSections, splitByHeading, type NewBookMeta } from './build';
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
        start: (src) => /^\[\^/m.exec(src)?.index,
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

/**
 * Converts a Markdown file to a book, split at its level-one headings (or
 * level-two when it has none). Metadata the caller leaves empty comes from
 * the front matter, then defaults to "Untitled" by "Unknown".
 */
export async function fromMarkdown(data: Uint8Array, meta: Partial<NewBookMeta>): Promise<Book> {
  const { fields, body } = parseFrontMatter(decodeText(data));
  const html = reader(body).parse(body);
  return bookFromSections(splitByHeading(html), {
    title: meta.title || fields['title'] || 'Untitled',
    author: meta.author || fields['author'] || 'Unknown',
    language: meta.language || fields['language'] || fields['lang'],
  });
}
