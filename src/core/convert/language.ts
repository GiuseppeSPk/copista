/**
 * Frequent short words of each language, left out where two of these
 * languages share them (Italian and French "il", Spanish and German "es").
 */
const WORDS: Record<string, string[]> = {
  it: 'e di che non per una della del gli sono nel anche come questo è ha più alla'.split(' '),
  en: 'the and of to is that was with for he his you not are this but have it'.split(' '),
  fr: 'le les des est et une dans pas qui du sur au avec ce sont je mais elle pour'.split(' '),
  es: 'el los las y por pero su fue está muy sus hay para como yo más'.split(' '),
  de: 'der die und das ist nicht ein eine zu den mit sich auf ich von dem auch es sie war'.split(
    ' ',
  ),
};

const LANGUAGE_OF = new Map(
  Object.entries(WORDS).flatMap(([language, words]) => words.map((w) => [w, language] as const)),
);

/** How much of a long book to read; the opening pages are enough. */
const SAMPLE = 50_000;
/** Fewer frequent words than this, about forty words of prose, is too little to tell. */
const ENOUGH = 12;

/**
 * Guesses whether HTML text is Italian, English, French, Spanish or German
 * from its commonest words. Undefined when the text is too short or no
 * language clearly leads, so the caller keeps its own default.
 */
export function guessLanguage(html: string): string | undefined {
  const text = html
    .slice(0, SAMPLE)
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase();
  const counts = new Map<string, number>();
  for (const [word] of text.matchAll(/\p{L}+/gu)) {
    const language = LANGUAGE_OF.get(word);
    if (language !== undefined) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  const [first, second] = [...counts].sort((a, b) => b[1] - a[1]);
  if (first === undefined || first[1] < ENOUGH || first[1] < 2 * (second?.[1] ?? 0))
    return undefined;
  return first[0];
}
