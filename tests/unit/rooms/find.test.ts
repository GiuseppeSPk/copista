import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findBooks,
  getShelfOrder,
  putShelfOrder,
  surnameOf,
  type ShelfOrder,
} from '../../../src/rooms/bibliotheca/find';
import type { ShelfBook } from '../../../src/rooms/bibliotheca/index';
import { deleteAllStorage, putSetting } from '../../../src/storage/db';

beforeEach(async () => {
  await deleteAllStorage();
});

function book(id: string, title: string, authors: string[], addedAt: number): ShelfBook {
  return { id, title, authors, addedAt };
}

// Newest first, as listShelf returns them.
const shelf = [
  book('c', 'Le città invisibili', ['Italo Calvino'], 3),
  book('b', 'Emma', ['Jane Austen'], 2),
  book('a', 'The Raven', ['Poe, Edgar Allan'], 1),
  book('d', 'Beowulf', [], 0),
];

const ids = (books: ShelfBook[]): string[] => books.map((b) => b.id);

describe('findBooks', () => {
  it('keeps the newest first by default and with an empty query', () => {
    expect(ids(findBooks(shelf, '', 'added'))).toEqual(['c', 'b', 'a', 'd']);
    expect(ids(findBooks(shelf, '   ', 'added'))).toEqual(['c', 'b', 'a', 'd']);
  });

  it('matches title and author, ignoring case and accents', () => {
    expect(ids(findBooks(shelf, 'CITTA', 'added'))).toEqual(['c']);
    expect(ids(findBooks(shelf, 'austen', 'added'))).toEqual(['b']);
    expect(ids(findBooks(shelf, 'edgar', 'added'))).toEqual(['a']);
  });

  it('needs every word, in any order and across title and author', () => {
    expect(ids(findBooks(shelf, 'calvino invisibili', 'added'))).toEqual(['c']);
    expect(ids(findBooks(shelf, 'calvino emma', 'added'))).toEqual([]);
  });

  it('sorts by title, ignoring a leading article', () => {
    expect(ids(findBooks(shelf, '', 'title'))).toEqual(['d', 'c', 'b', 'a']);
  });

  it('sorts by surname, with unknown authors last', () => {
    expect(ids(findBooks(shelf, '', 'author'))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('does not change the shelf it is given', () => {
    findBooks(shelf, '', 'title');
    expect(ids(shelf)).toEqual(['c', 'b', 'a', 'd']);
  });
});

describe('surnameOf', () => {
  it('takes the part before a comma, or else the last word', () => {
    expect(surnameOf('Poe, Edgar Allan')).toBe('Poe');
    expect(surnameOf('Jane Austen')).toBe('Austen');
    expect(surnameOf('Homer')).toBe('Homer');
    expect(surnameOf('  ')).toBe('');
  });
});

describe('shelf order', () => {
  it('starts newest first and keeps the order chosen', async () => {
    expect(await getShelfOrder()).toBe('added');
    await putShelfOrder('author');
    expect(await getShelfOrder()).toBe('author');
  });

  it('ignores a stored value it does not know and refuses to store one', async () => {
    await putSetting('shelfOrder', 'colour');
    expect(await getShelfOrder()).toBe('added');
    await expect(putShelfOrder('colour' as ShelfOrder)).rejects.toThrow(TypeError);
  });
});
