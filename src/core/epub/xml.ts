export const XHTML_NS = 'http://www.w3.org/1999/xhtml';

const XML_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);
const entityCache = new Map<string, string | null>();

function hasParserError(doc: Document): boolean {
  return doc.getElementsByTagName('parsererror').length > 0;
}

/** Parses an XML document. Returns null when it is not well-formed. */
export function parseXml(text: string): Document | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  return hasParserError(doc) ? null : doc;
}

/** The numeric character references for an HTML named entity, or null if HTML does not know it. */
function numericEntity(name: string): string | null {
  const cached = entityCache.get(name);
  if (cached !== undefined) return cached;
  const template = document.createElement('template');
  template.innerHTML = `&${name};`;
  const text = template.content.textContent ?? '';
  const result =
    text === `&${name};` ? null : [...text].map((c) => `&#${c.codePointAt(0)};`).join('');
  entityCache.set(name, result);
  return result;
}

/**
 * XHTML 1.1 books use HTML named entities (&eacute;, &nbsp;) that an XML
 * parser rejects without the DTD. They become numeric references first.
 */
function replaceNamedEntities(text: string): string {
  return text.replace(/&([A-Za-z][A-Za-z0-9]*);/g, (match, name: string) =>
    XML_ENTITIES.has(name) ? match : (numericEntity(name) ?? match),
  );
}

/**
 * Parses a content document as XHTML. When it is not well-formed XML, it is
 * parsed again with the HTML parser and `fallback` is true. A document whose
 * root is not in the XHTML namespace also goes through the HTML parser, so
 * that its elements serialize as HTML.
 */
export function parseXhtml(text: string): { doc: Document; fallback: boolean } {
  const xml = new DOMParser().parseFromString(replaceNamedEntities(text), 'application/xhtml+xml');
  const wellFormed = !hasParserError(xml);
  if (wellFormed && xml.documentElement.namespaceURI === XHTML_NS) {
    return { doc: xml, fallback: false };
  }
  return { doc: new DOMParser().parseFromString(text, 'text/html'), fallback: !wellFormed };
}

/** The children of a document's body, serialized as HTML. */
export function bodyHtml(doc: Document): string {
  const body = doc.getElementsByTagNameNS(XHTML_NS, 'body')[0] ?? doc.documentElement;
  const template = document.createElement('template');
  for (const child of body.childNodes) template.content.append(document.importNode(child, true));
  return template.innerHTML;
}
