import DOMPurify from 'dompurify';
import { mapCssUrls } from './refs';

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

const RESOURCE_ATTRIBUTES = new Set(['src', 'srcset', 'poster', 'xlink:href']);
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

const BLOCKED_IMPORT = /@import\s+url\("about:invalid"\)[^;]*;?/gi;
const SCRIPTED_DECLARATION =
  /(?:-moz-binding|behavior)\s*:[^;}]*;?|[-\w]+\s*:[^;{}]*expression\s*\([^;}]*;?/gi;

/**
 * Makes a stylesheet or a style attribute safe to render: imports from outside
 * the book are dropped, other external url() values become about:invalid, and
 * declarations that could run script in old engines are removed.
 */
export function sanitizeCss(css: string): string {
  return mapCssUrls(css, internalCssRef)
    .replace(BLOCKED_IMPORT, '')
    .replace(SCRIPTED_DECLARATION, '')
    .replace(/expression\s*\(|-moz-binding|behavior\s*:/gi, '');
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
    ADD_ATTR: ['epub:type'],
  });
}
