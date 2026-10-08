import type { Chapter, TocEntry } from '../model/book';
import { resolveHref } from '../paths';
import { parseXhtml, parseXml } from './xml';

const OPS_NS = 'http://www.idpf.org/2007/ops';

function collapse(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function childrenNamed(parent: Element, name: string): Element[] {
  return [...parent.children].filter((child) => child.localName.toLowerCase() === name);
}

/** An entry for a link, or null when the link points at no chapter. */
function entry(
  label: string,
  href: string | null,
  base: string,
  chapterIndex: Map<string, number>,
  children: TocEntry[],
): TocEntry | null {
  if (label === '' || href === null) return null;
  const target = resolveHref(base, href);
  const chapter = target === null ? undefined : chapterIndex.get(target.path);
  if (target === null || chapter === undefined) return null;
  const result: TocEntry = { label, chapter, children };
  if (target.fragment !== undefined && target.fragment !== '') result.fragment = target.fragment;
  return result;
}

function navItems(list: Element, base: string, chapterIndex: Map<string, number>): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const li of childrenNamed(list, 'li')) {
    const children = childrenNamed(li, 'ol').flatMap((ol) => navItems(ol, base, chapterIndex));
    const link = [...li.children].find((c) => ['a', 'span'].includes(c.localName.toLowerCase()));
    const href = link?.localName.toLowerCase() === 'a' ? link.getAttribute('href') : null;
    const own =
      link === undefined
        ? null
        : entry(collapse(link.textContent), href, base, chapterIndex, children);
    if (own === null) entries.push(...children);
    else entries.push(own);
  }
  return entries;
}

function isTocNav(nav: Element): boolean {
  const type = nav.getAttributeNS(OPS_NS, 'type') ?? nav.getAttribute('epub:type') ?? '';
  return type.split(/\s+/).includes('toc');
}

/** Reads the `toc` nav of an EPUB 3 navigation document. */
export function parseNav(
  xhtml: string,
  navPath: string,
  chapterIndex: Map<string, number>,
): TocEntry[] {
  const { doc } = parseXhtml(xhtml);
  const nav = [...doc.getElementsByTagNameNS('*', 'nav')].find(isTocNav);
  if (nav === undefined) return [];
  return childrenNamed(nav, 'ol').flatMap((ol) => navItems(ol, navPath, chapterIndex));
}

function navPoints(parent: Element, base: string, chapterIndex: Map<string, number>): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const point of childrenNamed(parent, 'navpoint')) {
    const children = navPoints(point, base, chapterIndex);
    const text = childrenNamed(point, 'navlabel').flatMap((l) => childrenNamed(l, 'text'))[0];
    const src = childrenNamed(point, 'content')[0]?.getAttribute('src') ?? null;
    const own = entry(collapse(text?.textContent), src, base, chapterIndex, children);
    if (own === null) entries.push(...children);
    else entries.push(own);
  }
  return entries;
}

/** Reads the navMap of an EPUB 2 NCX. */
export function parseNcx(
  xml: string,
  ncxPath: string,
  chapterIndex: Map<string, number>,
): TocEntry[] {
  const doc = parseXml(xml);
  const navMap = doc?.getElementsByTagNameNS('*', 'navMap')[0];
  return navMap === undefined ? [] : navPoints(navMap, ncxPath, chapterIndex);
}

/** Text of the first h1–h3 of a chapter's HTML, or undefined. */
export function firstHeading(html: string): string | undefined {
  const template = document.createElement('template');
  template.innerHTML = html;
  const label = collapse(template.content.querySelector('h1, h2, h3')?.textContent);
  return label === '' ? undefined : label;
}

/** One entry per chapter, named after its first heading. */
export function tocFromHeadings(chapters: Chapter[]): TocEntry[] {
  return chapters.map((c, i) => ({
    label: firstHeading(c.html) ?? `Section ${i + 1}`,
    chapter: i,
    children: [],
  }));
}

/** The label of the first entry, at any depth, that points at each chapter with no fragment. */
export function titlesFromToc(toc: TocEntry[]): Map<number, string> {
  const titles = new Map<number, string>();
  const visit = (entries: TocEntry[]): void => {
    for (const e of entries) {
      if (e.fragment === undefined && !titles.has(e.chapter)) titles.set(e.chapter, e.label);
      visit(e.children);
    }
  };
  visit(toc);
  return titles;
}
