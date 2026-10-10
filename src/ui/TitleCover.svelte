<script lang="ts">
  import type { Classic } from './catalogues';

  /** A cover set in type alone: no image is fetched from anywhere. Four bindings take turns. */
  let { book, binding = 0 }: { book: Classic; binding?: number } = $props();

  // The type shrinks until the longest word fits across the cover.
  const longest = $derived(Math.max(...book.title.split(/\s+/).map((word) => word.length)));
</script>

<span class="title-cover" data-binding={binding % 4} style:--longest={longest} aria-hidden="true">
  <span class="tc-title">{book.title}</span>
  <span class="tc-rule"></span>
  <span class="tc-author">{book.author}</span>
</span>
