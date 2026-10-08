<script lang="ts">
  import type { TocEntry } from '../core/model/book';
  import Contents from './Contents.svelte';

  let {
    entries,
    onpick,
  }: { entries: TocEntry[]; onpick: (chapter: number, fragment?: string) => void } = $props();
</script>

<ol class="contents">
  {#each entries as entry, i (i)}
    <li>
      <button type="button" class="link" onclick={() => onpick(entry.chapter, entry.fragment)}>
        {entry.label}
      </button>
      {#if entry.children.length > 0}
        <Contents entries={entry.children} {onpick} />
      {/if}
    </li>
  {/each}
</ol>
