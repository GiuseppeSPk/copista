import { describe, expect, it } from 'vitest';
import {
  FIRST_PIECES,
  MAX_PIECE,
  blockText,
  piecesOf,
  placeOf,
  rampUp,
  rangeOf,
  readableBlocks,
} from '../../../src/voice/text';

function chapter(body: string): Document {
  return new DOMParser().parseFromString(`<html><body>${body}</body></html>`, 'text/html');
}

const ITALIAN = chapter(`
  <h1>Capitolo primo</h1>
  <p>Quel ramo del lago di Como volge a mezzogiorno. Tra due catene di monti. Vien quasi a ristringersi.</p>
  <p>Don Abbondio tornava a casa<sup><a href="#n1">1</a></sup> dalla passeggiata.</p>
  <p>Diceva tranquillamente il suo ufficio.</p>
  <ul><li>Primo punto.</li><li>Secondo punto.</li></ul>
  <blockquote><p>Una citazione.</p></blockquote>
  <pre>codice()</pre>
  <p><img src="x.png" alt="Una figura"></p>
  <ol class="notes"><li><p id="n1">Una nota.</p></li></ol>
`);

describe('readable blocks', () => {
  it('reads headings, paragraphs, list items and quotes in order, and skips notes and code', () => {
    expect(readableBlocks(ITALIAN).map((b) => blockText(b))).toEqual([
      'Capitolo primo',
      'Quel ramo del lago di Como volge a mezzogiorno. Tra due catene di monti. Vien quasi a ristringersi.',
      'Don Abbondio tornava a casa dalla passeggiata.',
      'Diceva tranquillamente il suo ufficio.',
      'Primo punto.',
      'Secondo punto.',
      'Una citazione.',
    ]);
  });

  it('gives an outer list item its own words and the nested one separately', () => {
    const doc = chapter('<ul><li>Fuori <ul><li>Dentro</li></ul></li></ul>');
    expect(readableBlocks(doc).map((b) => blockText(b))).toEqual(['Fuori', 'Dentro']);
  });

  it('skips footnote lists and picture-only blocks', () => {
    const doc = chapter(
      '<p><img src="a.png"></p><ol class="footnotes"><li>Nota.</li></ol><figure><img src="b.png"><figcaption>Didascalia.</figcaption></figure>',
    );
    expect(readableBlocks(doc).map((b) => blockText(b))).toEqual(['Didascalia.']);
  });

  it('leaves out a note mark that is not raised, and the mark that leads back from the note', () => {
    const doc = chapter(
      '<p>Le Frini e i Duci<a id="a6"></a><a class="fnanchor" href="notes.xhtml#Footnote_6">[6]</a>; turba vana.</p>' +
        '<p><a href="text.xhtml#a6"><span class="label">[6]</span></a> Una nota.</p>' +
        '<p>He came<a epub:type="noteref" href="endnotes.xhtml#note-1">1</a>. She left<a role="doc-noteref" href="#n2">2</a>.</p>',
    );
    expect(readableBlocks(doc).map((b) => blockText(b))).toEqual([
      'Le Frini e i Duci; turba vana.',
      'Una nota.',
      'He came. She left.',
    ]);
  });

  it('still reads a link that is not a note mark, and brackets that are not a link', () => {
    const doc = chapter(
      '<p>See <a href="#c2">chapter [2]</a> (pag. <a href="#Page_11">11</a>) and [sic], or <a href="https://example.org/">[1]</a>.</p>',
    );
    expect(blockText(readableBlocks(doc)[0]!)).toBe('See chapter [2] (pag. 11) and [sic], or [1].');
  });
});

describe('pieces', () => {
  it('joins the sentences of one block and never crosses blocks', () => {
    const pieces = piecesOf(ITALIAN, 'it', 4);
    expect(pieces.map((p) => p.text)).toEqual([
      'Capitolo primo',
      'Quel ramo del lago di Como volge a mezzogiorno. Tra due catene di monti. Vien quasi a ristringersi.',
      'Don Abbondio tornava a casa dalla passeggiata.',
      'Diceva tranquillamente il suo ufficio.',
      'Primo punto.',
      'Secondo punto.',
      'Una citazione.',
    ]);
    expect(pieces[1]).toMatchObject({ spineIndex: 4, block: 1, start: 0 });
  });

  it('starts a new piece when the next sentence would pass the limit', () => {
    const sentence = 'Questa è una frase di prova che dura un poco. ';
    const doc = chapter(`<p>${sentence.repeat(10)}</p>`);
    const pieces = piecesOf(doc, 'it', 0);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(p.text.length).toBeLessThanOrEqual(MAX_PIECE);
    expect(pieces.map((p) => p.text).join(' ')).toBe(sentence.repeat(10).trim());
  });

  it('splits a long sentence at commas only, when commas are enough', () => {
    const clause = 'e poi venne un altro giorno di pioggia lunga sui campi';
    const long = `${Array.from({ length: 14 }, () => clause).join(', ')}.`;
    expect(long.length).toBeGreaterThan(700);
    const pieces = piecesOf(chapter(`<p>${long}</p>`), 'it', 0);
    for (const p of pieces) {
      expect(p.text.length).toBeLessThanOrEqual(MAX_PIECE);
      expect(p.text.endsWith(',') || p.text.endsWith('.')).toBe(true);
    }
    expect(pieces.map((p) => p.text).join(' ')).toBe(long);
  });

  it('splits a long sentence at semicolons and colons before commas', () => {
    const clause = 'e poi venne un altro giorno, di pioggia lunga sui campi';
    const long = `${Array.from({ length: 8 }, (_, i) => clause + (i % 2 ? ';' : ':')).join(' ')} fine.`;
    expect(long.length).toBeGreaterThan(400);
    const pieces = piecesOf(chapter(`<p>${long}</p>`), 'it', 0);
    for (const p of pieces.slice(0, -1)) expect(/[;:]$/.test(p.text)).toBe(true);
    expect(pieces.map((p) => p.text).join(' ')).toBe(long);
  });

  it('splits a long sentence with no commas at spaces', () => {
    const long = `${Array.from({ length: 120 }, (_, i) => `parola${i}`).join(' ')}.`;
    const pieces = piecesOf(chapter(`<p>${long}</p>`), 'it', 0);
    expect(pieces.length).toBeGreaterThan(2);
    for (const p of pieces) {
      expect(p.text.length).toBeLessThanOrEqual(MAX_PIECE);
      expect(p.text.startsWith('parola')).toBe(true);
    }
    expect(pieces.map((p) => p.text).join(' ')).toBe(long);
  });

  it('cuts a single word longer than the limit', () => {
    const word = 'a'.repeat(MAX_PIECE + 20);
    const pieces = piecesOf(chapter(`<p>${word}</p>`), 'en', 0);
    expect(pieces.map((p) => p.text.length)).toEqual([MAX_PIECE, 20]);
  });

  it('says what follows each piece: more of the block, a paragraph, a heading or the end', () => {
    const sentence = 'Questa è una frase di prova che dura un poco. ';
    const doc = chapter(`
      <h2>Capitolo secondo</h2>
      <p>${sentence.repeat(8)}</p>
      <p>Un paragrafo breve.</p>
      <ul><li>Un punto.</li></ul>
    `);
    const pieces = piecesOf(doc, 'it', 0);
    expect(pieces.map((p) => p.block)).toEqual([0, 1, 1, 2, 3]);
    expect(pieces.map((p) => p.ends)).toEqual([
      'heading',
      'piece',
      'paragraph',
      'paragraph',
      'chapter',
    ]);
  });

  it('does not end a piece on a title cut short, in the middle of a name', () => {
    const sentence = 'He went to see Mr. Bennet and Mrs. Long with Dr. Grant of St. Giles. ';
    const doc = chapter(`<p>${sentence.repeat(12)}</p>`);
    const pieces = piecesOf(doc, 'en', 0);
    expect(pieces).toHaveLength(6);
    for (const p of pieces) {
      expect(p.text.length).toBeLessThanOrEqual(MAX_PIECE);
      expect(p.text.endsWith('Giles.')).toBe(true);
    }
    expect(pieces.map((p) => p.text).join(' ')).toBe(sentence.repeat(12).trim());
  });

  it('does the same in Italian, for titles and for the initial of a saint', () => {
    const sentence = 'Venne il sig. Rossi col dott. Bianchi e il Prof. Verdi da S. Ambrogio. ';
    const doc = chapter(`<p>${sentence.repeat(12)}</p>`);
    const pieces = piecesOf(doc, 'it', 0);
    expect(pieces).toHaveLength(6);
    for (const p of pieces) expect(p.text.endsWith('Ambrogio.')).toBe(true);
    expect(pieces.map((p) => p.text).join(' ')).toBe(sentence.repeat(12).trim());
  });

  it('cuts a sentence too long for one piece at a comma, not after the title', () => {
    const text =
      'It was a truth which everybody in the neighbourhood had long since agreed upon, that Mr. ' +
      'Bingley of Netherfield, who had come down on Monday in a chaise and four to see the place, ' +
      'would give a ball before Michaelmas, and that Mrs. Long would be asked to it.';
    const pieces = piecesOf(chapter(`<p>${text}</p>`), 'en', 0);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces.slice(0, -1)) expect(p.text.endsWith(',')).toBe(true);
    expect(pieces.map((p) => p.text).join(' ')).toBe(text);
  });

  it('does not cut a long sentence inside a time of day or a figure', () => {
    const time =
      'The woman who had come up by the early train from the north found herself at exactly 4:35 ' +
      'walking through the lane with a small parcel under her arm and no clear notion of the way ' +
      'she ought to take in order to reach the office before it closed for the night.';
    const sum =
      'The man who had kept the books of the house for thirty years wrote down a sum of 3,000 ' +
      'pounds against the name of the younger brother and then shut the ledger without a word ' +
      'to anybody in the room about what he had found in it that morning.';
    for (const text of [time, sum]) {
      expect(text.length).toBeGreaterThan(MAX_PIECE);
      const pieces = piecesOf(chapter(`<p>${text}</p>`), 'en', 0);
      for (const p of pieces) expect(p.text).not.toMatch(/\d[,:]$/);
      expect(pieces.map((p) => p.text).join(' ')).toBe(text);
    }
  });

  it('gives no pieces for a chapter that is only a picture', () => {
    expect(piecesOf(chapter('<p><img src="cover.jpg"></p>'), 'en', 0)).toEqual([]);
  });
});

describe('ranges', () => {
  it('covers the piece in the live document, across inline markup and spaces', () => {
    const doc = chapter('<p>Uno   <em>due</em>\n tre. Quattro <b>cinque</b>.</p>');
    const [piece] = piecesOf(doc, 'it', 0);
    expect(piece!.text).toBe('Uno due tre. Quattro cinque.');
    expect(rangeOf(doc, piece!)!.toString().replace(/\s+/g, ' ')).toBe(piece!.text);
  });

  it('covers a piece that starts in the middle of a block', () => {
    const word = 'parola '.repeat(60);
    const doc = chapter(`<p>${word}<em>fine</em> della frase.</p>`);
    const pieces = piecesOf(doc, 'it', 0);
    const last = pieces[pieces.length - 1]!;
    expect(last.start).toBeGreaterThan(0);
    expect(rangeOf(doc, last)!.toString().replace(/\s+/g, ' ')).toBe(last.text);
  });

  it('gives null when the block is no longer there', () => {
    const doc = chapter('<p>Uno.</p>');
    expect(
      rangeOf(doc, { text: 'x', spineIndex: 0, block: 3, start: 0, end: 1, ends: 'chapter' }),
    ).toBeNull();
  });
});

describe('reading from a point', () => {
  const doc = chapter(
    '<h1>Titolo</h1><p>Prima frase. Seconda <em>frase</em> qui. Terza frase.</p><p>Altro paragrafo.</p>',
  );
  const em = doc.querySelector('em')!.firstChild!;

  it('finds the block and the character under a point, inside inline markup', () => {
    const place = placeOf(doc, em, 2);
    expect(place).toEqual({ block: 1, offset: 'Prima frase. Seconda fr'.length });
  });

  it('takes a point between blocks to the start of the next one', () => {
    expect(placeOf(doc, doc.body, 1)).toEqual({ block: 1, offset: 0 });
    expect(placeOf(doc, doc.body, doc.body.childNodes.length)).toBeNull();
  });

  it('starts at the sentence that holds the point and goes on to the end', () => {
    const texts = piecesOf(doc, 'it', 0, placeOf(doc, em, 2)!).map((piece) => piece.text);
    expect(texts).toEqual(['Seconda frase qui. Terza frase.', 'Altro paragrafo.']);
  });

  it('keeps the offsets of the whole block, so the ranges still cover the text', () => {
    const [first] = piecesOf(doc, 'it', 0, { block: 1, offset: 15 });
    expect(first!.start).toBe('Prima frase. '.length);
    expect(rangeOf(doc, first!)!.toString()).toBe(first!.text);
  });

  it('starts at the head of the sentence from a name that follows a title or initials', () => {
    const from = (body: string, word: string, lang: 'en' | 'it'): string[] => {
      const doc = chapter(`<p>${body}</p>`);
      const offset = blockText(readableBlocks(doc)[0]!).indexOf(word);
      return piecesOf(doc, lang, 0, { block: 0, offset }).map((p) => p.text);
    };
    expect(
      from('It was late. He agreed with Mr. Bennet at once. She smiled.', 'Bennet', 'en'),
    ).toEqual(['He agreed with Mr. Bennet at once. She smiled.']);
    expect(
      from('It is long. It is by J. R. R. Tolkien and H.G. Wells. Read it.', 'Wells', 'en'),
    ).toEqual(['It is by J. R. R. Tolkien and H.G. Wells. Read it.']);
    expect(from('Era tardi. Passò D. Rodrigo col sig. Conte. Poi nulla.', 'Conte', 'it')).toEqual([
      'Passò D. Rodrigo col sig. Conte. Poi nulla.',
    ]);
  });

  it('still ends a sentence after the name, and after an English I', () => {
    const from = (body: string, word: string): string[] => {
      const doc = chapter(`<p>${body}</p>`);
      const offset = blockText(readableBlocks(doc)[0]!).indexOf(word);
      return piecesOf(doc, 'en', 0, { block: 0, offset }).map((p) => p.text);
    };
    expect(from('It was Mr. Bennet. Then he left.', 'Then')).toEqual(['Then he left.']);
    // A small letter alone is a word or a label, not the initial of a name.
    const doc = chapter('<p>Segnò sulla carta il punto a. Poi tornò indietro.</p>');
    const offset = blockText(readableBlocks(doc)[0]!).indexOf('Poi');
    expect(piecesOf(doc, 'it', 0, { block: 0, offset }).map((p) => p.text)).toEqual([
      'Poi tornò indietro.',
    ]);
    expect(from('She knew it, and so did I. He left at once.', 'He left')).toEqual([
      'He left at once.',
    ]);
  });

  it('starts at the next sentence from a space after a full stop', () => {
    const [first] = piecesOf(doc, 'it', 0, { block: 1, offset: 'Prima frase.'.length });
    expect(first!.text.startsWith('Seconda')).toBe(true);
  });
});

describe('the first pieces of a reading', () => {
  const sentence = (n: number): string => `Frase numero ${n} di una prova abbastanza lunga.`;
  const long = Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join(' ');
  const doc = chapter(`<p>${long}</p><p>Un altro paragrafo.</p>`);

  it('makes the first three short and the rest as before, saying the same words in the same order', () => {
    const pieces = piecesOf(doc, 'it', 0);
    const ramped = rampUp(pieces, 'it');
    ramped.slice(0, 3).forEach((piece, i) => {
      expect(piece.text.length).toBeLessThanOrEqual(FIRST_PIECES[i]!);
    });
    expect(ramped[0]!.text.length).toBeLessThan(pieces[0]!.text.length);
    for (const piece of ramped.slice(3)) expect(piece.text.length).toBeLessThanOrEqual(MAX_PIECE);
    expect(ramped.map((p) => p.text).join(' ')).toBe(pieces.map((p) => p.text).join(' '));
  });

  it('cuts at the ends of sentences, and keeps the place of every part in its block', () => {
    const ramped = rampUp(piecesOf(doc, 'it', 0), 'it');
    const text = blockText(readableBlocks(doc)[0]!);
    expect(ramped[0]!.text).toBe(sentence(1));
    for (const piece of ramped.filter((p) => p.block === 0)) {
      expect(text.slice(piece.start, piece.end)).toBe(piece.text);
    }
  });

  it('keeps how each piece ends: the cut parts go on, the last part ends as the piece did', () => {
    const ramped = rampUp(piecesOf(doc, 'it', 0), 'it');
    const ends = ramped.map((p) => p.ends);
    expect(ends.at(-1)).toBe('chapter');
    expect(ends.filter((e) => e === 'paragraph')).toHaveLength(1);
    expect(ramped[ends.indexOf('paragraph')]!.text.endsWith(sentence(30))).toBe(true);
  });

  it('cuts a long first sentence at a comma', () => {
    const words = 'una parola, '.repeat(12) + 'e la fine.';
    const ramped = rampUp(piecesOf(chapter(`<p>${words}</p>`), 'it', 0), 'it');
    expect(ramped[0]!.text.length).toBeLessThanOrEqual(FIRST_PIECES[0]!);
    expect(ramped[0]!.text.endsWith(',')).toBe(true);
    expect(ramped.map((p) => p.text).join(' ')).toBe(words.trim());
  });

  it('never cuts a first piece between two words, and runs it on to a mark instead', () => {
    const run = Array.from({ length: 16 }, (_, i) => `parola${i}`).join(' ');
    const words = `${run}, e poi la fine della frase.`;
    expect(run.length).toBeGreaterThan(FIRST_PIECES[0]!);
    const ramped = rampUp(piecesOf(chapter(`<p>${words}</p>`), 'it', 0), 'it');
    expect(ramped[0]!.text).toBe(`${run},`);
    expect(ramped.map((p) => p.text).join(' ')).toBe(words);
  });

  it('cuts a first piece with no mark at all between words only past the longest piece', () => {
    const words = `${Array.from({ length: 40 }, (_, i) => `parola${i}`).join(' ')}.`;
    expect(words.length).toBeGreaterThan(MAX_PIECE);
    const ramped = rampUp(piecesOf(chapter(`<p>${words}</p>`), 'it', 0), 'it');
    expect(ramped[0]!.text.length).toBeGreaterThan(FIRST_PIECES[0]!);
    expect(ramped[0]!.text.length).toBeLessThanOrEqual(MAX_PIECE);
    expect(ramped.map((p) => p.text).join(' ')).toBe(words);
  });

  it('leaves short pieces as they are', () => {
    const pieces = piecesOf(ITALIAN, 'it', 0);
    expect(rampUp(pieces, 'it')).toEqual(pieces);
  });
});
