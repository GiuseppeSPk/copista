import { zipSync, type Zippable } from 'fflate';
import { escapeXml } from '../epub/xhtml';
import type { Book } from '../model/book';
import { imageSize } from './image-size';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const EMU_PER_PIXEL = 9525; // 96 dpi
const MAX_WIDTH = 5486400; // 6 inches
const MAX_HEIGHT = 8229600; // 9 inches
const FALLBACK_SIZE = { width: 300, height: 200 };

/** Image types Word displays, with the extension each part gets. */
const DOCX_IMAGES: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const BULLET_NUM = 1;
const LEVELS = 9;
const INDENT = 720; // half an inch, in twentieths of a point

interface Format {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  vertAlign?: 'superscript' | 'subscript';
  code?: boolean;
  pre?: boolean;
}

type Run = { text: string; format: Format } | { br: true } | { drawing: string };

/** A list item's numbering; only the item's first paragraph shows the number. */
interface ListSlot {
  numId: number;
  level: number;
  used: boolean;
}

interface Block {
  style?: string;
  list?: ListSlot;
  indent: number;
}

const FORMATS: Record<string, Format> = {
  b: { bold: true },
  strong: { bold: true },
  i: { italic: true },
  em: { italic: true },
  cite: { italic: true },
  u: { underline: true },
  ins: { underline: true },
  s: { strike: true },
  strike: { strike: true },
  del: { strike: true },
  sup: { vertAlign: 'superscript' },
  sub: { vertAlign: 'subscript' },
  code: { code: true },
  kbd: { code: true },
  samp: { code: true },
  tt: { code: true },
};

const PARAGRAPHS = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'aside',
  'nav',
  'main',
  'figure',
  'figcaption',
  'address',
  'center',
  'details',
  'summary',
  'dl',
  'dt',
  'hgroup',
]);

const SKIPPED = new Set(['script', 'style', 'template', 'svg', 'head', 'title', 'noscript']);

function runProperties(format: Format): string {
  let props = '';
  if (format.code)
    props += '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>';
  if (format.bold) props += '<w:b/>';
  if (format.italic) props += '<w:i/>';
  if (format.strike) props += '<w:strike/>';
  if (format.underline) props += '<w:u w:val="single"/>';
  if (format.vertAlign) props += `<w:vertAlign w:val="${format.vertAlign}"/>`;
  return props === '' ? '' : `<w:rPr>${props}</w:rPr>`;
}

function runXml(run: Run): string {
  if ('br' in run) return '<w:r><w:br/></w:r>';
  if ('drawing' in run) return run.drawing;
  return `<w:r>${runProperties(run.format)}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
}

/** Collapses white space the way a browser lays out the same runs. */
function tidy(runs: Run[]): Run[] {
  const out: Run[] = [];
  let afterSpace = true;
  for (const run of runs) {
    if ('text' in run && !run.format.pre) {
      let text = run.text.replace(/\s+/g, ' ');
      if (afterSpace) text = text.replace(/^ /, '');
      if (text === '') continue;
      afterSpace = text.endsWith(' ');
      out.push({ ...run, text });
    } else {
      out.push(run);
      afterSpace = 'br' in run;
    }
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const run = out[i]!;
    if (!('text' in run) || run.format.pre) break;
    const text = run.text.replace(/ $/, '');
    if (text !== '') {
      out[i] = { ...run, text };
      break;
    }
    out.splice(i, 1);
  }
  return out;
}

function textOf(node: Node): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

interface Media {
  rId: string;
  path: string;
  data: Uint8Array;
}

class DocumentWriter {
  readonly paragraphs: string[] = [];
  readonly media = new Map<string, Media>();
  /** Start values of the ordered-list instances, from numId 2 on. */
  readonly orderedStarts: { level: number; start: number }[] = [];
  pageBreak = false;
  private runs: Run[] = [];
  private block: Block = { indent: 0 };
  private listDepth = 0;
  private orderedNum: number | undefined;
  private drawings = 0;

  constructor(private readonly book: Book) {}

  chapter(html: string): void {
    const template = document.createElement('template');
    template.innerHTML = html;
    this.children(template.content, {});
    this.flush();
  }

  private children(node: Node, format: Format): void {
    for (const child of node.childNodes) this.walk(child, format);
  }

  private walk(node: Node, format: Format): void {
    if (node.nodeType === Node.TEXT_NODE) {
      this.text(node.textContent ?? '', format);
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.localName;
    if (SKIPPED.has(tag)) return;
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      const level = Math.min(Number(heading[1]), 3);
      this.inBlock({ ...this.block, style: `Heading${level}` }, () => this.children(node, format));
    } else if (PARAGRAPHS.has(tag)) {
      this.inBlock(this.block, () => this.children(node, format));
    } else if (tag === 'blockquote' || tag === 'dd') {
      this.inBlock({ ...this.block, indent: this.block.indent + INDENT }, () =>
        this.children(node, format),
      );
    } else if (tag === 'pre') {
      this.inBlock(this.block, () => this.children(node, { ...format, code: true, pre: true }));
    } else if (tag === 'ul' || tag === 'ol') {
      this.list(node, format);
    } else if (tag === 'table') {
      this.table(node);
    } else if (tag === 'hr') {
      this.flush();
    } else if (tag === 'br') {
      this.runs.push({ br: true });
    } else if (tag === 'img') {
      this.image(node);
    } else {
      this.children(node, { ...format, ...FORMATS[tag] });
    }
  }

  private text(text: string, format: Format): void {
    if (!format.pre) {
      this.runs.push({ text, format });
      return;
    }
    text.split('\n').forEach((line, i) => {
      if (i > 0) this.runs.push({ br: true });
      if (line !== '') this.runs.push({ text: line, format });
    });
  }

  private inBlock(block: Block, fill: () => void): void {
    this.flush();
    const saved = this.block;
    this.block = block;
    fill();
    this.flush();
    this.block = saved;
  }

  private list(list: Element, format: Format): void {
    const level = Math.min(this.listDepth, LEVELS - 1);
    const ordered = list.localName === 'ol';
    let numId = BULLET_NUM;
    if (ordered) {
      if (this.orderedNum === undefined) {
        const start = Number.parseInt(list.getAttribute('start') ?? '', 10);
        this.orderedStarts.push({ level, start: Number.isFinite(start) ? start : 1 });
        numId = this.orderedStarts.length + 1;
      } else {
        numId = this.orderedNum;
      }
    }
    const savedOrdered = this.orderedNum;
    if (ordered) this.orderedNum = numId;
    this.listDepth++;
    for (const child of list.childNodes) {
      if (child instanceof Element && child.localName === 'li') {
        const item: Block = {
          style: 'ListParagraph',
          list: { numId, level, used: false },
          indent: this.block.indent,
        };
        this.inBlock(item, () => this.children(child, format));
      } else {
        this.walk(child, format);
      }
    }
    this.listDepth--;
    this.orderedNum = savedOrdered;
  }

  /** Tables become one paragraph per row (a documented limit), under their caption. */
  private table(table: Element): void {
    this.flush();
    const caption = table.querySelector(':scope > caption');
    if (caption) this.inBlock(this.block, () => this.children(caption, {}));
    const rows = table.querySelectorAll(
      ':scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr',
    );
    for (const row of rows) {
      const cells = [...row.querySelectorAll(':scope > td, :scope > th')].map(textOf);
      this.runs.push({ text: cells.join(' | '), format: {} });
      this.flush();
    }
  }

  private image(img: Element): void {
    const src = img.getAttribute('src') ?? '';
    const resource = this.book.resources.get(src);
    const extension = resource && DOCX_IMAGES[resource.mediaType];
    const alt = img.getAttribute('alt') ?? '';
    if (!resource || extension === undefined) {
      if (alt.trim() !== '') this.runs.push({ text: ` ${alt} `, format: {} });
      return;
    }
    let media = this.media.get(src);
    if (media === undefined) {
      const n = this.media.size + 1;
      media = { rId: `rId${n + 2}`, path: `media/image${n}.${extension}`, data: resource.data };
      this.media.set(src, media);
    }
    const size = imageSize(resource.data, resource.mediaType) ?? FALLBACK_SIZE;
    let cx = size.width * EMU_PER_PIXEL;
    let cy = size.height * EMU_PER_PIXEL;
    const scale = Math.min(1, MAX_WIDTH / cx, MAX_HEIGHT / cy);
    cx = Math.round(cx * scale);
    cy = Math.round(cy * scale);
    const id = ++this.drawings;
    const name = media.path.slice('media/'.length);
    this.runs.push({
      drawing:
        '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
        `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
        `<wp:docPr id="${id}" name="Picture ${id}" descr="${escapeXml(alt)}"/>` +
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill><a:blip r:embed="${media.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
        '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
    });
  }

  private flush(): void {
    const runs = tidy(this.runs);
    this.runs = [];
    if (!runs.some((run) => !('br' in run))) return;
    const { style, list, indent } = this.block;
    let props = style === undefined ? '' : `<w:pStyle w:val="${style}"/>`;
    if (list !== undefined && !list.used) {
      list.used = true;
      props += `<w:numPr><w:ilvl w:val="${list.level}"/><w:numId w:val="${list.numId}"/></w:numPr>`;
    } else if (list !== undefined) {
      props += `<w:ind w:left="${INDENT * (list.level + 1)}"/>`;
    } else if (indent > 0) {
      props += `<w:ind w:left="${indent}"/>`;
    }
    let body = props === '' ? '' : `<w:pPr>${props}</w:pPr>`;
    if (this.pageBreak) {
      body += '<w:r><w:br w:type="page"/></w:r>';
      this.pageBreak = false;
    }
    this.paragraphs.push(`<w:p>${body}${runs.map(runXml).join('')}</w:p>`);
  }
}

function headingStyle(level: number, size: number): string {
  return (
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/>` +
    '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
    `<w:pPr><w:keepNext/><w:spacing w:before="${600 - level * 120}" w:after="240"/>` +
    `<w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`
  );
}

function stylesXml(language: string): string {
  return (
    XML_DECLARATION +
    `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="24"/>` +
    `<w:lang w:val="${escapeXml(language)}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>` +
    '<w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    headingStyle(1, 36) +
    headingStyle(2, 30) +
    headingStyle(3, 26) +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/>' +
    '<w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>' +
    '</w:styles>'
  );
}

function abstractNum(id: number, level: (i: number) => { format: string; text: string }): string {
  let levels = '';
  for (let i = 0; i < LEVELS; i++) {
    const { format, text } = level(i);
    levels +=
      `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${format}"/>` +
      `<w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="${INDENT * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
  }
  return `<w:abstractNum w:abstractNumId="${id}">${levels}</w:abstractNum>`;
}

function numberingXml(orderedStarts: { level: number; start: number }[]): string {
  const bullets = ['•', '◦', '▪'];
  const formats = ['decimal', 'lowerLetter', 'lowerRoman'];
  const ordered = orderedStarts.map(
    ({ level, start }, i) =>
      `<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/>` +
      `<w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`,
  );
  return (
    XML_DECLARATION +
    `<w:numbering xmlns:w="${W}">` +
    abstractNum(0, (i) => ({ format: 'bullet', text: bullets[i % 3]! })) +
    abstractNum(1, (i) => ({ format: formats[i % 3]!, text: `%${i + 1}.` })) +
    `<w:num w:numId="${BULLET_NUM}"><w:abstractNumId w:val="0"/></w:num>` +
    ordered.join('') +
    '</w:numbering>'
  );
}

function coreXml(book: Book): string {
  const { title, authors, language } = book.meta;
  const creator =
    authors.length === 0 ? '' : `<dc:creator>${escapeXml(authors.join(', '))}</dc:creator>`;
  return (
    XML_DECLARATION +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<dc:title>${escapeXml(title)}</dc:title>${creator}<dc:language>${escapeXml(language)}</dc:language>` +
    '</cp:coreProperties>'
  );
}

function contentTypesXml(extensions: Set<string>): string {
  const main = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
  const defaults = [...extensions]
    .map((ext) => {
      const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return `<Default Extension="${ext}" ContentType="${type}"/>`;
    })
    .join('');
  return (
    XML_DECLARATION +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    defaults +
    `<Override PartName="/word/document.xml" ContentType="${main}.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="${main}.styles+xml"/>` +
    `<Override PartName="/word/numbering.xml" ContentType="${main}.numbering+xml"/>` +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>'
  );
}

function relationshipsXml(rels: { id: string; type: string; target: string }[]): string {
  const items = rels
    .map((rel) => `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${rel.target}"/>`)
    .join('');
  return `${XML_DECLARATION}<Relationships xmlns="${PKG_RELS}">${items}</Relationships>`;
}

/**
 * Writes a book as a Word document: headings 1–3, paragraphs, bold, italic,
 * lists, images and a page break before every chapter but the first. Tables
 * are flattened to one text row per paragraph, links to their text, and
 * images Word cannot show (SVG) to their alternative text.
 */
export function toDocx(book: Book): Uint8Array {
  const writer = new DocumentWriter(book);
  book.chapters.forEach((chapter, i) => {
    writer.pageBreak = i > 0;
    writer.chapter(chapter.html);
  });

  const body = writer.paragraphs.length === 0 ? '<w:p/>' : writer.paragraphs.join('');
  const documentXml =
    XML_DECLARATION +
    `<w:document xmlns:w="${W}" xmlns:r="${R}"` +
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<w:body>${body}</w:body></w:document>`;

  const media = [...writer.media.values()];
  const encode = (text: string) => new TextEncoder().encode(text);
  const files: Zippable = {
    '[Content_Types].xml': encode(
      contentTypesXml(new Set(media.map((m) => m.path.slice(m.path.lastIndexOf('.') + 1)))),
    ),
    '_rels/.rels': encode(
      relationshipsXml([
        { id: 'rId1', type: `${R}/officeDocument`, target: 'word/document.xml' },
        { id: 'rId2', type: `${PKG_RELS}/metadata/core-properties`, target: 'docProps/core.xml' },
      ]),
    ),
    'docProps/core.xml': encode(coreXml(book)),
    'word/document.xml': encode(documentXml),
    'word/styles.xml': encode(stylesXml(book.meta.language)),
    'word/numbering.xml': encode(numberingXml(writer.orderedStarts)),
    'word/_rels/document.xml.rels': encode(
      relationshipsXml([
        { id: 'rId1', type: `${R}/styles`, target: 'styles.xml' },
        { id: 'rId2', type: `${R}/numbering`, target: 'numbering.xml' },
        ...media.map((m) => ({ id: m.rId, type: `${R}/image`, target: m.path })),
      ]),
    ),
  };
  for (const m of media) files[`word/${m.path}`] = [m.data, { level: 0 }];
  return zipSync(files);
}
