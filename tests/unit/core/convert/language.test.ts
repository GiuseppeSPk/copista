import { describe, expect, it } from 'vitest';
import { guessLanguage } from '../../../../src/core/convert/language';

const ITALIAN =
  '<p>C’era una volta un pezzo di legno. Non era un legno di lusso, ma un semplice pezzo da ' +
  'catasta, di quelli che d’inverno si mettono nelle stufe e nei caminetti per accendere il ' +
  'fuoco e per riscaldare le stanze.</p><p>Non so come andasse, ma il fatto gli è che un bel ' +
  'giorno questo pezzo di legno capitò nella bottega di un vecchio falegname, il quale aveva ' +
  'nome mastr’Antonio, se non che tutti lo chiamavano maestro Ciliegia, per via della punta ' +
  'del suo naso, che era sempre lustra e paonazzina, come una ciliegia matura.</p>';

const ENGLISH =
  '<p>It is a truth universally acknowledged, that a single man in possession of a good ' +
  'fortune, must be in want of a wife.</p><p>However little known the feelings or views of ' +
  'such a man may be on his first entering a neighbourhood, this truth is so well fixed in ' +
  'the minds of the surrounding families, that he is considered the rightful property of ' +
  'some one or other of their daughters, and it was not to be argued with.</p>';

const FRENCH =
  '<p>Quand il était petit, le garçon vivait dans une maison au bord de la mer avec sa mère ' +
  'et son chien. Il ne savait pas lire, mais il aimait les livres qui parlaient des bateaux ' +
  'et des étoiles.</p><p>Chaque soir, sa mère lui racontait une histoire pour qu’il puisse ' +
  'dormir, et le chien se couchait sur le tapis près du lit. Ce sont les souvenirs les plus ' +
  'doux de sa vie, et elle les garde avec soin.</p>';

describe('guessLanguage', () => {
  it('names the language of a page of prose', () => {
    expect(guessLanguage(ITALIAN)).toBe('it');
    expect(guessLanguage(ENGLISH)).toBe('en');
    expect(guessLanguage(FRENCH)).toBe('fr');
  });

  it('makes no guess from a few words', () => {
    expect(guessLanguage('<p>Ciao a tutti, e grazie.</p>')).toBeUndefined();
    expect(guessLanguage('')).toBeUndefined();
  });
});
