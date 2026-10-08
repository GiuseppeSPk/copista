import { describe, expect, it } from 'vitest';
import { DrmProtectedError, NotAnEpubError } from '../../../src/core/errors';
import { errorMessage, megabytes, warningMessage } from '../../../src/ui/text';

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

describe('megabytes', () => {
  it('shows one decimal', () => {
    expect(megabytes(1048576 * 2.25)).toBe('2.3 MB');
    expect(megabytes(0)).toBe('0.0 MB');
  });
});
