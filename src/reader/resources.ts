import type { Book } from '../core/model/book';
import { mapCssUrls } from '../core/refs';
import { sanitizeCss } from '../core/sanitize';

/** Splits a book key into its path and its fragment (without the '#'). */
export function splitKey(key: string): { path: string; fragment: string } {
  const hash = key.indexOf('#');
  return hash < 0
    ? { path: key, fragment: '' }
    : { path: key.slice(0, hash), fragment: key.slice(hash + 1) };
}

/**
 * Hands out blob: URLs for a book's resources, one per resource. Stylesheets
 * are served with their url() and @import references rewritten to blob: URLs
 * too, so a chapter page never needs the book's own paths.
 */
export class ResourceUrls {
  private readonly urls = new Map<string, string>();
  /** Stylesheets being rewritten, so an @import cycle ends instead of recursing. */
  private readonly pending = new Set<string>();

  constructor(
    private readonly book: Book,
    private readonly create: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
    private readonly revoke: (url: string) => void = (url) => URL.revokeObjectURL(url),
  ) {}

  /** The blob: URL of a resource, or null when the key is not one. */
  urlFor(key: string): string | null {
    const cached = this.urls.get(key);
    if (cached !== undefined) return cached;
    const resource = this.book.resources.get(key);
    if (resource === undefined || this.pending.has(key)) return null;
    let blob: Blob;
    if (resource.mediaType === 'text/css') {
      this.pending.add(key);
      try {
        blob = new Blob([this.css(new TextDecoder().decode(resource.data))], { type: 'text/css' });
      } finally {
        this.pending.delete(key);
      }
    } else {
      blob = new Blob([resource.data as Uint8Array<ArrayBuffer>], { type: resource.mediaType });
    }
    const url = this.create(blob);
    this.urls.set(key, url);
    return url;
  }

  /** A reference written in a book file, as a blob: URL keeping its fragment. */
  refFor(ref: string): string | null {
    if (/^\s*data:/i.test(ref)) return ref;
    const { path, fragment } = splitKey(ref);
    const url = this.urlFor(path);
    return url === null || fragment === '' ? url : `${url}#${fragment}`;
  }

  /** Makes a stylesheet safe and points its references at blob: URLs. */
  css(text: string): string {
    return mapCssUrls(sanitizeCss(text), (ref) => this.refFor(ref));
  }

  /** Revokes every URL handed out; the object can be used again afterwards. */
  dispose(): void {
    for (const url of this.urls.values()) this.revoke(url);
    this.urls.clear();
  }
}
