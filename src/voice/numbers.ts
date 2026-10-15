/*
 * Numbers spelt out as words, so the voice reads "1848" as a year and "3,5"
 * as a decimal instead of guessing digit by digit.
 */
import type { Lang } from './text';

const UNITS_IT = [
  'zero',
  'uno',
  'due',
  'tre',
  'quattro',
  'cinque',
  'sei',
  'sette',
  'otto',
  'nove',
  'dieci',
  'undici',
  'dodici',
  'tredici',
  'quattordici',
  'quindici',
  'sedici',
  'diciassette',
  'diciotto',
  'diciannove',
];
const TENS_IT = [
  '',
  '',
  'venti',
  'trenta',
  'quaranta',
  'cinquanta',
  'sessanta',
  'settanta',
  'ottanta',
  'novanta',
];
const ORDINALS_IT = [
  '',
  'primo',
  'secondo',
  'terzo',
  'quarto',
  'quinto',
  'sesto',
  'settimo',
  'ottavo',
  'nono',
  'decimo',
];

/** Below a thousand, as one word: "ventitré", "centottanta". */
function hundredsIt(n: number): string {
  if (n < 20) return UNITS_IT[n]!;
  if (n < 100) {
    const tens = TENS_IT[Math.floor(n / 10)]!;
    const unit = n % 10;
    if (unit === 0) return tens;
    // "venti" + "uno" is "ventuno", and a final "tre" takes its accent.
    const word = unit === 3 ? 'tré' : UNITS_IT[unit]!;
    return (unit === 1 || unit === 8 ? tens.slice(0, -1) : tens) + word;
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 1 ? 'cento' : `${UNITS_IT[hundreds]}cento`;
  if (rest === 0) return head;
  // "cento" + "ottanta" is "centottanta".
  return (Math.floor(rest / 10) === 8 ? head.slice(0, -1) : head) + hundredsIt(rest);
}

/** A whole number in Italian words, up to the billions. */
export function cardinalIt(n: number): string {
  if (n < 1000) return hundredsIt(n);
  const words: string[] = [];
  for (const [size, one, many] of [
    [1e9, 'un miliardo', 'miliardi'],
    [1e6, 'un milione', 'milioni'],
  ] as const) {
    const count = Math.floor(n / size);
    if (count > 0) {
      words.push(count === 1 ? one : `${cardinalIt(count).replace(/uno$/, 'un')} ${many}`);
      n %= size;
    }
  }
  let small = '';
  const thousands = Math.floor(n / 1000);
  if (thousands === 1) small = 'mille';
  else if (thousands > 1) small = `${hundredsIt(thousands).replace(/uno$/, 'un')}mila`;
  const rest = n % 1000;
  if (rest > 0) small += hundredsIt(rest);
  if (small) words.push(small);
  return words.join(' ');
}

/** An Italian ordinal, masculine or feminine: "primo", "ventitreesima". */
export function ordinalIt(n: number, feminine = false): string {
  let word: string;
  if (n <= 10) word = ORDINALS_IT[n]!;
  else {
    const cardinal = cardinalIt(n);
    if (cardinal.endsWith('tré')) word = `${cardinal.slice(0, -1)}eesimo`;
    else if (cardinal.endsWith('sei')) word = `${cardinal}esimo`;
    else word = `${cardinal.slice(0, -1)}esimo`;
  }
  return feminine ? `${word.slice(0, -1)}a` : word;
}

const UNITS_EN = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS_EN = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

function hundredsEn(n: number): string {
  if (n < 20) return UNITS_EN[n]!;
  if (n < 100) {
    const unit = n % 10;
    return TENS_EN[Math.floor(n / 10)]! + (unit ? `-${UNITS_EN[unit]}` : '');
  }
  const rest = n % 100;
  const head = `${UNITS_EN[Math.floor(n / 100)]} hundred`;
  return rest ? `${head} and ${hundredsEn(rest)}` : head;
}

/** A whole number in English words, up to the billions. */
export function cardinalEn(n: number): string {
  if (n < 1000) return hundredsEn(n);
  const words: string[] = [];
  for (const [size, name] of [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ] as const) {
    const count = Math.floor(n / size);
    if (count > 0) {
      words.push(`${hundredsEn(count)} ${name}`);
      n %= size;
    }
  }
  if (n > 0) words.push(n < 100 ? `and ${hundredsEn(n)}` : hundredsEn(n));
  return words.join(' ');
}

/** A year the way it is said: "eighteen forty-eight", "two thousand and five". */
export function yearEn(n: number): string {
  const century = Math.floor(n / 100);
  const rest = n % 100;
  if (n >= 2000 && n < 2010) return cardinalEn(n);
  if (rest === 0) return `${hundredsEn(century)} hundred`;
  return `${hundredsEn(century)} ${rest < 10 ? `oh ${UNITS_EN[rest]}` : hundredsEn(rest)}`;
}

const ORDINAL_WORDS_EN: Record<string, string> = {
  one: 'first',
  two: 'second',
  three: 'third',
  five: 'fifth',
  eight: 'eighth',
  nine: 'ninth',
  twelve: 'twelfth',
};

/** An English ordinal: "first", "twenty-second", "one hundredth". */
export function ordinalEn(n: number): string {
  return cardinalEn(n).replace(/[a-z]+$/, (last) => {
    if (ORDINAL_WORDS_EN[last]) return ORDINAL_WORDS_EN[last];
    if (last.endsWith('y')) return `${last.slice(0, -1)}ieth`;
    return `${last}th`;
  });
}

/** The longest run of digits read as one number; longer ones are read digit by digit. */
const LONGEST = 12;

function digitsOf(digits: string, lang: Lang): string {
  const units = lang === 'it' ? UNITS_IT : UNITS_EN;
  return [...digits].map((d) => units[Number(d)]).join(' ');
}

/** A whole number written in digits, or its digits one by one when there are too many. */
function wholeOf(digits: string, lang: Lang): string {
  if (digits.length > LONGEST || (digits.length > 1 && digits.startsWith('0'))) {
    return digitsOf(digits, lang);
  }
  const n = Number(digits);
  return lang === 'it' ? cardinalIt(n) : cardinalEn(n);
}

/** What follows the decimal mark: "virgola quattordici", "point one four". */
function fractionOf(digits: string, lang: Lang): string {
  if (lang === 'en') return digitsOf(digits, lang);
  const zeros = digits.match(/^0*/)![0];
  const rest = digits.slice(zeros.length);
  const words = [...zeros].map(() => 'zero');
  if (rest) words.push(rest.length <= 3 ? cardinalIt(Number(rest)) : digitsOf(rest, lang));
  return words.join(' ');
}

// A number stands alone: no letter or digit glued to either side.
const BEFORE = '(?<![\\p{L}\\p{N}])';
const AFTER = '(?![\\p{L}\\p{N}])';
// Thousands grouped by a full stop or a thin or hard space in Italian, by a comma in English.
const GROUPED: Record<Lang, string> = {
  it: '\\d{1,3}(?:[.\\u00a0\\u202f]\\d{3})+',
  en: '\\d{1,3}(?:[,\\u00a0\\u202f]\\d{3})+',
};
const DECIMAL_MARK: Record<Lang, string> = { it: ',', en: '\\.' };

/** A currency's names, one and many, then its hundredth's, then "un" or "una" before it in Italian. */
const CURRENCY: Record<string, Record<Lang, [string, string, string, string, string?]>> = {
  '€': {
    it: ['euro', 'euro', 'centesimo', 'centesimi', 'un'],
    en: ['euro', 'euros', 'cent', 'cents'],
  },
  $: {
    it: ['dollaro', 'dollari', 'centesimo', 'centesimi', 'un'],
    en: ['dollar', 'dollars', 'cent', 'cents'],
  },
  '£': {
    it: ['sterlina', 'sterline', 'penny', 'pence', 'una'],
    en: ['pound', 'pounds', 'penny', 'pence'],
  },
};

/** Spells out the numbers of a piece in its language's words. */
export function spellNumbers(text: string, lang: Lang): string {
  const it = lang === 'it';
  const number = `(${GROUPED[lang]}|\\d+)(?:${DECIMAL_MARK[lang]}(\\d+))?`;
  const read = (whole: string, fraction?: string): string => {
    const words = wholeOf(whole.replace(/[^\d]/g, ''), lang);
    if (fraction === undefined) return words;
    return `${words} ${it ? 'virgola' : 'point'} ${fractionOf(fraction, lang)}`;
  };

  // Ordinals: "1°", "2ª", "21st", but not the degrees of "20 °C".
  if (it) {
    text = text.replace(
      new RegExp(`${BEFORE}(\\d{1,6})\\s?([°ºª])(?!\\s?[CF](?!\\p{L}))`, 'gu'),
      (_, n: string, mark: string) => ordinalIt(Number(n), mark === 'ª'),
    );
  } else {
    text = text.replace(
      new RegExp(`${BEFORE}(\\d{1,6})(?:st|nd|rd|th)${AFTER}`, 'gu'),
      (_, n: string) => ordinalEn(Number(n)),
    );
  }

  // Money, with the sign before or after: "€ 5", "5€", "$3.50".
  text = text.replace(
    new RegExp(`([€$£])\\s?${number}${AFTER}|${BEFORE}${number}\\s?([€$£])`, 'gu'),
    (_, before?: string, w1?: string, f1?: string, w2?: string, f2?: string, after?: string) => {
      const sign = (before ?? after)!;
      const whole = (w1 ?? w2)!;
      const fraction = f1 ?? f2;
      const [one, many, hundredth, hundredths, article] = CURRENCY[sign]![lang];
      const amount = (digits: string, single: string, plural: string): string => {
        if (digits.replace(/\D/g, '') !== '1') return `${read(digits)} ${plural}`;
        return `${it ? article : 'one'} ${single}`;
      };
      // Two decimals are its hundredths: "tre euro e cinquanta", "three dollars and fifty cents".
      if (fraction === undefined || /^\d\d$/.test(fraction)) {
        const head = amount(whole, one, many);
        if (fraction === undefined || fraction === '00') return head;
        const cents = String(Number(fraction));
        if (it) return `${head} e ${cardinalIt(Number(cents))}`;
        return `${head} and ${amount(cents, hundredth, hundredths)}`;
      }
      return `${read(whole, fraction)} ${many}`;
    },
  );

  // Percentages.
  text = text.replace(
    new RegExp(`${BEFORE}${number}\\s?%`, 'gu'),
    (_, whole: string, fraction?: string) =>
      `${read(whole, fraction)} ${it ? 'per cento' : 'percent'}`,
  );

  // Times: "10:30" in English, "10:30" or "10.30" in Italian.
  text = text.replace(
    new RegExp(`${BEFORE}([01]?\\d|2[0-3])${it ? '[:.]' : ':'}([0-5]\\d)${AFTER}`, 'gu'),
    (_, h: string, m: string) => {
      const hours = Number(h);
      const minutes = Number(m);
      if (it) return minutes ? `${cardinalIt(hours)} e ${cardinalIt(minutes)}` : cardinalIt(hours);
      if (!minutes) return `${cardinalEn(hours)} o'clock`;
      return `${cardinalEn(hours)} ${minutes < 10 ? `oh ${UNITS_EN[minutes]}` : cardinalEn(minutes)}`;
    },
  );

  // Every other number; an English four-digit one from 1100 to 2099 is a year.
  return text.replace(
    new RegExp(`${BEFORE}${number}${AFTER}`, 'gu'),
    (_, whole: string, fraction?: string) => {
      if (!it && fraction === undefined && /^(1[1-9]|20)\d\d$/.test(whole))
        return yearEn(Number(whole));
      return read(whole, fraction);
    },
  );
}
