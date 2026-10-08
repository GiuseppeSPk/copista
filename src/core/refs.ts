/**
 * Rewrites every reference in a fragment of HTML or CSS. The mapper receives
 * the raw reference as written; returning null drops it.
 */
export type RefMapper = (ref: string) => string | null;

const URL_ATTRIBUTES = ['src', 'href', 'xlink:href', 'poster'];

function mapSrcset(value: string, map: RefMapper): string {
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate !== '')
    .flatMap((candidate) => {
      const [url = '', ...descriptors] = candidate.split(/\s+/);
      const mapped = map(url);
      return mapped === null ? [] : [[mapped, ...descriptors].join(' ')];
    })
    .join(', ');
}

/** Applies `map` to src, href, xlink:href, poster and srcset in an HTML fragment. */
export function mapHtmlRefs(html: string, map: RefMapper): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const element of template.content.querySelectorAll('*')) {
    for (const name of URL_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value === null) continue;
      const mapped = map(value);
      if (mapped === null) element.removeAttribute(name);
      else element.setAttribute(name, mapped);
    }
    const srcset = element.getAttribute('srcset');
    if (srcset !== null) {
      const mapped = mapSrcset(srcset, map);
      if (mapped === '') element.removeAttribute('srcset');
      else element.setAttribute('srcset', mapped);
    }
  }
  return template.innerHTML;
}

const CSS_REF =
  /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi;

function cssUrl(ref: string, map: RefMapper): string {
  const mapped = map(ref) ?? 'about:invalid';
  return `url("${mapped.replace(/["\\\n]/g, (c) => (c === '\n' ? '\\a ' : '\\' + c))}")`;
}

/** Applies `map` to every url() and @import string in a stylesheet. */
export function mapCssUrls(css: string, map: RefMapper): string {
  return css.replace(
    CSS_REF,
    (match, dq?: string, sq?: string, bare?: string, importDq?: string, importSq?: string) => {
      const importRef = importDq ?? importSq;
      if (importRef !== undefined) return `@import ${cssUrl(importRef, map)}`;
      const ref = dq ?? sq ?? bare;
      return ref === undefined ? match : cssUrl(ref, map);
    },
  );
}
