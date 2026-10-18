// Builds src/voice/stress-it.txt, where the stress falls in Italian words, for
// the voice, which reads "epoca" as epòca unless it is written època. The
// source is Wiktionary, as extracted by Wiktextract and published by kaikki.org
// (CC BY-SA 4.0): download the Italian dump, about 770 MB, from
// https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl
//
//   npx tsx scripts/make-stress.ts <dump.jsonl>
//
// Each line is a word without accents, a tab, and the index of its stressed
// vowel, followed by "a" when the accent is acute (perché, not perchè), or "-"
// when the word is stressed in two places with nothing to choose between them,
// as àncora and ancóra. A word stressed on its last vowel is written with its
// accent already and is left out, as are words of one vowel group.
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const OUT = 'src/voice/stress-it.txt';
const MARKS: Record<string, 'g' | 'a'> = { '̀': 'g', '́': 'a' };
const VOWELS = new Set('aeiouy');
const INFLECTED = ['plural', 'feminine', 'masculine'];
const NOT_INFLECTED = [
  'superlative',
  'diminutive',
  'augmentative',
  'pejorative',
  'endearing',
  'alternative',
  'apocopic',
  'archaic',
  'obsolete',
  'abbreviation',
];
const RARE = [
  'archaic',
  'obsolete',
  'literary',
  'poetic',
  'dialectal',
  'rare',
  'uncommon',
  'alternative',
  'traditional',
];
const NOT_WORDS = [
  'name',
  'prefix',
  'suffix',
  'abbrev',
  'symbol',
  'character',
  'phrase',
  'proverb',
];
const NOT_FORMS = ['table-tags', 'inflection-template', 'auxiliary', 'romanization'];

interface Form {
  form?: string;
  tags?: string[];
}
interface Entry {
  lang_code?: string;
  word?: string;
  pos?: string;
  senses?: { form_of?: unknown[]; tags?: string[] }[];
  hyphenations?: { parts?: string[] }[];
  forms?: Form[];
}
/** A word without its accent, the index of its stressed vowel, and the accent. */
type Stressed = [plain: string, index: number, mark: 'g' | 'a'];

const has = (tags: readonly string[] | undefined, among: readonly string[]): boolean =>
  (tags ?? []).some((t) => among.includes(t));

/** A word written with one accent, taken apart; null when it has none, or more than one. */
function parse(accented: string): Stressed | null {
  const plain: string[] = [];
  const found: [number, 'g' | 'a'][] = [];
  for (const ch of accented.toLowerCase().normalize('NFKD')) {
    const mark = MARKS[ch];
    if (mark) {
      if (!VOWELS.has(plain.at(-1) ?? '')) return null;
      found.push([plain.length - 1, mark]);
    } else {
      plain.push(ch);
    }
  }
  const word = plain.join('');
  if (found.length !== 1 || !/^[a-z]+$/.test(word)) return null;
  return [word, ...found[0]!];
}

/**
 * How sure a reading is, 1 the surest: a headword's own, then a form listed
 * under another word, then an imperative or subjunctive, then a rare form or a
 * regular form guessed. Of two readings of a word, the surer wins, so the verb
 * tenére comes before tènere, the plural of the adjective tènero.
 */
function formRank(tags: readonly string[] | undefined): number {
  return has(tags, RARE) ? 4 : has(tags, ['imperative', 'subjunctive']) ? 3 : 2;
}

/** For each word, how often each reading was seen: "index,mark,rank" to a count. */
const seen = new Map<string, Map<string, number>>();
function see(word: string, index: number, mark: string, rank: number): void {
  let readings = seen.get(word);
  if (!readings) seen.set(word, (readings = new Map()));
  const key = `${index},${mark},${rank}`;
  readings.set(key, (readings.get(key) ?? 0) + 1);
}

const lemmas: [Stressed, string, number][] = [];
const guessed: [string, number, string, number][] = [];

const path = process.argv[2];
if (!path) throw new Error('Usage: npx tsx scripts/make-stress.ts <dump.jsonl>');
const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
for await (const line of lines) {
  const e = JSON.parse(line) as Entry;
  if (e.lang_code !== 'it') continue;
  const word = (e.word ?? '').toLowerCase().normalize('NFKD');
  const senses = e.senses ?? [];
  let rank = NOT_WORDS.includes(e.pos ?? '') ? 4 : 1;
  const formsOf = senses.filter((s) => s.form_of);
  if (rank === 1 && formsOf.length > 0 && formsOf.length === senses.length)
    rank = Math.min(...formsOf.map((s) => formRank(s.tags)));
  const heads: Stressed[] = [];
  for (const h of e.hyphenations ?? []) {
    const r = parse((h.parts ?? []).join('').replaceAll('‧', ''));
    if (r && r[0] === word) heads.push(r);
  }
  const head = heads[0];
  if (head) see(head[0], head[1], head[2], rank);
  for (const fm of e.forms ?? []) {
    if (has(fm.tags, NOT_FORMS)) continue;
    const r = parse(fm.form ?? '');
    if (r) {
      see(r[0], r[1], r[2], formRank(fm.tags));
      // A past participle in -o also takes -a, -i, -e: entrato, entrata, entrati, entrate.
      const tags = fm.tags ?? [];
      if (tags.includes('participle') && tags.includes('past') && r[0].endsWith('o'))
        if (r[1] < r[0].length - 1)
          for (const end of 'aie') guessed.push([r[0].slice(0, -1) + end, r[1], r[2], 2]);
    } else if (head && has(fm.tags, INFLECTED) && !has(fm.tags, NOT_INFLECTED)) {
      lemmas.push([head, fm.form ?? '', rank]);
    }
  }
  // A noun or adjective listed without its forms: the regular ones, below anything listed.
  if (
    head &&
    (e.pos === 'noun' || e.pos === 'adj') &&
    !(e.forms ?? []).some((fm) => has(fm.tags, INFLECTED))
  ) {
    const [p, i, m] = head;
    if (i < p.length - 1) {
      const adj = e.pos === 'adj';
      const ends = { o: adj ? 'aie' : 'i', a: adj ? 'e' : 'ei', e: 'i' }[p.at(-1)!] ?? '';
      for (const end of ends) guessed.push([p.slice(0, -1) + end, i, m, 4]);
    }
  }
}

// An inflected form written plain takes its headword's stress: cùpola, cùpole.
for (const [[p, i, m], form, rank] of lemmas) {
  const f = form.toLowerCase().normalize('NFKD');
  if (
    /^[a-z]+$/.test(f) &&
    f.slice(0, i + 1) === p.slice(0, i + 1) &&
    Math.abs(f.length - p.length) <= 2
  )
    see(f, i, m, Math.max(rank, 2));
}
for (const [p, i, m, rank] of guessed) see(p, i, m, rank);

function groups(word: string): number {
  let count = 0;
  let previous = false;
  for (const ch of word) {
    const vowel = VOWELS.has(ch);
    if (vowel && !previous) count++;
    previous = vowel;
  }
  return count;
}

const out: string[] = [];
let ambiguous = 0;
for (const [word, readings] of seen) {
  // The surest rank at each place the stress can fall but the last.
  const best = new Map<number, number>();
  for (const key of readings.keys()) {
    const [i, , rank] = key.split(',');
    const index = Number(i);
    if (index < word.length - 1) best.set(index, Math.min(best.get(index) ?? 9, Number(rank)));
  }
  // Two-syllable words too, which the voice does not mark but finds a pronoun's host in: lasciami.
  if (best.size === 0 || groups(word) < 2) continue;
  const surest = Math.min(...best.values());
  const top = [...best].filter(([, rank]) => rank === surest).map(([index]) => index);
  if (top.length > 1) {
    out.push(`${word}\t-`);
    ambiguous++;
    continue;
  }
  const index = top[0]!;
  // The accent seen most often there.
  const marks = new Map<string, number>();
  for (const [key, count] of readings) {
    const [i, mark] = key.split(',');
    if (Number(i) === index) marks.set(mark!, (marks.get(mark!) ?? 0) + count);
  }
  const mark = [...marks].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  out.push(`${word}\t${index}${mark === 'a' ? 'a' : ''}`);
}
// Sorted by code unit, as the voice looks a word up by halving.
out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
writeFileSync(OUT, `${out.join('\n')}\n`);
console.log(`${out.length} words, ${ambiguous} of them stressed in two places, into ${OUT}`);
