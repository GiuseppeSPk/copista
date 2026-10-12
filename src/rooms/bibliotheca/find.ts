import { getSetting, putSetting } from '../../storage/db';
import type { ShelfBook } from './index';

/** How the shelf is ordered: as added (newest first), by title, or by author's surname. */
export type ShelfOrder = 'added' | 'title' | 'author';

export const SHELF_ORDERS: readonly ShelfOrder[] = ['added', 'title', 'author'];

const ORDER_SETTING = 'shelfOrder';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Articles a title is not filed under, as in a library catalogue. */
const ARTICLE = /^(the|an?|il|lo|la|i|gli|le|les|un|uno|una|el|los|las|der|die|das)\s+|^l['’]\s*/i;

/** Lower case without accents, so "Città" is found by "citta". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** "Poe, Edgar Allan" and "Edgar Allan Poe" both file under Poe. */
export function surnameOf(author: string): string {
  const name = author.trim();
  const comma = name.indexOf(',');
  if (comma > 0) return name.slice(0, comma).trim();
  return name.split(/\s+/).at(-1) ?? '';
}

function titleKey(book: ShelfBook): string {
  return book.title.trim().replace(ARTICLE, '');
}

function compare(order: ShelfOrder): (a: ShelfBook, b: ShelfBook) => number {
  if (order === 'title') return (a, b) => collator.compare(titleKey(a), titleKey(b));
  if (order === 'author') {
    return (a, b) => {
      const sa = a.authors[0] ? surnameOf(a.authors[0]) : '';
      const sb = b.authors[0] ? surnameOf(b.authors[0]) : '';
      // Books without an author go to the end rather than the front.
      if (!sa || !sb) return Number(!sa) - Number(!sb);
      return collator.compare(sa, sb) || collator.compare(titleKey(a), titleKey(b));
    };
  }
  return (a, b) => b.addedAt - a.addedAt;
}

/**
 * The books that match every word of the query in their title or authors, in the given order.
 * The shelf passed in is left as it is.
 */
export function findBooks(shelf: ShelfBook[], query: string, order: ShelfOrder): ShelfBook[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const found =
    words.length === 0
      ? [...shelf]
      : shelf.filter((book) => {
          const text = fold(`${book.title} ${book.authors.join(' ')}`);
          return words.every((word) => text.includes(word));
        });
  return found.sort(compare(order));
}

/** The order chosen last time, or newest first. */
export async function getShelfOrder(): Promise<ShelfOrder> {
  const stored = await getSetting<unknown>(ORDER_SETTING);
  return SHELF_ORDERS.find((order) => order === stored) ?? 'added';
}

export async function putShelfOrder(order: ShelfOrder): Promise<void> {
  if (!SHELF_ORDERS.includes(order)) throw new TypeError('Not a shelf order.');
  await putSetting(ORDER_SETTING, order);
}
