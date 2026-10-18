/**
 * Where the stress falls in an Italian word, written into the text as an
 * accent, since the voice reads "epoca" as epòca and "macchina" as macchìna
 * unless they are written època and màcchina. Most words are found in a list
 * made from Wiktionary (scripts/make-stress.ts); a word not in it is guessed
 * from its ending, from the word it is cut from (raccontar, from raccontare),
 * or from the verb a pronoun is joined to (vederlo, from vedere). Of the 65,391
 * words of three vowel groups or more in I Promessi Sposi, 88.7% were found and
 * 5.5% guessed. With each word found taken out of the list in turn, the rules
 * guessed 19,271 of its uses, 99.6% of them right; the 84 wrong are mostly
 * imperatives read as participles, as lasciati.
 */

const GRAVE = '̀';
const ACUTE = '́';
const VOWELS = 'aeiou';

/**
 * Endings that tell where the stress falls, as the vowels from the end it is
 * on, and the accent: acute on a closed e or o. Only those right for at least
 * 98.5% of the words in the list that end so; "-ura" (augura) and "-ito"
 * (abito) are not.
 */
const ENDINGS: [string, number, string][] = (
  [
    ['ezione', 2, ACUTE],
    ['azione', 2, ACUTE],
    ['issimo', 5, GRAVE],
    ['issima', 5, GRAVE],
    ['issimi', 5, GRAVE],
    ['issime', 5, GRAVE],
    ['ebbero', 5, ACUTE],
    ['essero', 5, ACUTE],
    ['assero', 5, GRAVE],
    ['issero', 5, GRAVE],
    ['zione', 2, ACUTE],
    ['zioni', 2, ACUTE],
    ['mente', 3, ACUTE],
    ['mento', 3, ACUTE],
    ['menti', 3, ACUTE],
    ['uccio', 4, GRAVE],
    ['uccia', 4, GRAVE],
    ['accio', 4, GRAVE],
    ['accia', 4, GRAVE],
    ['ibile', 4, GRAVE],
    ['ibili', 4, GRAVE],
    ['abile', 4, GRAVE],
    ['abili', 4, GRAVE],
    ['evole', 4, ACUTE],
    ['evoli', 4, ACUTE],
    ['aggio', 4, GRAVE],
    ['avano', 4, GRAVE],
    ['evano', 4, ACUTE],
    ['ivano', 4, GRAVE],
    ['arono', 4, GRAVE],
    ['irono', 4, GRAVE],
    ['ezza', 3, ACUTE],
    ['ezze', 3, ACUTE],
    ['enza', 3, GRAVE],
    ['enze', 3, GRAVE],
    ['anza', 3, GRAVE],
    ['anze', 3, GRAVE],
    ['etto', 3, ACUTE],
    ['etta', 3, ACUTE],
    ['etti', 3, ACUTE],
    ['ette', 3, ACUTE],
    ['ismo', 3, GRAVE],
    ['ista', 3, GRAVE],
    ['isti', 3, GRAVE],
    ['ando', 3, GRAVE],
    ['endo', 3, GRAVE],
    ['acci', 3, GRAVE],
    ['acce', 3, GRAVE],
    ['aggi', 3, GRAVE],
    ['ione', 2, ACUTE],
    ['ioni', 2, ACUTE],
    ['tore', 2, ACUTE],
    ['tori', 2, ACUTE],
    ['iamo', 2, GRAVE],
    ['ato', 2, GRAVE],
    ['ata', 2, GRAVE],
    ['ati', 2, GRAVE],
    ['ate', 2, GRAVE],
    ['oso', 2, ACUTE],
    ['osa', 2, ACUTE],
    ['ose', 2, ACUTE],
    ['are', 2, GRAVE],
    ['ire', 2, GRAVE],
    ['ure', 2, GRAVE],
  ] as [string, number, string][]
).sort((a, b) => b[0].length - a[0].length);

/** The pronouns joined to the end of a verb, longest first: dimmelo, vederlo. */
const CLITICS = [
  ...['me', 'te', 'se', 'ce', 've', 'glie'].flatMap((a) =>
    ['lo', 'la', 'li', 'le', 'ne'].map((b) => a + b),
  ),
  ...['mi', 'ti', 'si', 'ci', 'vi', 'ne', 'lo', 'la', 'li', 'le', 'gli'],
].sort((a, b) => b.length - a.length);

/** Where a word's stress falls: the index of its vowel and the accent, or 'two' for àncora and ancóra. */
export type Stress = { index: number; mark: string } | 'two';

/** The list made by scripts/make-stress.ts, looked up by halving, without a string made per line. */
export class StressList {
  private readonly starts: Uint32Array;

  constructor(private readonly text: string) {
    let count = 0;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) count++;
    const starts = new Uint32Array(count + 1);
    let n = 0;
    let at = 0;
    while (at < text.length) {
      starts[n++] = at;
      const end = text.indexOf('\n', at);
      at = end === -1 ? text.length : end + 1;
    }
    this.starts = starts.subarray(0, n);
  }

  get size(): number {
    return this.starts.length;
  }

  /** The stress of a word in lowercase, if the list has it. */
  find(word: string): Stress | undefined {
    let low = 0;
    let high = this.starts.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const order = this.compare(word, this.starts[mid]!);
      if (order === 0) return this.read(this.starts[mid]! + word.length + 1);
      if (order < 0) high = mid - 1;
      else low = mid + 1;
    }
    return undefined;
  }

  /** The word against the one on the line that starts at the offset, which ends at a tab. */
  private compare(word: string, start: number): number {
    for (let i = 0; ; i++) {
      const a = i < word.length ? word.charCodeAt(i) : 9;
      const b = this.text.charCodeAt(start + i);
      if (a !== b) return a - b;
      if (a === 9) return 0;
    }
  }

  private read(at: number): Stress {
    if (this.text[at] === '-') return 'two';
    let index = 0;
    while (
      at < this.text.length &&
      this.text.charCodeAt(at) >= 48 &&
      this.text.charCodeAt(at) <= 57
    )
      index = index * 10 + this.text.charCodeAt(at++) - 48;
    return { index, mark: this.text[at] === 'a' ? ACUTE : GRAVE };
  }
}

/** The vowel groups of a word: each a run of vowels, as "au" in paura. */
function groups(word: string): number {
  let count = 0;
  let previous = false;
  for (const ch of word) {
    const vowel = VOWELS.includes(ch);
    if (vowel && !previous) count++;
    previous = vowel;
  }
  return count;
}

/** Whether a pronoun can be joined to the end of the word: an infinitive, a gerund, an imperative. */
function hostTakes(host: string, clitic: string): boolean {
  if (host.endsWith('r') || host.endsWith('ndo')) return true;
  if (clitic.length >= 4) return 'eio'.includes(host.at(-1)!);
  if (/(?:ate|ete|ite)$/.test(host)) return clitic !== 'si';
  // Fattosi, accortosi.
  return host.endsWith('to') && clitic === 'si';
}

/** The stress of a word in lowercase not in the list, when it can be told. */
export function guess(word: string, list: Pick<StressList, 'find'>): Stress | undefined {
  // Cut short: raccontar, venivan. Only when the full word gives one answer.
  if ('lnrm'.includes(word.at(-1)!)) {
    const found = ['e', 'o']
      .map((end) => list.find(word + end))
      .filter((s): s is Exclude<Stress, 'two'> => s !== undefined && s !== 'two')
      .filter((s) => s.index < word.length);
    if (found.length === 1 || (found.length === 2 && found[0]!.index === found[1]!.index))
      return found[0];
  }
  for (const [ending, back, mark] of ENDINGS)
    if (word.endsWith(ending) && word.length > ending.length + 1)
      return { index: word.length - 1 - back, mark };
  for (const clitic of CLITICS) {
    if (!word.endsWith(clitic)) continue;
    const host = word.slice(0, -clitic.length);
    if (host.length < 2 || !hostTakes(host, clitic)) continue;
    // Vederlo from vedere, porlo from porre.
    const full = host.endsWith('r') ? [host, `${host}e`, `${host}re`] : [host];
    for (const candidate of full) {
      const found = list.find(candidate);
      if (found === 'two') return undefined;
      if (found && found.index < host.length) return found;
    }
  }
  return undefined;
}

/**
 * Whether the list's stress is written on a word: on one of three vowel groups
 * or more, and on one of two where an i or u stressed beside another vowel
 * would be read as one syllable with it, as paùra or Marìa. On a shorter word
 * the voice is right on its own, and the list is left to find the verb in
 * "lasciami" and the like.
 */
function worthMarking(word: string, index: number): boolean {
  const count = groups(word);
  if (count >= 3) return true;
  if (count !== 2 || !'iu'.includes(word[index]!)) return false;
  const vowel = (i: number): boolean => i >= 0 && i < word.length && VOWELS.includes(word[i]!);
  return vowel(index - 1) || vowel(index + 1);
}

const WORD = /[\p{L}\p{M}]+/gu;
const ENDS_SENTENCE = '.!?…:;';
const OPENS = ` \t\n\r"'«»“”‘’()[]-–—`;

/** Whether the word at the offset starts a sentence: a capital there is no sign of a name. */
function startsSentence(text: string, at: number): boolean {
  let i = at - 1;
  while (i >= 0 && OPENS.includes(text[i]!)) i--;
  return i < 0 || ENDS_SENTENCE.includes(text[i]!);
}

/**
 * Writes the stress on the words of Italian text, already decomposed (NFKD):
 * after the vowel, a grave accent, or an acute one on a closed e or o. A word
 * with an accent of its own keeps it, and a word with a capital inside a
 * sentence, as a name, is marked only when the list has it.
 */
export function markStress(text: string, list: StressList): string {
  return text.replace(WORD, (token: string, at: number) => {
    if (!/^[A-Za-z]+$/.test(token)) return token;
    const word = token.toLowerCase();
    let stress = list.find(word);
    if (stress === undefined && groups(word) >= 3) {
      const plain = token === word || startsSentence(text, at);
      if (plain) stress = guess(word, list);
    }
    if (stress === undefined || stress === 'two' || !worthMarking(word, stress.index)) return token;
    return token.slice(0, stress.index + 1) + stress.mark + token.slice(stress.index + 1);
  });
}
