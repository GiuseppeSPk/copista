import { marked } from 'marked';
import type { Book } from '../model/book';
import { bookFromSections, splitByHeading, type NewBookMeta } from './build';
import { decodeText } from './decode';

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
  const html = await marked.parse(body, { gfm: true });
  return bookFromSections(splitByHeading(html), {
    title: meta.title || fields['title'] || 'Untitled',
    author: meta.author || fields['author'] || 'Unknown',
    language: meta.language || fields['language'] || fields['lang'],
  });
}
