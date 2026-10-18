/** The languages the voice speaks. */
export type Lang = 'it' | 'en';

/**
 * The longest piece the model is given at once, in characters. It was 300
 * until the Android trial, where the voice now and then dropped or repeated
 * syllables; a shorter piece gives the model less to keep in line.
 */
export const MAX_PIECE = 200;

/**
 * The longest of the first pieces of a reading, in characters. The voice is
 * heard once the first piece is made, so it is short, and each one after can
 * be made while the one before it plays.
 */
export const FIRST_PIECES: readonly number[] = [80, 120, 180];

/** What follows a piece: more of its block, a new paragraph, a new heading, or the end of the chapter. */
export type Ending = 'piece' | 'paragraph' | 'heading' | 'chapter';

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
  ends: Ending;
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
function pack(parts: Span[], longest = MAX_PIECE): Span[] {
  const out: Span[] = [];
  for (const [start, end] of parts) {
    const last = out[out.length - 1];
    if (last !== undefined && end - last[0] <= longest) last[1] = end;
    else out.push([start, end]);
  }
  return out;
}

/**
 * Where a sentence too long for one call may be cut, best first: a semicolon
 * or a colon, a comma, a space. The voice ends each piece as if a sentence
 * ended, so a cut between two words is heard the most.
 */
const BREAKS = [/[;:]/g, /,/g, /\s/g];

/** The level of BREAKS that cuts between words. */
const SPACES = BREAKS.length - 1;

/**
 * Cuts a span that is too long at semicolons and colons, then at commas, then
 * at spaces, then anywhere; with `marksOnly`, never between words, so a span
 * with no mark to cut at is left whole.
 */
function fit(text: string, span: Span, longest = MAX_PIECE, marksOnly = false, level = 0): Span[] {
  if (span[1] - span[0] <= longest || (marksOnly && level === SPACES)) return [span];
  const breaks = BREAKS[level];
  if (breaks === undefined) {
    const cuts: Span[] = [];
    for (let s = span[0]; s < span[1]; s += longest) {
      cuts.push([s, Math.min(span[1], s + longest)]);
    }
    return cuts;
  }
  return pack(
    splitAfter(text, span, breaks).flatMap((part) =>
      fit(text, part, longest, marksOnly, level + 1),
    ),
    longest,
  );
}

function sentences(text: string, lang: Lang): Span[] {
  const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
  return [...segmenter.segment(text)].flatMap(({ segment, index }) =>
    trim(text, [index, index + segment.length]),
  );
}

/** A point in a chapter's read text: a block of `readableBlocks` and an offset into its text. */
export interface Place {
  block: number;
  offset: number;
}

/**
 * Where a point of the document falls in the read text: in the innermost
 * block that holds it, at the first character from it on, or else at the
 * start of the first block after it. Null when no block follows.
 */
export function placeOf(doc: Document, node: Node, offset: number): Place | null {
  const blocks = blocksWithText(doc);
  const point = doc.createRange();
  point.setStart(node, offset);
  // Nested blocks come after the one around them, so the last match is the innermost.
  const block = blocks.findLastIndex(({ block: element }) => element.contains(node));
  if (block >= 0) {
    const { spots } = blocks[block]!.reading;
    const at = spots.findIndex((spot) => point.comparePoint(spot.node, spot.offset) >= 0);
    return { block, offset: at >= 0 ? at : spots.length };
  }
  const after = blocks.findIndex(({ block: element }) => point.comparePoint(element, 0) >= 0);
  return after >= 0 ? { block: after, offset: 0 } : null;
}

/**
 * The pieces of a chapter in reading order; from a place, only those from the
 * sentence that holds it on.
 */
export function piecesOf(doc: Document, lang: Lang, spineIndex: number, from?: Place): Piece[] {
  const pieces = blocksWithText(doc).flatMap(({ block: element, reading: { text } }, block) => {
    if (from !== undefined && block < from.block) return [];
    const kept =
      from !== undefined && block === from.block
        ? sentences(text, lang).filter(([, end]) => end > from.offset)
        : sentences(text, lang);
    const spans = pack(kept.flatMap((sentence) => fit(text, sentence)));
    const last: Ending = /^h[1-6]$/.test(element.localName) ? 'heading' : 'paragraph';
    return spans.map(([start, end], i): Piece => ({
      text: text.slice(start, end),
      spineIndex,
      block,
      start,
      end,
      ends: i === spans.length - 1 ? last : 'piece',
    }));
  });
  const final = pieces[pieces.length - 1];
  if (final !== undefined) final.ends = 'chapter';
  return pieces;
}

/** The part of a piece from `start` to `end`, offsets into its text. */
function partOf(piece: Piece, start: number, end: number, ends: Ending): Piece {
  return {
    ...piece,
    text: piece.text.slice(start, end),
    start: piece.start + start,
    end: piece.start + end,
    ends,
  };
}

/**
 * The pieces of a reading with its first ones cut down to `FIRST_PIECES`, at
 * the ends of sentences where they can be, then at semicolons, colons and
 * commas. A first piece is never cut between two words: with no mark to cut
 * at it runs on, up to `MAX_PIECE`, since a sentence broken off mid-way is
 * heard as two.
 */
export function rampUp(pieces: readonly Piece[], lang: Lang): Piece[] {
  const out: Piece[] = [];
  for (const piece of pieces) {
    const { text } = piece;
    let rest: Span | undefined = [0, text.length];
    for (
      let longest = FIRST_PIECES[out.length];
      rest !== undefined && longest !== undefined && rest[1] - rest[0] > longest;
      longest = FIRST_PIECES[out.length]
    ) {
      const from: number = rest[0];
      const tail = text.slice(from);
      let [start, end] = pack(
        sentences(tail, lang).flatMap((sentence) => fit(tail, sentence, longest, true)),
        longest,
      )[0]!;
      if (end - start > MAX_PIECE) [start, end] = fit(tail, [start, end])[0]!;
      out.push(partOf(piece, from + start, from + end, 'piece'));
      rest = trim(text, [from + end, text.length])[0];
    }
    if (rest === undefined) out[out.length - 1]!.ends = piece.ends;
    else out.push(rest[0] === 0 ? piece : partOf(piece, rest[0], rest[1], piece.ends));
  }
  return out;
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
