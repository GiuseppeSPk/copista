import { describe, expect, it } from 'vitest';
import { StressList, guess, markStress } from '../../../src/voice/stress';
import { preprocessText } from '../../../src/voice/supertonic';

const GRAVE = String.fromCharCode(0x300);
const ACUTE = String.fromCharCode(0x301);

// A few lines in the format of src/voice/stress-it.txt, sorted as it is.
const LIST = new StressList(
  [
    'ancora\t-',
    'capitare\t-',
    'cupola\t1',
    'epoca\t0',
    'fatto\t1',
    'isola\t0',
    'lontana\t4',
    'macchina\t1',
    'paura\t2',
    'raccontare\t6',
    'tenere\t3a',
    'una\t0',
    'vedere\t3a',
  ]
    .sort()
    .join('\n') + '\n',
);

describe('StressList', () => {
  it('finds a word, its accent, and a word stressed in two places', () => {
    expect(LIST.size).toBe(13);
    expect(LIST.find('epoca')).toEqual({ index: 0, mark: GRAVE });
    expect(LIST.find('tenere')).toEqual({ index: 3, mark: ACUTE });
    expect(LIST.find('ancora')).toBe('two');
  });

  it('finds nothing for a word not in it, nor for one only begun or run on', () => {
    expect(LIST.find('casa')).toBeUndefined();
    expect(LIST.find('epo')).toBeUndefined();
    expect(LIST.find('epocale')).toBeUndefined();
    expect(LIST.find('')).toBeUndefined();
  });
});

describe('guess', () => {
  it('takes the stress from an ending', () => {
    expect(guess('gridarono', LIST)).toEqual({ index: 4, mark: GRAVE });
    expect(guess('rossetti', LIST)).toEqual({ index: 4, mark: ACUTE });
  });

  it('takes it from the word cut short', () => {
    expect(guess('raccontar', LIST)).toEqual({ index: 6, mark: GRAVE });
  });

  it('takes it from the verb a pronoun is joined to', () => {
    expect(guess('vederlo', LIST)).toEqual({ index: 3, mark: ACUTE });
    expect(guess('fattosi', LIST)).toEqual({ index: 1, mark: GRAVE });
  });

  it('gives up on a verb stressed in two places, and on a word it cannot tell', () => {
    expect(guess('capitarlo', LIST)).toBeUndefined();
    expect(guess('tavolino', LIST)).toBeUndefined();
  });
});

describe('markStress', () => {
  it('writes the stress on the words the voice gets wrong', () => {
    expect(markStress("Era un'epoca: la cupola e la macchina.", LIST)).toBe(
      `Era un'e${GRAVE}poca: la cu${GRAVE}pola e la ma${GRAVE}cchina.`,
    );
    expect(markStress("Finalmente l'isola.", LIST)).toBe(`Finalme${ACUTE}nte l'i${GRAVE}sola.`);
  });

  it('writes an acute accent on a closed e, and keeps the case', () => {
    expect(markStress('Tenere EPOCA', LIST)).toBe(`Tene${ACUTE}re E${GRAVE}POCA`);
  });

  it('guesses a word not in the list', () => {
    expect(markStress('Tutti gridarono, e fattosi coraggio volle vederlo.', LIST)).toBe(
      `Tutti grida${GRAVE}rono, e fa${GRAVE}ttosi cora${GRAVE}ggio volle vede${ACUTE}rlo.`,
    );
  });

  it('leaves a word stressed in two places, and one with its own accent', () => {
    expect(markStress('ancora', LIST)).toBe('ancora');
    expect(markStress(`l'e${GRAVE}poca`, LIST)).toBe(`l'e${GRAVE}poca`);
  });

  it('guesses a capital only at the start of a sentence, where it is no sign of a name', () => {
    expect(markStress('Arrivò il Rossetti.', LIST)).toBe('Arrivò il Rossetti.');
    expect(markStress('Rossetti arrivò. «Rossetti!»', LIST)).toBe(
      `Rosse${ACUTE}tti arrivò. «Rosse${ACUTE}tti!»`,
    );
    expect(markStress('e la Macchina', LIST)).toBe(`e la Ma${GRAVE}cchina`);
  });

  it('marks a word of two syllables only where i or u is stressed beside a vowel', () => {
    expect(markStress('la paura di una', LIST)).toBe(`la pau${GRAVE}ra di una`);
  });
});

describe('preprocessText', () => {
  it('writes the stress when asked and given the list', () => {
    expect(preprocessText("Un'epoca lontana", 'it', ['stress'], LIST)).toBe(
      `<it>Un'e${GRAVE}poca lonta${GRAVE}na.</it>`,
    );
    expect(preprocessText("Un'epoca lontana", 'it', ['stress'])).toBe("<it>Un'epoca lontana.</it>");
    expect(preprocessText("Un'epoca lontana", 'it', [], LIST)).toBe("<it>Un'epoca lontana.</it>");
    expect(preprocessText('An epoca', 'en', ['stress'], LIST)).toBe('<en>An epoca.</en>');
  });
});
