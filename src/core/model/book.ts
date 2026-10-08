/**
 * The internal model every input becomes and every output starts from.
 *
 * Every internal reference stored here (chapter hrefs, attributes in
 * Chapter.html, url() in CSS) is a book key: a normalized, percent-decoded zip
 * path with no leading slash, optionally followed by "#fragment".
 */

export type BookWarning =
  | 'fixed-layout'
  | 'obfuscated-fonts-ignored'
  | 'toc-generated'
  | 'html-fallback'
  | 'missing-resource';

export interface BookMeta {
  title: string;
  authors: string[];
  language: string;
  identifier: string;
  layout: 'reflowable' | 'pre-paginated';
}

export interface Chapter {
  id: string;
  /** Book key of the chapter file. */
  href: string;
  title?: string;
  /** The body's inner HTML, serialized as HTML. */
  html: string;
  /** Book keys of linked stylesheets, in document order. */
  stylesheets: string[];
  /** Text of the chapter's own <style> elements. */
  inlineCss: string;
}

export interface TocEntry {
  label: string;
  /** Index into Book.chapters. */
  chapter: number;
  fragment?: string;
  children: TocEntry[];
}

export interface Resource {
  href: string;
  mediaType: string;
  data: Uint8Array;
}

export interface Book {
  meta: BookMeta;
  chapters: Chapter[];
  toc: TocEntry[];
  /** Keyed by book key. */
  resources: Map<string, Resource>;
  /** Book key of the cover image, when there is one. */
  cover?: string;
  warnings: BookWarning[];
}
