<script lang="ts">
  import type { ShelfBook } from '../rooms/bibliotheca';
  import { hashOf } from './route';
  import { GHOSTS, spineOf } from './spines';

  /** The Lectorium's shelves: each book stands by its spine. With no books, outlines wait. */
  let { books, current }: { books: ShelfBook[]; current?: string | undefined } = $props();
</script>

{#if books.length > 0}
  <ul class="bookcase">
    {#each books as book, i (book.id)}
      {@const spine = spineOf(book.title)}
      <li style:--i={i} style:--w="{spine.width}px" style:--h="{spine.height}px">
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
    {/each}
  </div>
{/if}
