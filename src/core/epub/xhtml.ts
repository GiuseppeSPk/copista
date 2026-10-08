/**
 * Serializes an HTML fragment as XHTML: void elements self-close, entities
 * become characters, and every element is in the XHTML namespace by
 * inheritance from the document root it is written into.
 */
export function htmlToXhtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  const body = new XMLSerializer().serializeToString(doc.body);
  const open = body.indexOf('>');
  if (body[open - 1] === '/') return '';
  return stripNonXmlChars(body.slice(open + 1, body.lastIndexOf('</body>')));
}

/** Removes characters XML 1.0 does not allow: C0 controls, lone surrogates, U+FFFE and U+FFFF. */
const NON_XML_CHARS = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]' +
    '|[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]',
  'g',
);

function stripNonXmlChars(text: string): string {
  return text.replace(NON_XML_CHARS, '');
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escapes text for use in XML content and in double-quoted attributes. */
export function escapeXml(text: string): string {
  return stripNonXmlChars(text).replace(/[&<>"]/g, (c) => ESCAPES[c]!);
}
