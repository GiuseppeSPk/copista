/**
 * How a book stands on the Lectorium's shelves. Each title always gets the same spine, so a
 * shelf looks the same every time it is opened.
 */

export interface Spine {
  /** Width in pixels, 30 to 45. */
  width: number;
  /** Height in pixels, 150 to 195. */
  height: number;
  /** One of the four bindings the typographic covers use. */
  binding: number;
}

/** FNV-1a: a small, stable hash of the title. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function spineOf(title: string): Spine {
  const h = hash(title);
  return {
    width: 30 + (h % 4) * 5,
    height: 150 + ((h >>> 2) % 6) * 9,
    binding: (h >>> 5) % 4,
  };
}

/** Outlines for an empty shelf: books that are not there yet, of varied sizes. */
export const GHOSTS: Spine[] = Array.from({ length: 16 }, (_, i) => spineOf(`ghost ${i}`));
