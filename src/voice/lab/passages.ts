/*
 * Short passages for the voice lab: a heading and a few paragraphs each, so
 * the pauses between pieces, paragraphs and the heading can be heard.
 * All are in the public domain, except the one written here for the text fixes.
 */
import type { Lang } from '../text';

export type PassageId = 'collodi' | 'manzoni' | 'dialogue' | 'fixes' | 'austen';

export interface Passage {
  title: string;
  lang: Lang;
  heading: string;
  paragraphs: readonly string[];
}

export const PASSAGES: Record<PassageId, Passage> = {
  collodi: {
    title: 'Collodi, Le avventure di Pinocchio (1883), I',
    lang: 'it',
    heading: 'Come andò che maestro Ciliegia trovò un pezzo di legno',
    paragraphs: [
      'C’era una volta…',
      '— Un re! — diranno subito i miei piccoli lettori.',
      '— No, ragazzi, avete sbagliato. C’era una volta un pezzo di legno.',
      'Non era un legno di lusso, ma un semplice pezzo da catasta, di quelli che d’inverno si mettono nelle stufe e nei caminetti per accendere il fuoco e per riscaldare le stanze.',
      'Non so come andasse, ma il fatto gli è che un bel giorno questo pezzo di legno capitò nella bottega di un vecchio falegname, il quale aveva nome mastr’Antonio, se non che tutti lo chiamavano maestro Ciliegia, per via della punta del suo naso, che era sempre lustra e paonazza, come una ciliegia matura.',
    ],
  },
  manzoni: {
    title: 'Manzoni, I promessi sposi (1840), I',
    lang: 'it',
    heading: 'Capitolo primo',
    paragraphs: [
      'Quel ramo del lago di Como, che volge a mezzogiorno, tra due catene non interrotte di monti, tutto a seni e a golfi, a seconda dello sporgere e del rientrare di quelli, vien, quasi a un tratto, a ristringersi, e a prender corso e figura di fiume, tra un promontorio a destra, e un’ampia costiera dall’altra parte.',
      'La costiera, formata dal deposito di tre grossi torrenti, scende appoggiata a due monti contigui, l’uno detto di san Martino, l’altro, con voce lombarda, il Resegone, dai molti suoi cocuzzoli in fila, che in vero lo fanno somigliare a una sega.',
      'Per una di queste stradicciole, tornava bel bello dalla passeggiata verso casa, sulla sera del giorno 7 novembre dell’anno 1628, don Abbondio, curato d’una delle terre accennate di sopra.',
    ],
  },
  dialogue: {
    title: 'Collodi, Le avventure di Pinocchio (1883), II',
    lang: 'it',
    heading: 'Maestro Ciliegia regala il pezzo di legno al suo amico Geppetto',
    paragraphs: [
      'In quel punto fu bussato alla porta.',
      '— Passate pure, — disse il falegname, senza aver la forza di rizzarsi in piedi.',
      '— Buon giorno, mastr’Antonio, — disse Geppetto. — Che cosa fate costì per terra?',
      '— Insegno l’abbaco alle formicole.',
      '— Buon pro vi faccia!',
      '— Chi vi ha portato da me, compar Geppetto?',
      '— Le gambe. Sappiate, mastr’Antonio, che son venuto da voi, per chiedervi un favore.',
    ],
  },
  fixes: {
    title: 'Written for the lab: abbreviations and Roman numerals',
    lang: 'it',
    heading: 'Capitolo XIV',
    paragraphs: [
      'Il sig. Rossi entrò nello studio del prof. Bianchi con una borsa piena di lettere, ricevute, fotografie ecc. e la posò sul tavolo senza dire una parola.',
      'La sig.ra Rossi, che lo aspettava fuori, aveva letto tutto il Libro III e metà della Parte II, ma non aveva trovato nulla di quello che il dott. Neri le aveva promesso (cfr. la lettera del giorno prima).',
      'Alcune cose, p. es. la data del contratto, non tornavano. Il resto lo sapeva già: debiti, promesse, silenzi ecc.',
    ],
  },
  austen: {
    title: 'Austen, Pride and Prejudice (1813), 1',
    lang: 'en',
    heading: 'Chapter 1',
    paragraphs: [
      'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
      'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.',
      '“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”',
      'Mr. Bennet replied that he had not.',
      '“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”',
      'Mr. Bennet made no answer.',
    ],
  },
};

/** The passage as a chapter document, so it splits into pieces as a book would. */
export function passageDocument({ lang, heading, paragraphs }: Passage): Document {
  const doc = document.implementation.createHTMLDocument('');
  doc.documentElement.lang = lang;
  const h2 = doc.createElement('h2');
  h2.textContent = heading;
  doc.body.append(h2);
  for (const text of paragraphs) {
    const p = doc.createElement('p');
    p.textContent = text;
    doc.body.append(p);
  }
  return doc;
}
