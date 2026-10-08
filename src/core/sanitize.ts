import DOMPurify from 'dompurify';
import { mapCssUrls, unescapeCss } from './refs';

const FORBID_TAGS = [
  'script',
  'style',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'iframe',
  'frame',
  'object',
  'embed',
];

const RESOURCE_ATTRIBUTES = new Set(['src', 'srcset', 'poster', 'xlink:href', 'background']);
const LINK_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * The scheme of a reference, lower-cased, '//' for a protocol-relative one,
 * or null for a reference inside the book. Whitespace and control characters
 * are dropped first, as browsers do when they parse a URL.
 */
function schemeOf(ref: string): string | null {
  // eslint-disable-next-line no-control-regex
  const compact = ref.replace(/[\u0000- ]/g, '');
  if (/^[\\/]{2}/.test(compact)) return '//';
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  return match?.[1]?.toLowerCase() ?? null;
}

function isInlineImage(ref: string): boolean {
  return /^\s*data:image\//i.test(ref);
}

function isAllowedResource(ref: string): boolean {
  return schemeOf(ref) === null || isInlineImage(ref);
}

function isAllowedSrcset(value: string): boolean {
  return value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
    .every((url) => url === '' || isAllowedResource(url));
}

function isAllowedLink(ref: string): boolean {
  const scheme = schemeOf(ref);
  return scheme === null || LINK_SCHEMES.has(scheme);
}

/** Keeps book keys and data: URLs; anything that would reach the network is not. */
function internalCssRef(ref: string): string | null {
  const scheme = schemeOf(ref);
  return scheme === null || scheme === 'data' ? ref : null;
}

const FETCHING_SCHEMES = new Set(['//', 'http', 'https', 'ftp', 'ws', 'wss', 'file']);

/** A string that names another site, as image-set() and src() may use one. */
function isRemoteString(value: string): boolean {
  const scheme = schemeOf(value);
  return scheme !== null && FETCHING_SCHEMES.has(scheme);
}

/** Comments, strings and escapes: the tokens that can hide a url() or an @import. */
const CSS_HIDING =
  /\/\*[\s\S]*?(?:\*\/|$)|"((?:[^"\\\n]|\\[\s\S])*)"?|'((?:[^'\\\n]|\\[\s\S])*)'?|\\([0-9a-f]{1,6})[ \t\n\r\f]?|\\([^\n])/gi;

/**
 * Drops comments and decodes escapes that spell a letter, digit, '-' or '_'
 * outside strings, so that `@\69mport` or `\75 rl(` read as what the browser sees.
 */
function normalizeCss(css: string): string {
  return css.replace(
    CSS_HIDING,
    (token, _dq?: string, _sq?: string, hex?: string, char?: string) => {
      if (token.startsWith('/*')) return ' ';
      const code = hex === undefined ? undefined : parseInt(hex, 16);
      const decoded =
        code === undefined ? char : code <= 0x10ffff ? String.fromCodePoint(code) : '';
      return decoded !== undefined && /^[\w-]$/.test(decoded) ? decoded : token;
    },
  );
}

function blockRemoteStrings(css: string): string {
  return css.replace(CSS_HIDING, (token, dq?: string, sq?: string) => {
    const body = dq ?? sq;
    return body !== undefined && isRemoteString(unescapeCss(body)) ? '"about:invalid"' : token;
  });
}

// The removals below never cross a quote or a backslash, so strings stay strings.
const BLOCKED_IMPORT = /@import\s*url\("about:invalid"\)[^;{}"'\\]*;?/gi;
const SCRIPTED_DECLARATION =
  /(?:-moz-binding|behavior)\s*:[^;}"'\\]*;?|[-\w]+\s*:[^;{}"'\\]*expression\s*\([^;}"'\\]*;?/gi;

function sanitizeCssOnce(css: string): string {
  const mapped = mapCssUrls(normalizeCss(css), internalCssRef).replace(BLOCKED_IMPORT, '');
  return blockRemoteStrings(mapped)
    .replace(SCRIPTED_DECLARATION, '')
    .replace(/expression\s*\(|-moz-binding|behavior\s*:/gi, ' ');
}

const MAX_CSS_PASSES = 8;

/**
 * Makes a stylesheet or a style attribute safe to render: imports from outside
 * the book are dropped, other external url() values and remote strings become
 * about:invalid, and declarations that could run script in old engines are
 * removed. A removal can join two pieces into a new reference, so the passes
 * repeat until nothing changes; a stylesheet that never settles is dropped.
 */
export function sanitizeCss(css: string): string {
  let current = css;
  for (let pass = 0; pass < MAX_CSS_PASSES; pass++) {
    const next = sanitizeCssOnce(current);
    if (next === current) return next;
    current = next;
  }
  return '';
}

let purifier: ReturnType<typeof DOMPurify> | undefined;

function getPurifier(): ReturnType<typeof DOMPurify> {
  if (purifier !== undefined) return purifier;
  const instance = DOMPurify(window);
  instance.addHook('uponSanitizeAttribute', (node, data) => {
    const name = data.attrName;
    const value = data.attrValue;
    if (name === 'style') {
      data.attrValue = sanitizeCss(value);
    } else if (name === 'srcset') {
      data.keepAttr = isAllowedSrcset(value);
    } else if (name === 'href' && node.nodeName.toLowerCase() === 'a') {
      data.keepAttr = isAllowedLink(value);
    } else if (RESOURCE_ATTRIBUTES.has(name) || name === 'href') {
      data.keepAttr = isAllowedResource(value);
    } else if (/url\(|image-set\(/i.test(normalizeCss(value))) {
      // SVG presentation attributes such as fill, filter and mask take CSS values.
      data.attrValue = sanitizeCss(value);
    }
  });
  purifier = instance;
  return instance;
}

/**
 * Removes scripts, forms, embedded frames and every reference that would reach
 * the network from a chapter body. Internal references must already be book keys.
 */
export function sanitizeHtml(html: string): string {
  return getPurifier().sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR: ['action', 'formaction'],
    // hspace and vspace carry only image margins; the EPUB writer turns them into CSS.
    ADD_ATTR: ['epub:type', 'hspace', 'vspace'],
  });
}
