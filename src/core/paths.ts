const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function directoryOf(file: string): string[] {
  const parts = file.split('/').filter((p) => p !== '');
  parts.pop();
  return parts;
}

/**
 * Resolves an href found in `baseFile` to a book key. Returns null for
 * external references (anything with a URL scheme).
 */
export function resolveHref(
  baseFile: string,
  href: string,
): { path: string; fragment?: string } | null {
  const trimmed = href.trim();
  if (EXTERNAL.test(trimmed)) return null;

  const hashAt = trimmed.indexOf('#');
  const beforeHash = hashAt >= 0 ? trimmed.slice(0, hashAt) : trimmed;
  const fragment = hashAt >= 0 ? decodeSegment(trimmed.slice(hashAt + 1)) : '';
  const queryAt = beforeHash.indexOf('?');
  const pathPart = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;

  let stack: string[];
  if (pathPart === '') {
    stack = baseFile.split('/').filter((p) => p !== '');
  } else {
    stack = pathPart.startsWith('/') ? [] : directoryOf(baseFile);
    for (const raw of pathPart.split('/')) {
      if (raw === '' || raw === '.') continue;
      if (raw === '..') stack.pop();
      else stack.push(decodeSegment(raw));
    }
  }

  const result: { path: string; fragment?: string } = { path: stack.join('/') };
  if (fragment !== '') result.fragment = fragment;
  return result;
}

/** A percent-encoded relative href from `fromFile` to the book key `toPath`. */
export function relativeHref(fromFile: string, toPath: string): string {
  const from = directoryOf(fromFile);
  const to = toPath.split('/').filter((p) => p !== '');
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
  const up = from.slice(shared).map(() => '..');
  return [...up, ...to.slice(shared).map(encodeURIComponent)].join('/');
}
