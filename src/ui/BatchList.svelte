<script lang="ts" module>
  import type { CollationRow } from './collation';

  /** One file of a batch, as it goes through the Scriptorium. */
  export interface BatchRow {
    key: number;
    name: string;
    state: 'waiting' | 'working' | 'done' | 'failed';
    copy?: { blob: Blob; fileName: string };
    error?: string;
    /** The copy read back against its original, once it has been. */
    check?: { pending: true } | { pending: false; rows: CollationRow[] } | { failed: true };
  }
</script>

<script lang="ts">
  import { download } from './files';
  import Inking from './Inking.svelte';

  let { rows }: { rows: BatchRow[] } = $props();

  function summary(found: CollationRow[]): string {
    const lost = found.filter((row) => row.lost).map((row) => row.label.toLowerCase());
    return lost.length ? `Not all kept: ${lost.join(', ')}` : 'Everything kept';
  }
</script>

<ol class="batch" aria-label="Files">
  {#each rows as row (row.key)}
    <li class:failed={row.state === 'failed'}>
      <div class="batch-head">
        <strong class="batch-name" translate="no">{row.copy?.fileName ?? row.name}</strong>
        {#if row.state === 'waiting'}
          <span class="hint">Waiting</span>
        {:else if row.state === 'working'}
          <span class="working"><Inking />Converting…</span>
        {:else if row.copy}
          {@const copy = row.copy}
          <button type="button" class="link" onclick={() => download(copy.blob, copy.fileName)}>
            Download<span class="sr-only"> {copy.fileName}</span>
          </button>
        {/if}
      </div>
      {#if row.state === 'failed'}
        <p class="error">{row.error}</p>
      {:else if row.check && 'failed' in row.check}
        <p class="hint">The copy could not be read back, so it was not checked.</p>
      {:else if row.check?.pending}
        <p class="hint working"><Inking />Checking against the original…</p>
      {:else if row.check}
        <details>
          <summary>{summary(row.check.rows)}</summary>
          <dl class="facts">
            {#each row.check.rows as found (found.label)}
              <dt>{found.label}</dt>
              <dd class:lost={found.lost}>
                {found.value}
                {#if found.reason}<span class="why">{found.reason}</span>{/if}
                {#if found.missing?.length}
                  <span class="why">Missing, for example: {found.missing.join(', ')}</span>
                {/if}
              </dd>
            {/each}
          </dl>
        </details>
      {/if}
    </li>
  {/each}
</ol>
