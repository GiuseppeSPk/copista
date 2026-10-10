<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { flip } from 'svelte/animate';
  import type { ShelfBook } from '../rooms/bibliotheca';
  import { hashOf } from './route';
  import { GHOSTS, spineOf } from './spines';
  import { stillMotion } from './theme.svelte';

  /**
   * The Lectorium's shelves: each book stands by its spine. Books just added fall into place
   * while the others move up to make room. With no books, outlines wait, and an example book
   * shows where the first one will go.
   */
  let {
    books,
    current,
    landing = [],
    onlanded,
  }: {
    books: ShelfBook[];
    current?: string | undefined;
    landing?: string[];
    onlanded?: (id: string) => void;
  } = $props();

  // A case that has just appeared rises first; a book dropped on a case already standing falls
  // at once.
  let standing = $state(false);
  $effect(() => {
    const timer = setTimeout(() => (standing = true), 900);
    return () => clearTimeout(timer);
  });

  // A book that has landed keeps still: dropping its landing class must not replay the rise.
  let settled = $state<string[]>([]);

  function fallDelay(id: string): string | undefined {
    const order = landing.indexOf(id);
    if (order < 0) return undefined;
    return `${(standing ? 120 : 760) + order * 160}ms`;
  }
</script>

{#if books.length > 0}
  <ul class="bookcase">
    {#each books as book, i (book.id)}
      {@const spine = spineOf(book.title)}
      <li
        class:landing={landing.includes(book.id)}
        class:settled={settled.includes(book.id)}
        style:--i={i}
        style:--w="{spine.width}px"
        style:--h="{spine.height}px"
        style:--fall={fallDelay(book.id)}
        animate:flip={{ duration: stillMotion() ? 0 : 520, easing: cubicOut }}
        onanimationend={(event) => {
          if (event.animationName === 'land' && event.target === event.currentTarget) {
            settled = [...settled, book.id];
            onlanded?.(book.id);
          }
        }}
      >
        <a
          class="spine"
          data-binding={spine.binding}
          aria-current={book.id === current ? 'true' : undefined}
          href={hashOf({ room: 'lectorium', bookId: book.id })}
          title={book.authors.length > 0 ? `${book.title}, ${book.authors.join(', ')}` : book.title}
        >
          <span class="spine-title">{book.title}</span>
          {#if book.authors.length > 0}
            <span class="sr-only">, {book.authors.join(', ')}</span>
          {/if}
        </a>
        {#if book.id === current}<span class="ribbon" aria-hidden="true"></span>{/if}
      </li>
    {/each}
  </ul>
{:else}
  <div class="bookcase bookcase-empty" aria-hidden="true">
    {#each GHOSTS as spine, i (i)}
      <span class="ghost" style:--w="{spine.width}px" style:--h="{spine.height}px" style:--i={i}
      ></span>
      {#if i === 5}
        <span class="example-book">
          <span class="spine" data-binding="0"><span class="spine-title">Your book</span></span>
        </span>
      {/if}
    {/each}
  </div>
{/if}
