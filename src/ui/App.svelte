<script lang="ts">
  import { onMount } from 'svelte';
  import Archivum from './Archivum.svelte';
  import Bibliotheca from './Bibliotheca.svelte';
  import Lectorium from './Lectorium.svelte';
  import Scriptorium from './Scriptorium.svelte';
  import { addFiles, app, followHash, go, loadSettings, refreshShelf } from './state.svelte';
  import { hashOf, type Room, type Route } from './route';

  const ROOMS: { room: Room; name: string; hint: string }[] = [
    { room: 'bibliotheca', name: 'Bibliotheca', hint: 'Library' },
    { room: 'lectorium', name: 'Lectorium', hint: 'Read' },
    { room: 'scriptorium', name: 'Scriptorium', hint: 'Convert' },
    { room: 'archivum', name: 'Archivum', hint: 'Data & privacy' },
  ];

  let ready = $state(false);
  let dragDepth = $state(0);

  function routeFor(room: Room): Route {
    if (room === 'lectorium' && app.lastBookId) return { room, bookId: app.lastBookId };
    return { room } as Route;
  }

  function hasFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes('Files') ?? false;
  }

  function onDrop(event: DragEvent): void {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    if (app.route.room === 'bibliotheca') {
      void addFiles(files);
    } else {
      app.pendingConversion = files[0];
      go({ room: 'scriptorium' });
    }
  }

  onMount(() => {
    followHash();
    void Promise.all([loadSettings(), refreshShelf()]).finally(() => (ready = true));
  });
</script>

<svelte:window onhashchange={followHash} />
<svelte:document
  ondragenter={(e) => {
    if (hasFiles(e)) dragDepth += 1;
  }}
  ondragleave={(e) => {
    if (hasFiles(e)) dragDepth = Math.max(0, dragDepth - 1);
  }}
  ondragover={(e) => {
    if (hasFiles(e)) e.preventDefault();
  }}
  ondrop={onDrop}
/>

<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <a class="brand" href="#/bibliotheca">
    <img src="icon.svg" alt="" width="28" height="28" />
    <span>Copista</span>
  </a>
  <nav aria-label="Rooms">
    <ul>
      {#each ROOMS as r (r.room)}
        <li>
          <a
            href={hashOf(routeFor(r.room))}
            aria-current={app.route.room === r.room ? 'page' : undefined}
          >
            {r.name}<small>{r.hint}</small>
          </a>
        </li>
      {/each}
    </ul>
  </nav>
</header>

<main id="main" tabindex="-1">
  {#if ready}
    {#if app.route.room === 'bibliotheca'}
      <Bibliotheca />
    {:else if app.route.room === 'lectorium'}
      {#key app.route.bookId}
        <Lectorium bookId={app.route.bookId} />
      {/key}
    {:else if app.route.room === 'scriptorium'}
      <Scriptorium />
    {:else}
      <Archivum />
    {/if}
  {/if}
</main>

{#if dragDepth > 0}
  <div class="drop-veil" aria-hidden="true">
    {app.route.room === 'bibliotheca' ? 'Drop to add to the library' : 'Drop to convert'}
  </div>
{/if}
