/**
 * Hand-written WordprocessingML packages, written from ECMA-376 (Office Open
 * XML), Part 1 and Part 2.
 */
import { buildZip, type ZipFile } from './zip-builder';

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  officeRel: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
};

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export function paragraph(runs: string, style?: string, numbering?: { numId: number }): string {
  const props: string[] = [];
  if (style) props.push(`<w:pStyle w:val="${style}"/>`);
  if (numbering)
    props.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numbering.numId}"/></w:numPr>`);
  return `<w:p>${props.length ? `<w:pPr>${props.join('')}</w:pPr>` : ''}${runs}</w:p>`;
}

export function run(
  text: string,
  format: { bold?: boolean; italic?: boolean; underline?: boolean } = {},
): string {
  const props =
    (format.bold ? '<w:b/>' : '') +
    (format.italic ? '<w:i/>' : '') +
    (format.underline ? '<w:u w:val="single"/>' : '');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

/** A footnote mark, raised as Word raises it; the note goes in DocxOptions.footnotes. */
export function footnoteRef(id: number): string {
  return `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
}

/** An inline picture run; sizes in EMU (914400 per inch). */
export function picture(relId: string, cx: number, cy: number, descr: string): string {
  return (
    '<w:r><w:drawing>' +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="1" name="Picture 1" descr="${descr}"/>` +
    `<a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${NS.pic}">` +
    `<pic:pic xmlns:pic="${NS.pic}">` +
    '<pic:nvPicPr><pic:cNvPr id="0" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    '</pic:pic></a:graphicData></a:graphic></wp:inline>' +
    '</w:drawing></w:r>'
  );
}

export function table(rows: string[][]): string {
  const body = rows
    .map(
      (cells) => `<w:tr>${cells.map((c) => `<w:tc>${paragraph(run(c))}</w:tc>`).join('')}</w:tr>`,
    )
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${body}</w:tbl>`;
}

const STYLES =
  XML +
  `<w:styles xmlns:w="${NS.w}">` +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
  '<w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/>' +
  '<w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/>' +
  '<w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="IntenseQuote"><w:name w:val="Intense Quote"/>' +
  '<w:basedOn w:val="Normal"/></w:style>' +
  '</w:styles>\n';

/** numId 1 is a bullet list, numId 2 a decimal list. */
const NUMBERING =
  XML +
  `<w:numbering xmlns:w="${NS.w}">` +
  '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/>' +
  '<w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>' +
  '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/>' +
  '<w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
  '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>' +
  '</w:numbering>\n';

export interface DocxOptions {
  /** Paragraphs, tables and so on inside <w:body>. */
  body: string;
  title?: string;
  creator?: string;
  /** PNG images by relationship id; each is stored as word/media/<id>.png. */
  images?: Record<string, Uint8Array>;
  /** Footnote paragraphs by id, stored in word/footnotes.xml. */
  footnotes?: Record<number, string>;
}

export function docxZip(options: DocxOptions): Uint8Array {
  const images = Object.entries(options.images ?? {});
  const footnotes = Object.entries(options.footnotes ?? {});
  const core =
    XML +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">' +
    (options.title !== undefined ? `<dc:title>${options.title}</dc:title>` : '') +
    (options.creator !== undefined ? `<dc:creator>${options.creator}</dc:creator>` : '') +
    '</cp:coreProperties>\n';
  const contentTypes =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    (footnotes.length
      ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'
      : '') +
    '</Types>\n';
  const rootRels =
    XML +
    `<Relationships xmlns="${NS.rel}">` +
    `<Relationship Id="rId1" Type="${NS.officeRel}/officeDocument" Target="word/document.xml"/>` +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '</Relationships>\n';
  const documentRels =
    XML +
    `<Relationships xmlns="${NS.rel}">` +
    `<Relationship Id="rIdStyles" Type="${NS.officeRel}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rIdNumbering" Type="${NS.officeRel}/numbering" Target="numbering.xml"/>` +
    images
      .map(
        ([id]) =>
          `<Relationship Id="${id}" Type="${NS.officeRel}/image" Target="media/${id}.png"/>`,
      )
      .join('') +
    (footnotes.length
      ? `<Relationship Id="rIdFootnotes" Type="${NS.officeRel}/footnotes" Target="footnotes.xml"/>`
      : '') +
    '</Relationships>\n';
  const footnotesXml =
    XML +
    `<w:footnotes xmlns:w="${NS.w}">` +
    footnotes.map(([id, body]) => `<w:footnote w:id="${id}">${body}</w:footnote>`).join('') +
    '</w:footnotes>\n';
  const document =
    XML +
    `<w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}">` +
    `<w:body>${options.body}</w:body></w:document>\n`;

  const files: ZipFile[] = [
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: documentRels },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: NUMBERING },
    ...images.map(([id, data]) => ({ name: `word/media/${id}.png`, data })),
    ...(footnotes.length ? [{ name: 'word/footnotes.xml', data: footnotesXml }] : []),
  ];
  return buildZip(files);
}
