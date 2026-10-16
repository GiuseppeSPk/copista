<script lang="ts">
  import type { ShelfBook } from '../rooms/bibliotheca';

  /** A book's cover, or its title set in a ruled frame when it has none. */
  let { book }: { book: ShelfBook } = $props();

  const url = $derived(book.coverBlob ? URL.createObjectURL(book.coverBlob) : undefined);
  $effect(() => {
    const current = url;
    return () => {
      if (current) URL.revokeObjectURL(current);
    };
  });
</script>

<span class="mini-cover">
  {#if url}
    <img src={url} alt="" />
  {:else}
    <span translate="no">{book.title}</span>
  {/if}
</span>
