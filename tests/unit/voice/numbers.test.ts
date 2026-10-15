import { describe, expect, it } from 'vitest';
import {
  cardinalEn,
  cardinalIt,
  ordinalEn,
  ordinalIt,
  spellNumbers,
  yearEn,
} from '../../../src/voice/numbers';
import { preprocessText } from '../../../src/voice/supertonic';

describe('Italian numbers', () => {
  it('spells whole numbers as one word, with the elisions and the accent', () => {
    expect(cardinalIt(0)).toBe('zero');
    expect(cardinalIt(17)).toBe('diciassette');
    expect(cardinalIt(21)).toBe('ventuno');
    expect(cardinalIt(23)).toBe('ventitré');
    expect(cardinalIt(28)).toBe('ventotto');
    expect(cardinalIt(100)).toBe('cento');
    expect(cardinalIt(180)).toBe('centottanta');
    expect(cardinalIt(1000)).toBe('mille');
    expect(cardinalIt(1848)).toBe('milleottocentoquarantotto');
    expect(cardinalIt(2024)).toBe('duemilaventiquattro');
    expect(cardinalIt(21000)).toBe('ventunmila');
    expect(cardinalIt(1_000_000)).toBe('un milione');
    expect(cardinalIt(2_300_000)).toBe('due milioni trecentomila');
    expect(cardinalIt(21_000_000)).toBe('ventun milioni');
    expect(cardinalIt(3_000_000_000)).toBe('tre miliardi');
  });

  it('makes ordinals, masculine and feminine', () => {
    expect(ordinalIt(1)).toBe('primo');
    expect(ordinalIt(2, true)).toBe('seconda');
    expect(ordinalIt(11)).toBe('undicesimo');
    expect(ordinalIt(23)).toBe('ventitreesimo');
    expect(ordinalIt(26)).toBe('ventiseiesimo');
    expect(ordinalIt(100)).toBe('centesimo');
  });

  it('reads the numbers of a sentence', () => {
    expect(spellNumbers('Nel 1848 aveva 21 anni.', 'it')).toBe(
      'Nel milleottocentoquarantotto aveva ventuno anni.',
    );
    expect(spellNumbers('Il 1° gennaio e la 2ª edizione', 'it')).toBe(
      'Il primo gennaio e la seconda edizione',
    );
    expect(spellNumbers('1.000 lire e 3,5 chili', 'it')).toBe(
      'mille lire e tre virgola cinque chili',
    );
    expect(spellNumbers('pi greco è 3,14 e 0,05', 'it')).toBe(
      'pi greco è tre virgola quattordici e zero virgola zero cinque',
    );
    expect(spellNumbers('il 30% in più', 'it')).toBe('il trenta per cento in più');
    expect(spellNumbers('alle 10:30 o alle 9.00', 'it')).toBe('alle dieci e trenta o alle nove');
  });

  it('reads money with its currency', () => {
    expect(spellNumbers('costa 5 €', 'it')).toBe('costa cinque euro');
    expect(spellNumbers('costa €1', 'it')).toBe('costa un euro');
    expect(spellNumbers('costa 3,50€', 'it')).toBe('costa tre euro e cinquanta');
    expect(spellNumbers('£ 1', 'it')).toBe('una sterlina');
  });

  it('leaves alone what is not a number to say', () => {
    expect(spellNumbers('fa 20 °C', 'it')).toBe('fa venti °C');
    expect(spellNumbers('H2O e mp3', 'it')).toBe('H2O e mp3');
    expect(spellNumbers('Capitolo XIV', 'it')).toBe('Capitolo XIV');
    // A long run of digits, or one that starts with a nought, is read digit by digit.
    expect(spellNumbers('tel. 0115', 'it')).toBe('tel. zero uno uno cinque');
  });
});

describe('English numbers', () => {
  it('spells whole numbers, with "and" after the hundreds', () => {
    expect(cardinalEn(21)).toBe('twenty-one');
    expect(cardinalEn(105)).toBe('one hundred and five');
    expect(cardinalEn(1005)).toBe('one thousand and five');
    expect(cardinalEn(2_300_000)).toBe('two million three hundred thousand');
  });

  it('reads years and ordinals the way they are said', () => {
    expect(yearEn(1848)).toBe('eighteen forty-eight');
    expect(yearEn(1905)).toBe('nineteen oh five');
    expect(yearEn(1900)).toBe('nineteen hundred');
    expect(yearEn(2005)).toBe('two thousand and five');
    expect(yearEn(2024)).toBe('twenty twenty-four');
    expect(ordinalEn(1)).toBe('first');
    expect(ordinalEn(22)).toBe('twenty-second');
    expect(ordinalEn(20)).toBe('twentieth');
    expect(ordinalEn(100)).toBe('one hundredth');
  });

  it('reads the numbers of a sentence', () => {
    expect(spellNumbers('In 1848, 300 men came on the 3rd.', 'en')).toBe(
      'In eighteen forty-eight, three hundred men came on the third.',
    );
    expect(spellNumbers('1,000 miles, 3.5 hours', 'en')).toBe(
      'one thousand miles, three point five hours',
    );
    expect(spellNumbers('$3.50 or £1, 40%', 'en')).toBe(
      'three dollars and fifty cents or one pound, forty percent',
    );
    expect(spellNumbers('at 10:05 and 6:00', 'en')).toBe("at ten oh five and six o'clock");
  });
});

describe('preprocessText with numbers', () => {
  it('spells the numbers before the text is normalised', () => {
    expect(preprocessText('la 2ª volta', 'it', ['numbers'])).toBe('<it>la seconda volta.</it>');
    expect(preprocessText('la 2ª volta', 'it')).toBe('<it>la 2a volta.</it>');
  });
});
