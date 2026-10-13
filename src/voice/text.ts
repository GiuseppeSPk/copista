/** The languages the voice speaks. */
export type Lang = 'it' | 'en';

/** The longest piece the model is given at once, in characters. */
export const MAX_PIECE = 300;

/**
 * A stretch of one block read in one call: consecutive sentences, or part of
 * a long one. `block` indexes `readableBlocks` of the chapter, and `start` and
 * `end` are offsets into that block's `blockText`.
 */
export interface Piece {
  text: string;
  spineIndex: number;
  block: number;
  start: number;
  end: number;
}

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, dt, dd, figcaption';
/** Containers whose blocks are never read: notes and code. */
const SKIPPED = 'ol.notes, ol.footnotes, pre';
/** Elements left out of a block's text: note marks, pictures and scripts. */
const LEFT_OUT = 'sup > a, img, picture, svg, audio, video, script, style';

interface Spot {
  node: Text;
  offset: number;
}

/** A block's text, and for each of its characters the place it came from. */
interface Reading {
  text: string;
  spots: Spot[];
}

/**
 * Reads a block's own text with whitespace collapsed. Text inside nested
 * blocks belongs to them, so it is left out here and counts as a space.
 */
function read(block: Element): Reading {
  let text = '';
  const spots: Spot[] = [];
  let space: Spot | null = null;
  const pendSpace = (spot: Spot | undefined): void => {
    if (text.length > 0 && space === null && spot !== undefined) space = spot;
  };
  const visit = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child as Text;
        for (let i = 0; i < t.data.length; i++) {
          if (/\s/.test(t.data[i]!)) {
            pendSpace({ node: t, offset: i });
            continue;
          }
          if (space !== null) {
            text += ' ';
            spots.push(space);
            space = null;
          }
          text += t.data[i];
          spots.push({ node: t, offset: i });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (el.matches(BLOCKS) || el.localName === 'br') pendSpace(spots[spots.length - 1]);
        else if (!el.matches(LEFT_OUT)) visit(el);
      }
    }
  };
  visit(block);
  return { text, spots };
}

function blocksWithText(doc: Document): { block: Element; reading: Reading }[] {
  const root = doc.body ?? doc.documentElement;
  return [...root.querySelectorAll(BLOCKS)]
    .filter((block) => block.closest(SKIPPED) === null)
    .map((block) => ({ block, reading: read(block) }))
    .filter(({ reading }) => reading.text.length > 0);
}

/** The blocks of a chapter that are read aloud, in document order. */
export function readableBlocks(doc: Document): Element[] {
  return blocksWithText(doc).map(({ block }) => block);
}

/** A block's own text as it is read: note marks and pictures out, whitespace collapsed. */
export function blockText(block: Element): string {
  return read(block).text;
}

type Span = [start: number, end: number];

/** A span without the spaces at its ends, or nothing when only spaces are left. */
function trim(text: string, [start, end]: Span): Span[] {
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return end > start ? [[start, end]] : [];
}

/** Cuts a span after every match of `breaks`, trimming the spaces around each part. */
function splitAfter(text: string, [start, end]: Span, breaks: RegExp): Span[] {
  const parts: Span[] = [];
  let from = start;
  for (const match of text.slice(start, end).matchAll(breaks)) {
    const to = start + match.index + match[0].length;
    parts.push(...trim(text, [from, to]));
    from = to;
  }
  parts.push(...trim(text, [from, end]));
  return parts;
}

/** Joins consecutive spans while the joined span stays within the limit. */
function pack(parts: Span[]): Span[] {
  const out: Span[] = [];
  for (const [start, end] of parts) {
    const last = out[out.length - 1];
    if (last !== undefined && end - last[0] <= MAX_PIECE) last[1] = end;
    else out.push([start, end]);
  }
  return out;
}

/** Where a sentence too long for one call may be cut, best first. */
const BREAKS = [/,/g, /\s/g];

/** Cuts a span that is too long at commas, then at spaces, then anywhere. */
function fit(text: string, span: Span, level = 0): Span[] {
  if (span[1] - span[0] <= MAX_PIECE) return [span];
  const breaks = BREAKS[level];
  if (breaks === undefined) {
    const cuts: Span[] = [];
    for (let s = span[0]; s < span[1]; s += MAX_PIECE) {
      cuts.push([s, Math.min(span[1], s + MAX_PIECE)]);
    }
    return cuts;
  }
  return pack(splitAfter(text, span, breaks).flatMap((part) => fit(text, part, level + 1)));
}

function sentences(text: string, lang: Lang): Span[] {
  const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
  return [...segmenter.segment(text)].flatMap(({ segment, index }) =>
    trim(text, [index, index + segment.length]),
  );
}

/** The pieces of a chapter in reading order. */
export function piecesOf(doc: Document, lang: Lang, spineIndex: number): Piece[] {
  return blocksWithText(doc).flatMap(({ reading: { text } }, block) =>
    pack(sentences(text, lang).flatMap((sentence) => fit(text, sentence))).map(([start, end]) => ({
      text: text.slice(start, end),
      spineIndex,
      block,
      start,
      end,
    })),
  );
}

/** The range a piece covers in a chapter document, or null when its block is gone. */
export function rangeOf(doc: Document, piece: Piece): Range | null {
  const found = blocksWithText(doc)[piece.block];
  if (found === undefined) return null;
  const first = found.reading.spots[piece.start];
  const last = found.reading.spots[piece.end - 1];
  if (first === undefined || last === undefined || piece.end <= piece.start) return null;
  const range = doc.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}
