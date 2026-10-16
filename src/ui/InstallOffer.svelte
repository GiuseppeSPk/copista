<script lang="ts">
  import { onMount } from 'svelte';
  import Mark from './Mark.svelte';
  import { accept, install, later } from './install.svelte';
  import { app } from './state.svelte';

  /** The offer waits for the visitor to look round first. */
  const SETTLE_MS = 6000;

  let settled = $state(false);

  // Never over an open book: the reader came to read.
  const reading = $derived(app.route.room === 'lectorium' && app.route.bookId !== undefined);

  onMount(() => {
    const timer = setTimeout(() => (settled = true), SETTLE_MS);
    return () => clearTimeout(timer);
  });
</script>

{#if install.offered && settled && !reading}
  <aside class="install-offer" aria-label="Install Copista">
    <span class="install-mark"><Mark /></span>
    <p>
      <strong>Get the app</strong>
      <span>Copista on your home screen, full screen and offline.</span>
    </p>
    <div class="install-actions">
      <button type="button" class="link" onclick={later}>Not now</button>
      <button type="button" class="primary" onclick={() => void accept()}>Install</button>
    </div>
  </aside>
{/if}
