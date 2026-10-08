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

const CSS_ESCAPE = String.raw`\\(?:[0-9a-fA-F]{1,6}[ \t\n\r\f]?|[^\n])`;
const CSS_DQ = String.raw`"((?:[^"\\\n]|\\[\s\S])*)"?`;
const CSS_SQ = String.raw`'((?:[^'\\\n]|\\[\s\S])*)'?`;
const CSS_BARE = String.raw`((?:[^)"'\s\\]|${CSS_ESCAPE})*)`;

/**
 * url() and @import references, plus the comments, strings and escapes that
 * are matched whole so that nothing inside them is taken for a reference.
 * A missing closing quote or parenthesis is accepted, as browsers accept it at
 * the end of a stylesheet.
 */
const CSS_REF = new RegExp(
  String.raw`url\(\s*(?:${CSS_DQ}|${CSS_SQ}|${CSS_BARE})\s*\)?|@import\s*(?:${CSS_DQ}|${CSS_SQ})` +
    String.raw`|\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?|${CSS_ESCAPE}`,
  'gi',
);

/** Decodes the backslash escapes of a CSS string or url() value. */
export function unescapeCss(value: string): string {
  return value.replace(
    /\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\n\r\f])?|(\n)|([\s\S]))/gi,
    (_, hex?: string, newline?: string, char?: string) => {
      if (newline !== undefined) return '';
      if (char !== undefined) return char;
      const code = parseInt(hex!, 16);
      return code === 0 || code > 0x10ffff ? '�' : String.fromCodePoint(code);
    },
  );
}

function cssUrl(ref: string, map: RefMapper): string {
  const mapped = map(ref) ?? 'about:invalid';
  return `url("${mapped.replace(/["\\\n]/g, (c) => (c === '\n' ? '\\a ' : '\\' + c))}")`;
}

/**
 * Applies `map` to every url() and @import string in a stylesheet. The mapper
 * receives the reference with its escapes decoded.
 */
export function mapCssUrls(css: string, map: RefMapper): string {
  return css.replace(
    CSS_REF,
    (match, dq?: string, sq?: string, bare?: string, importDq?: string, importSq?: string) => {
      const importRef = importDq ?? importSq;
      if (importRef !== undefined) return `@import ${cssUrl(unescapeCss(importRef), map)}`;
      const ref = dq ?? sq ?? bare;
      return ref === undefined ? match : cssUrl(unescapeCss(ref), map);
    },
  );
}
