/**
 * Rewrites markup EPUB 3 content documents may not hold. HTML4 presentation
 * becomes the inline CSS a browser renders it as; obsolete elements become
 * their HTML5 counterparts; prefixes the written document does not declare
 * are dropped. Only elements in the XHTML namespace are touched.
 */
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/** The one epub:type vocabulary besides the default that the writer declares. */
export const Z3998_PREFIX = 'z3998: http://www.daisy.org/z3998/2012/vocab/structure/#';

const LENGTH = /^\d+(\.\d+)?%?$/;
const PIXELS = /^\d+$/;
const COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]+)$/i;
const FONT_FAMILY = /^[\w ,-]+$/;
const XML_NAME = /^[A-Za-z_][\w.-]*$/;
/** Elements whose width and height attributes are valid when they are pixel counts. */
const SIZED = new Set(['img', 'video', 'canvas', 'iframe', 'embed', 'object', 'input', 'source']);
const PREFIXED_ATTRIBUTES = new Set(['epub:type', 'xml:lang', 'xml:space']);
const LIST_TYPES: Record<string, string> = {
  disc: 'disc',
  circle: 'circle',
  square: 'square',
  '1': 'decimal',
  a: 'lower-alpha',
  A: 'upper-alpha',
  i: 'lower-roman',
  I: 'upper-roman',
};
/** Obsolete elements, the element that replaces each, and the CSS that keeps its look. */
const ELEMENTS: Record<string, [tag: string, css: string]> = {
  center: ['div', 'text-align: center'],
  font: ['span', ''],
  big: ['span', 'font-size: larger'],
  tt: ['span', 'font-family: monospace'],
  strike: ['s', ''],
  acronym: ['abbr', ''],
  dir: ['ul', ''],
  nobr: ['span', 'white-space: nowrap'],
  blink: ['span', ''],
  marquee: ['span', ''],
};
const EMPTY_OBSOLETE = new Set(['basefont', 'spacer']);
/** Obsolete attributes with no CSS equivalent worth keeping. */
const DROPPED = new Set([
  'summary',
  'cellpadding',
  'frame',
  'rules',
  'axis',
  'char',
  'charoff',
  'compact',
  'noshade',
  'longdesc',
  'lowsrc',
  'background',
  'bordercolor',
]);

function oneOf(value: string, allowed: string[], css: (v: string) => string): string {
  return allowed.includes(value) ? css(value) : '';
}

function alignment(tag: string, value: string): string {
  if (SIZED.has(tag)) {
    if (value === 'left' || value === 'right') return `float: ${value}`;
    return oneOf(value, ['top', 'middle', 'bottom'], (v) => `vertical-align: ${v}`);
  }
  if (tag === 'table') {
    if (value === 'center') return 'margin-left: auto; margin-right: auto';
    return oneOf(value, ['left', 'right'], (v) => `float: ${v}`);
  }
  return oneOf(value, ['left', 'right', 'center', 'justify'], (v) => `text-align: ${v}`);
}

/**
 * What an attribute becomes: undefined keeps it, a string removes it and is
 * the CSS that replaces it, empty when nothing does.
 */
function translate(tag: string, parent: string, name: string, raw: string): string | undefined {
  const value = raw.trim();
  const lower = value.toLowerCase();
  const pixels = (property: string) => (PIXELS.test(value) ? property.replaceAll('#', value) : '');
  switch (name) {
    case 'align':
      return alignment(tag, lower);
    case 'valign':
      return oneOf(lower, ['top', 'middle', 'bottom', 'baseline'], (v) => `vertical-align: ${v}`);
    case 'bgcolor':
      return COLOR.test(value) ? `background-color: ${value}` : '';
    case 'width':
    case 'height':
      if (SIZED.has(tag) && PIXELS.test(value)) return undefined;
      return LENGTH.test(value) ? `${name}: ${value.endsWith('%') ? value : `${value}px`}` : '';
    case 'nowrap':
      return 'white-space: nowrap';
    case 'hspace':
      return pixels('margin-left: #px; margin-right: #px');
    case 'vspace':
      return pixels('margin-top: #px; margin-bottom: #px');
    case 'cellspacing':
      return pixels('border-spacing: #px');
    case 'clear':
      if (lower === 'all' || lower === 'both') return 'clear: both';
      return oneOf(lower, ['left', 'right'], (v) => `clear: ${v}`);
    case 'color':
      if (tag !== 'font') return undefined;
      return COLOR.test(value) ? `color: ${value}` : '';
    case 'face':
      if (tag !== 'font') return undefined;
      return FONT_FAMILY.test(value) ? `font-family: ${value}` : '';
    case 'size':
      return tag === 'font' || tag === 'hr' ? '' : undefined;
    case 'type': {
      if (tag !== 'ul' && tag !== 'li') return undefined;
      const type = LIST_TYPES[value] ?? LIST_TYPES[lower];
      return type === undefined ? '' : `list-style-type: ${type}`;
    }
    case 'value':
      return tag === 'li' && parent !== 'ol' ? '' : undefined;
    case 'abbr':
    case 'scope':
      return tag === 'td' ? '' : undefined;
    case 'name':
      return tag === 'img' ? '' : undefined;
    case 'border':
      if (tag === 'img') return value === '0' ? '' : pixels('border: #px solid');
      if (tag === 'table') return value === '' || value === '1' ? undefined : '';
      return undefined;
    default:
      return DROPPED.has(name) ? '' : undefined;
  }
}

function isAllowedAttribute(name: string): boolean {
  if (PREFIXED_ATTRIBUTES.has(name)) return true;
  return XML_NAME.test(name);
}

function keptTypes(type: string): string {
  return type
    .split(/\s+/)
    .filter((t) => t !== '' && (!t.includes(':') || t.startsWith('z3998:')))
    .join(' ');
}

/**
 * Makes one element valid HTML5 for an EPUB 3 content document. Returns the
 * element that takes its place, or null when it was removed or unwrapped.
 */
export function toHtml5(element: Element): Element | null {
  if (element.namespaceURI !== XHTML_NS) return element;
  const tag = element.localName;
  if (tag.includes(':')) {
    element.replaceWith(...element.childNodes);
    return null;
  }
  if (EMPTY_OBSOLETE.has(tag)) {
    element.remove();
    return null;
  }
  const css: string[] = [];
  const border = tag === 'table' ? element.getAttribute('border')?.trim() : undefined;
  for (const { name, value } of [...element.attributes]) {
    if (!isAllowedAttribute(name)) {
      element.removeAttribute(name);
      continue;
    }
    const declaration = translate(tag, element.parentElement?.localName ?? '', name, value);
    if (declaration === undefined) continue;
    element.removeAttribute(name);
    if (declaration !== '') css.push(declaration);
  }
  // HTML5 allows only border="" or border="1" on a table; any other width becomes "1".
  if (border !== undefined && /^[1-9]\d*$/.test(border)) element.setAttribute('border', '1');
  const type = element.getAttribute('epub:type');
  if (type !== null) {
    const kept = keptTypes(type);
    if (kept === '') element.removeAttribute('epub:type');
    else element.setAttribute('epub:type', kept);
  }
  const replacement = ELEMENTS[tag];
  if (replacement !== undefined && replacement[1] !== '') css.unshift(replacement[1]);
  if (css.length > 0) {
    const style = element.getAttribute('style');
    element.setAttribute('style', [...css, ...(style === null ? [] : [style])].join('; '));
  }
  if (replacement === undefined) return element;
  const next = element.ownerDocument.createElement(replacement[0]);
  for (const { name, value } of element.attributes) next.setAttribute(name, value);
  next.append(...element.childNodes);
  element.replaceWith(next);
  return next;
}
