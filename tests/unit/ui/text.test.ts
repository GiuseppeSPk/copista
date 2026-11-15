import { describe, expect, it } from 'vitest';
import { DrmProtectedError, NotAnEpubError } from '../../../src/core/errors';
import {
  addedSummary,
  describeEngine,
  errorMessage,
  megabytes,
  readSoFar,
  warningMessage,
} from '../../../src/ui/text';

describe('errorMessage', () => {
  it('passes on the engine messages, which are written for the reader', () => {
    expect(errorMessage(new DrmProtectedError('adobe-adept'))).toBe(
      'This book is protected by DRM and cannot be opened.',
    );
    expect(errorMessage(new NotAnEpubError('Not an EPUB.'))).toBe('Not an EPUB.');
  });

  it('wraps unexpected errors', () => {
    expect(errorMessage(new TypeError('x is undefined'))).toBe(
      'Something went wrong: x is undefined',
    );
    expect(errorMessage('boom')).toBe('Something went wrong: boom');
  });

  it('explains a full device', () => {
    const full = new DOMException('quota', 'QuotaExceededError');
    expect(errorMessage(full)).toMatch(/space/);
  });
});

describe('warningMessage', () => {
  it('has a sentence for every warning', () => {
    for (const w of [
      'fixed-layout',
      'obfuscated-fonts-ignored',
      'toc-generated',
      'html-fallback',
      'missing-resource',
    ] as const) {
      expect(warningMessage(w)).toMatch(/^[A-Z].*\.$/);
    }
  });
});

describe('addedSummary', () => {
  it('names up to three books and counts the rest', () => {
    expect(addedSummary(['A', 'B', 'C'])).toBe('3 added: “A”, “B”, “C”.');
    expect(addedSummary(['A', 'B', 'C', 'D', 'E'])).toBe('5 added: “A”, “B”, “C” and 2 more.');
  });
});

describe('megabytes', () => {
  it('shows one decimal', () => {
    expect(megabytes(1048576 * 2.25)).toBe('2.3 MB');
    expect(megabytes(0)).toBe('0.0 MB');
  });

  it('counts in gigabytes from 1 GB up', () => {
    expect(megabytes(1048576 * 1023.9)).toBe('1023.9 MB');
    expect(megabytes(1048576 * 1024 * 1.5)).toBe('1.5 GB');
    expect(megabytes(1048576 * 10240.1)).toBe('10 GB');
  });
});

describe('describeEngine', () => {
  it('names where the voice runs, and how fast once it has read', () => {
    const wasm = { backend: 'wasm' as const, threads: 4, steps: 8, made: 0, took: 0 };
    expect(describeEngine(wasm)).toBe('Processor, 4 threads, 8 steps');
    expect(describeEngine({ ...wasm, threads: 1, made: 10, took: 13 })).toBe(
      'Processor, 1 thread, 8 steps. One second of speech takes 1.30 s to make.',
    );
    expect(describeEngine({ ...wasm, backend: 'webgpu', steps: 16 })).toBe(
      'Graphics chip, 16 steps',
    );
  });
});

describe('readSoFar', () => {
  it('says nothing of a book not begun', () => {
    expect(readSoFar(undefined)).toBe('');
    expect(readSoFar(0)).toBe('');
    expect(readSoFar(0.4)).toBe('');
  });

  it('gives the whole percent, and says when the book is finished', () => {
    expect(readSoFar(0.6)).toBe('1% read');
    expect(readSoFar(34.4)).toBe('34% read');
    expect(readSoFar(99.4)).toBe('99% read');
    expect(readSoFar(99.5)).toBe('Finished');
    expect(readSoFar(100)).toBe('Finished');
  });
});
