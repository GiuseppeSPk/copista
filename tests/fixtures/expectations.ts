import type { BookWarning } from '../../src/core/model/book';
import type { EpubFixture } from './catalog';

export type ReadExpectation =
  | { error: string }
  | { title: string; chapters: number; tocLabels: string[]; warnings: BookWarning[] };

/** What `readEpub` returns for each fixture; shared by the jsdom and browser tests. */
export const READ_EXPECTATIONS: Record<EpubFixture, ReadExpectation> = {
  epub3Nav: {
    title: 'Fixture Three',
    chapters: 3,
    tocLabels: ['Chapter One', 'Chapter Two', 'Chapter Three'],
    warnings: [],
  },
  epub2Ncx: {
    title: 'Fixture Two',
    chapters: 2,
    tocLabels: ['First Chapter', 'Second Chapter'],
    warnings: [],
  },
  epub2Entities: { title: 'Entities', chapters: 1, tocLabels: ['Only'], warnings: [] },
  noToc: {
    title: 'No Contents',
    chapters: 2,
    tocLabels: ['Opening', 'Section 2'],
    warnings: ['toc-generated'],
  },
  oddNames: {
    title: 'Odd Names',
    chapters: 2,
    tocLabels: ['Capítulo 1', 'Fifty percent'],
    warnings: [],
  },
  noCover: { title: 'No Cover', chapters: 1, tocLabels: ['Chapter 1'], warnings: [] },
  noTitle: { title: 'Untitled', chapters: 1, tocLabels: ['Chapter 1'], warnings: [] },
  fontObfuscation: {
    title: 'Simple Fixture',
    chapters: 1,
    tocLabels: ['Chapter 1'],
    warnings: ['obfuscated-fonts-ignored'],
  },
  drmEncryption: { error: 'DrmProtectedError' },
  drmAdept: { error: 'DrmProtectedError' },
  drmFairplay: { error: 'DrmProtectedError' },
  malicious: { title: 'Malicious', chapters: 1, tocLabels: ['Only'], warnings: [] },
  fixedLayout: {
    title: 'Fixed Layout',
    chapters: 1,
    tocLabels: ['Chapter 1'],
    warnings: ['fixed-layout'],
  },
  brokenXhtml: { title: 'Broken', chapters: 1, tocLabels: ['Broken'], warnings: ['html-fallback'] },
  missingFiles: {
    title: 'Missing Files',
    chapters: 1,
    tocLabels: ['One'],
    warnings: ['missing-resource'],
  },
  emptySpine: { error: 'MalformedBookError' },
  noContainer: {
    title: 'No Container',
    chapters: 1,
    tocLabels: ['Section 1'],
    warnings: ['toc-generated'],
  },
  zipNotEpub: { error: 'NotAnEpubError' },
  longChapter: { title: 'Long Chapter', chapters: 1, tocLabels: ['Long'], warnings: [] },
};

/** The parts of a book an expectation checks, in a form that crosses `page.evaluate`. */
export type ReadOutcome =
  { error: string } | { title: string; chapters: number; tocLabels: string[]; warnings: string[] };

export function outcomeOf(book: {
  meta: { title: string };
  chapters: unknown[];
  toc: { label: string }[];
  warnings: string[];
}): ReadOutcome {
  return {
    title: book.meta.title,
    chapters: book.chapters.length,
    tocLabels: book.toc.map((e) => e.label),
    warnings: [...book.warnings].sort(),
  };
}

/** The expectation with its warnings sorted, to compare with an outcome. */
export function normalized(expectation: ReadExpectation): ReadOutcome {
  return 'error' in expectation
    ? expectation
    : { ...expectation, warnings: [...expectation.warnings].sort() };
}
