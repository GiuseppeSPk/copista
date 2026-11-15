import { CopistaError } from '../core/errors';
import type { BookWarning } from '../core/model/book';
import type { OutputFormat } from '../rooms/scriptorium';

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  epub: 'EPUB',
  docx: 'Word',
  md: 'Markdown',
  txt: 'Text',
  html: 'Web page',
  pdf: 'PDF (print)',
};

const WARNINGS: Record<BookWarning, string> = {
  'fixed-layout': 'This is a fixed-layout book: pages may not look as the publisher designed them.',
  'obfuscated-fonts-ignored': 'Some embedded fonts are scrambled and were left out.',
  'toc-generated': 'The book has no table of contents, so one was made from its chapters.',
  'html-fallback': 'Some chapters were not valid XHTML and were read as plain HTML.',
  'missing-resource': 'Some images or files the book refers to are missing.',
};

export function warningMessage(warning: BookWarning): string {
  return WARNINGS[warning];
}

/** A sentence for the reader. Engine errors already carry one. */
export function errorMessage(error: unknown): string {
  if (error instanceof CopistaError) return error.message;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'This browser has no space left for the library. Remove a book and try again.';
  }
  const detail = error instanceof Error ? error.message : String(error);
  return `Something went wrong: ${detail}`;
}

/** One line for several books added at once: how many, and the first few titles. */
export function addedSummary(titles: string[]): string {
  const named = titles.slice(0, 3).map((title) => `“${title}”`);
  const more = titles.length - named.length;
  const list = more > 0 ? `${named.join(', ')} and ${more} more` : named.join(', ');
  return `${titles.length} added: ${list}.`;
}

/** What a book's card says of how far it has been read; nothing for a book not begun. */
export function readSoFar(percent: number | undefined): string {
  if (percent === undefined) return '';
  const whole = Math.round(percent);
  if (whole <= 0) return '';
  return whole >= 100 ? 'Finished' : `${whole}% read`;
}

/** A size in megabytes, or in gigabytes from 1 GB up, where megabytes run to five figures. */
export function megabytes(bytes: number): string {
  const mb = bytes / 1048576;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 1 : 0)} GB`;
}

/** How the voice runs on this device, once loaded, and how fast it has made what it read. */
export interface Engine {
  backend: 'webgpu' | 'wasm' | 'fake';
  threads: number;
  steps: number;
  /** The seconds of speech made so far, and the seconds it took to make them. */
  made: number;
  took: number;
}

/** The engine in a line, so a reader who hears gaps can say how the voice runs on the device. */
export function describeEngine(engine: Engine): string {
  const on =
    engine.backend === 'webgpu'
      ? 'Graphics chip'
      : `Processor, ${engine.threads} ${engine.threads === 1 ? 'thread' : 'threads'}`;
  const line = `${on}, ${engine.steps} steps`;
  if (engine.made === 0) return line;
  return `${line}. One second of speech takes ${(engine.took / engine.made).toFixed(2)} s to make.`;
}
