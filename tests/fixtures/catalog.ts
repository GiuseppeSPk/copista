/**
 * Every generated fixture. Later tests assert the values written here, so
 * change them only together with those tests.
 */
import { docxZip, paragraph, picture, run, table } from './docx-builder';
import {
  encryption,
  epubZip,
  nav,
  ncx,
  opf,
  xhtml,
  XHTML_11_DOCTYPE,
  type ManifestItem,
  type OpfOptions,
  type TocPoint,
} from './epub-builder';
import { makePng, PNG_SIGNATURE } from './png';
import { buildZip } from './zip-builder';

export type EpubFixture =
  | 'epub3Nav'
  | 'epub2Ncx'
  | 'epub2Entities'
  | 'noToc'
  | 'oddNames'
  | 'noCover'
  | 'noTitle'
  | 'fontObfuscation'
  | 'drmEncryption'
  | 'drmAdept'
  | 'drmFairplay'
  | 'malicious'
  | 'fixedLayout'
  | 'brokenXhtml'
  | 'missingFiles'
  | 'emptySpine'
  | 'noContainer'
  | 'zipNotEpub'
  | 'longChapter';

const XHTML_TYPE = 'application/xhtml+xml';
const OPF = 'OEBPS/content.opf';

function para(text: string): string {
  return `<p>${text}</p>`;
}

const FILLER = [
  'The scribe trimmed the quill and began again at the top of the page.',
  'Rain moved across the cloister roof while the lamp burned low.',
];

function chapterItem(n: number, dir = 'text/'): ManifestItem {
  return { id: `ch${n}`, href: `${dir}ch${n}.xhtml`, mediaType: XHTML_TYPE };
}

const NAV_ITEM: ManifestItem = {
  id: 'nav',
  href: 'nav.xhtml',
  mediaType: XHTML_TYPE,
  properties: 'nav',
};

/** A small valid EPUB 3 with `count` chapters, plus extra files and package options. */
function simpleEpub3(
  count: number,
  extra: {
    files?: Record<string, string | Uint8Array>;
    items?: ManifestItem[];
    opf?: Partial<OpfOptions>;
    title?: string | null;
    /** Nav entries for chapters added through `files`. */
    points?: TocPoint[];
  } = {},
): Uint8Array {
  const files: Record<string, string | Uint8Array> = {};
  const items: ManifestItem[] = [NAV_ITEM];
  const points: TocPoint[] = [...(extra.points ?? [])];
  for (let n = 1; n <= count; n++) {
    files[`OEBPS/text/ch${n}.xhtml`] = xhtml(
      `Chapter ${n}`,
      `<h1>Chapter ${n}</h1>${FILLER.map(para).join('')}`,
    );
    items.push(chapterItem(n));
    points.push({ label: `Chapter ${n}`, href: `text/ch${n}.xhtml` });
  }
  const title = extra.title === undefined ? 'Simple Fixture' : extra.title;
  return epubZip({
    [OPF]: opf({
      ...(title === null ? {} : { title }),
      creators: ['Ada Example'],
      items: [...items, ...(extra.items ?? [])],
      spine: items.slice(1).map((i) => i.id),
      ...extra.opf,
    }),
    'OEBPS/nav.xhtml': nav(points),
    ...files,
    ...extra.files,
  });
}

const BOOK_CSS = 'body{font-family:serif} @font-face{font-family:P;src:url(../fonts/plain.woff)}';

function epub3Nav(): Uint8Array {
  const identifier = 'urn:uuid:00000000-0000-4000-8000-000000000003';
  const css = { css: ['../css/book.css'] };
  const ch1 = xhtml(
    'Chapter One',
    '<h1>Chapter One</h1>' +
      para('It begins in a quiet room above the river.') +
      para('Nobody there had yet heard the bell.'),
    css,
  );
  const ch2 = xhtml(
    'Chapter Two',
    '<h1>Chapter Two</h1>' +
      para('The second morning was <b>bold</b> and bright.') +
      '<h2 id="s21">Section 2.1</h2>' +
      '<p><img src="../images/cover.png" alt="Cover"/></p>' +
      para(
        'Read on to the <a href="ch3.xhtml#end">next</a> part, or see <a href="https://example.org/">ext</a>.',
      ),
    css,
  );
  const ch3 = xhtml(
    'Chapter Three',
    '<h1>Chapter Three</h1>' +
      para('The last chapter is short.') +
      para('Everyone went home.') +
      '<p id="end">The end.</p>',
    css,
  );
  return epubZip({
    [OPF]: opf({
      title: 'Fixture Three',
      creators: ['Ada Example', 'Bo Sample'],
      language: 'en',
      identifier,
      items: [
        NAV_ITEM,
        { id: 'ncx', href: 'toc.ncx', mediaType: 'application/x-dtbncx+xml' },
        chapterItem(1),
        chapterItem(2),
        chapterItem(3),
        { id: 'css', href: 'css/book.css', mediaType: 'text/css' },
        { id: 'font', href: 'fonts/plain.woff', mediaType: 'font/woff' },
        {
          id: 'cover',
          href: 'images/cover.png',
          mediaType: 'image/png',
          properties: 'cover-image',
        },
      ],
      spine: ['ch1', 'ch2', 'ch3'],
      ncx: 'ncx',
    }),
    'OEBPS/nav.xhtml': nav([
      { label: 'Chapter One', href: 'text/ch1.xhtml' },
      {
        label: 'Chapter Two',
        href: 'text/ch2.xhtml',
        children: [{ label: 'Section 2.1', href: 'text/ch2.xhtml#s21' }],
      },
      { label: 'Chapter Three', href: 'text/ch3.xhtml' },
    ]),
    'OEBPS/toc.ncx': ncx(
      [
        { label: 'NCX One', href: 'text/ch1.xhtml' },
        { label: 'NCX Two', href: 'text/ch2.xhtml' },
        { label: 'NCX Three', href: 'text/ch3.xhtml' },
      ],
      identifier,
    ),
    'OEBPS/text/ch1.xhtml': ch1,
    'OEBPS/text/ch2.xhtml': ch2,
    'OEBPS/text/ch3.xhtml': ch3,
    'OEBPS/css/book.css': BOOK_CSS,
    'OEBPS/fonts/plain.woff': new Uint8Array([119, 79, 70, 70, 0, 1, 0, 0]),
    'OEBPS/images/cover.png': makePng(2, 3),
  });
}

function epub2Ncx(): Uint8Array {
  const doctype = XHTML_11_DOCTYPE;
  return epubZip({
    [OPF]: opf({
      version: '2.0',
      title: 'Fixture Two',
      creators: ['Ada Example'],
      extra: '<meta name="cover" content="cover-img"/>',
      items: [
        { id: 'ncx', href: 'toc.ncx', mediaType: 'application/x-dtbncx+xml' },
        chapterItem(1),
        chapterItem(2),
        { id: 'cover-img', href: 'images/cover.png', mediaType: 'image/png' },
      ],
      spine: ['ch1', 'ch2'],
      ncx: 'ncx',
    }),
    'OEBPS/toc.ncx': ncx([
      { label: 'First Chapter', href: 'text/ch1.xhtml' },
      { label: 'Second Chapter', href: 'text/ch2.xhtml' },
    ]),
    'OEBPS/text/ch1.xhtml': xhtml('One', para('The first of two.'), { doctype }),
    'OEBPS/text/ch2.xhtml': xhtml('Two', para('The second of two.'), { doctype }),
    'OEBPS/images/cover.png': makePng(2, 3),
  });
}

function epub2Entities(): Uint8Array {
  return epubZip({
    [OPF]: opf({
      version: '2.0',
      title: 'Entities',
      items: [
        { id: 'ncx', href: 'toc.ncx', mediaType: 'application/x-dtbncx+xml' },
        chapterItem(1),
      ],
      spine: ['ch1'],
      ncx: 'ncx',
    }),
    'OEBPS/toc.ncx': ncx([{ label: 'Only', href: 'text/ch1.xhtml' }]),
    'OEBPS/text/ch1.xhtml': xhtml('Entities', '<p>Caf&eacute;&nbsp;au lait</p>', {
      doctype: XHTML_11_DOCTYPE,
    }),
  });
}

function noToc(): Uint8Array {
  return epubZip({
    [OPF]: opf({
      title: 'No Contents',
      items: [chapterItem(1), chapterItem(2)],
      spine: ['ch1', 'ch2'],
    }),
    'OEBPS/text/ch1.xhtml': xhtml('One', '<h2>Opening</h2>' + para('A start without a list.')),
    'OEBPS/text/ch2.xhtml': xhtml('Two', para('A middle without a heading.')),
  });
}

function oddNames(): Uint8Array {
  return epubZip({
    [OPF]: opf({
      title: 'Odd Names',
      items: [
        { ...NAV_ITEM },
        { id: 'c1', href: 'Text%20Files/cap%C3%ADtulo%201.xhtml', mediaType: XHTML_TYPE },
        { id: 'c2', href: 'Text%20Files/50%25.xhtml', mediaType: XHTML_TYPE },
        { id: 'fig', href: 'Images/deep/nested/fig%201.png', mediaType: 'image/png' },
      ],
      spine: ['c1', 'c2'],
    }),
    'OEBPS/nav.xhtml': nav([
      { label: 'Capítulo 1', href: 'Text%20Files/cap%C3%ADtulo%201.xhtml' },
      { label: 'Fifty percent', href: 'Text%20Files/50%25.xhtml' },
    ]),
    'OEBPS/Text Files/capítulo 1.xhtml': xhtml(
      'Capítulo 1',
      '<h1>Capítulo 1</h1><p><img src="../Images/deep/nested/fig%201.png" alt="Figure 1"/></p>',
    ),
    'OEBPS/Text Files/50%.xhtml': xhtml('Fifty', '<h1>Fifty percent</h1>' + para('Half way.')),
    'OEBPS/Images/deep/nested/fig 1.png': makePng(3, 3),
  });
}

const OBFUSCATION = 'http://www.idpf.org/2008/embedding';
const AES = 'http://www.w3.org/2001/04/xmlenc#aes128-cbc';

function fontObfuscation(): Uint8Array {
  return simpleEpub3(1, {
    items: [{ id: 'obf', href: 'fonts/obf.otf', mediaType: 'font/otf' }],
    files: {
      'META-INF/encryption.xml': encryption([
        { uri: 'OEBPS/fonts/obf.otf', algorithm: OBFUSCATION },
      ]),
      'OEBPS/fonts/obf.otf': new Uint8Array(64).fill(7),
    },
  });
}

function drmEncryption(): Uint8Array {
  return simpleEpub3(1, {
    files: {
      'META-INF/encryption.xml': encryption([{ uri: 'OEBPS/text/ch1.xhtml', algorithm: AES }]),
    },
  });
}

function malicious(): Uint8Array {
  const body =
    '<p>Safe text survives</p>' +
    '<script>window.__pwned=1</script>' +
    '<img src="x.png" onerror="window.__pwned=2"/>' +
    '<a href="javascript:alert(1)">j</a>' +
    '<img src="https://tracker.invalid/p.png" alt="t"/>' +
    '<form action="https://e.invalid"><input/></form>' +
    '<iframe src="https://e.invalid"></iframe>' +
    '<p style="background:url(https://e.invalid/s.png)">s</p>';
  const head =
    '<style>@import url(https://e.invalid/x.css); body{background:url(https://e.invalid/bg.png)}</style>';
  return epubZip({
    [OPF]: opf({
      title: 'Malicious',
      items: [NAV_ITEM, chapterItem(1), { id: 'css', href: 'css/evil.css', mediaType: 'text/css' }],
      spine: ['ch1'],
    }),
    'OEBPS/nav.xhtml': nav([{ label: 'Only', href: 'text/ch1.xhtml' }]),
    'OEBPS/text/ch1.xhtml': xhtml('Malicious', body, { css: ['../css/evil.css'], head }),
    'OEBPS/css/evil.css': '@font-face{font-family:E;src:url(https://e.invalid/f.woff)}',
  });
}

function brokenXhtml(): Uint8Array {
  return simpleEpub3(0, {
    items: [chapterItem(1)],
    opf: { spine: ['ch1'], title: 'Broken' },
    points: [{ label: 'Broken', href: 'text/ch1.xhtml' }],
    files: {
      'OEBPS/text/ch1.xhtml':
        '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Broken</title></head>' +
        '<body><p>First paragraph&nbsp;here<p>Second&mdash;paragraph</body></html>\n',
    },
  });
}

function missingFiles(): Uint8Array {
  return epubZip({
    [OPF]: opf({
      title: 'Missing Files',
      items: [
        NAV_ITEM,
        chapterItem(1),
        chapterItem(2),
        { id: 'gone', href: 'images/gone.png', mediaType: 'image/png' },
      ],
      spine: ['ch1', 'ch2'],
    }),
    'OEBPS/nav.xhtml': nav([{ label: 'One', href: 'text/ch1.xhtml' }]),
    'OEBPS/text/ch1.xhtml': xhtml(
      'One',
      para('This one is here.') + '<p><img src="../images/gone.png" alt="gone"/></p>',
    ),
  });
}

function emptySpine(): Uint8Array {
  return epubZip({
    [OPF]: opf({
      title: 'Empty Spine',
      items: [chapterItem(1), chapterItem(2)],
      spine: ['ch1', 'ch2'],
    }),
  });
}

function noContainer(): Uint8Array {
  return epubZip(
    {
      'content.opf': opf({
        title: 'No Container',
        items: [{ id: 'ch1', href: 'ch1.xhtml', mediaType: XHTML_TYPE }],
        spine: ['ch1'],
      }),
      'ch1.xhtml': xhtml('One', para('Found without a container.')),
    },
    { container: false },
  );
}

function zipNotEpub(): Uint8Array {
  return buildZip([{ name: 'readme.txt', data: 'Just a zip.' }]);
}

const LONG_SENTENCE =
  'The copyist worked through the long afternoon, line after careful line, ' +
  'checking each word against the worn exemplar and pausing only to mend the pen ' +
  'or to let the ink dry on a page that would outlast everyone in the room. ' +
  'Outside, the bells marked hours nobody counted.';

function longChapter(): Uint8Array {
  const paragraphs = Array.from({ length: 79 }, (_, i) => para(`${i + 1}. ${LONG_SENTENCE}`));
  return simpleEpub3(0, {
    items: [chapterItem(1)],
    opf: { spine: ['ch1'], title: 'Long Chapter' },
    points: [{ label: 'Long', href: 'text/ch1.xhtml' }],
    files: {
      'OEBPS/text/ch1.xhtml': xhtml(
        'Long',
        '<h1>Long</h1>' + paragraphs.join('') + '<p id="end">The end.</p>',
      ),
    },
  });
}

export const EPUB: Record<EpubFixture, () => Uint8Array> = {
  epub3Nav,
  epub2Ncx,
  epub2Entities,
  noToc,
  oddNames,
  noCover: () => simpleEpub3(1, { title: 'No Cover' }),
  noTitle: () => simpleEpub3(1, { title: null }),
  fontObfuscation,
  drmEncryption,
  drmAdept: () =>
    simpleEpub3(1, {
      files: {
        'META-INF/rights.xml':
          '<?xml version="1.0"?>\n<adept:rights xmlns:adept="http://ns.adobe.com/adept"/>\n',
      },
    }),
  drmFairplay: () =>
    simpleEpub3(1, {
      files: {
        'META-INF/sinf.xml':
          '<?xml version="1.0"?>\n<fairplay:sinf xmlns:fairplay="http://itunes.apple.com/ns/epub"/>\n',
      },
    }),
  malicious,
  fixedLayout: () =>
    simpleEpub3(1, {
      title: 'Fixed Layout',
      opf: { extra: '<meta property="rendition:layout">pre-paginated</meta>' },
    }),
  brokenXhtml,
  missingFiles,
  emptySpine,
  noContainer,
  zipNotEpub,
  longChapter,
};

export const DOCX = {
  basic(): Uint8Array {
    const body = [
      paragraph(run('Part One'), 'Heading1'),
      paragraph(
        run('Some ') +
          run('bold', { bold: true }) +
          run(' and ') +
          run('italic', { italic: true }) +
          run('.'),
      ),
      paragraph(run('first'), 'ListParagraph', { numId: 1 }),
      paragraph(run('second'), 'ListParagraph', { numId: 1 }),
      paragraph(run('one'), 'ListParagraph', { numId: 2 }),
      paragraph(run('two'), 'ListParagraph', { numId: 2 }),
      paragraph(picture('rIdImage1', 381000, 190500, 'A small picture')),
      table([
        ['a', 'b'],
        ['c', 'd'],
      ]),
      paragraph(run('Part Two'), 'Heading1'),
      paragraph(run('End.')),
    ].join('');
    return docxZip({
      body,
      title: 'Docx Fixture',
      creator: 'Ada Example',
      images: { rIdImage1: makePng(4, 2) },
    });
  },
  noHeadings(): Uint8Array {
    return docxZip({
      body: ['First plain paragraph.', 'Second plain paragraph.', 'Third plain paragraph.']
        .map((t) => paragraph(run(t)))
        .join(''),
    });
  },
};

export const OTHER = {
  notAZip: (): Uint8Array => new TextEncoder().encode('hello'),
  legacyDoc: (): Uint8Array => {
    const bytes = new Uint8Array(512);
    bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    return bytes;
  },
  pdf: (): Uint8Array => new TextEncoder().encode('%PDF-1.7\n'),
};

/** 200 chapters of about 10 KB each and one 20 MB stored image. */
export function bigEpub(): Uint8Array {
  const chapterText = para(LONG_SENTENCE).repeat(34);
  const files: Record<string, string | Uint8Array> = {};
  const items: ManifestItem[] = [NAV_ITEM];
  for (let n = 1; n <= 200; n++) {
    files[`OEBPS/text/ch${n}.xhtml`] = xhtml(`Chapter ${n}`, `<h1>Chapter ${n}</h1>${chapterText}`);
    items.push(chapterItem(n));
  }
  const image = new Uint8Array(20 * 1024 * 1024);
  let state = 0x2545f491;
  for (let i = 0; i < image.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    image[i] = state & 0xff;
  }
  image.set(PNG_SIGNATURE);
  return epubZip({
    [OPF]: opf({
      title: 'Big Book',
      items: [...items, { id: 'big', href: 'images/big.png', mediaType: 'image/png' }],
      spine: items.slice(1).map((i) => i.id),
    }),
    'OEBPS/nav.xhtml': nav([{ label: 'Chapter 1', href: 'text/ch1.xhtml' }]),
    ...files,
    'OEBPS/images/big.png': image,
  });
}

/** The text content of an HTML fragment. */
export function textOf(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content.textContent ?? '';
}
