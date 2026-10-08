import { describe, expect, it } from 'vitest';
import {
  CopistaError,
  DrmProtectedError,
  MalformedBookError,
  NotAnEpubError,
  UnsupportedFormatError,
} from '../../../src/core/errors';

describe('typed errors', () => {
  it('carry their class name and data', () => {
    const e = new DrmProtectedError('adobe-adept');
    expect(e).toBeInstanceOf(CopistaError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('DrmProtectedError');
    expect(e.scheme).toBe('adobe-adept');
    expect(new UnsupportedFormatError('doc').format).toBe('doc');
    expect(new NotAnEpubError('x').name).toBe('NotAnEpubError');
    expect(new MalformedBookError('x').name).toBe('MalformedBookError');
  });
});
