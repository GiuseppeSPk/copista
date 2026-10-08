export type DrmScheme = 'adobe-adept' | 'apple-fairplay' | 'unknown-encryption';

/** Base class of every error the engine reports to the user. */
export class CopistaError extends Error {
  // Names are set explicitly so they survive minification.
  override name = 'CopistaError';
}

export class NotAnEpubError extends CopistaError {
  override name = 'NotAnEpubError';
}

export class DrmProtectedError extends CopistaError {
  override name = 'DrmProtectedError';
  readonly scheme: DrmScheme;

  constructor(scheme: DrmScheme, message = 'This book is protected by DRM and cannot be opened.') {
    super(message);
    this.scheme = scheme;
  }
}

export class MalformedBookError extends CopistaError {
  override name = 'MalformedBookError';
}

export class UnsupportedFormatError extends CopistaError {
  override name = 'UnsupportedFormatError';
  readonly format: string;

  constructor(format: string, message = `Files of type "${format}" are not supported.`) {
    super(message);
    this.format = format;
  }
}
