<script lang="ts">
  import { removeBook } from '../rooms/bibliotheca';
  import { addFiles, app, go, refreshShelf } from './state.svelte';
  import { hashOf } from './route';
  import { errorMessage } from './text';

  let busy = $state(false);
  let removeError = $state('');

  // Cover images live as blob URLs only while the shelf shows them.
  const covers = $derived(
    new Map(
      app.shelf.flatMap((book) =>
        book.coverBlob ? [[book.id, URL.createObjectURL(book.coverBlob)] as const] : [],
      ),
    ),
  );
  $effect(() => {
    const urls = [...covers.values()];
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  });

  async function add(files: File[]): Promise<void> {
    if (files.length === 0) return;
    busy = true;
    try {
      await addFiles(files);
    } finally {
      busy = false;
    }
  }

  async function remove(id: string, title: string): Promise<void> {
    if (!confirm(`Remove “${title}” and its bookmarks from this browser?`)) return;
    removeError = '';
    try {
      await removeBook(id);
      if (app.lastBookId === id) app.lastBookId = undefined;
      await refreshShelf();
    } catch (error) {
      removeError = errorMessage(error);
    }
  }

  // Development only: the test corpus served by the dev server.
  let corpus = $state<string[]>([]);
  if (import.meta.env.DEV) {
    fetch('/tests/corpus.json')
      .then((res) => (res.ok ? (res.json() as Promise<{ id: string }[]>) : []))
      .then((list) => (corpus = list.map((entry) => entry.id)))
      .catch(() => undefined);
  }

  async function addFromCorpus(event: Event): Promise<void> {
    const select = event.currentTarget as HTMLSelectElement;
    const id = select.value;
    select.value = '';
    if (!id) return;
    const res = await fetch(`/tests/fixtures/corpus/${id}.epub`);
    if (!res.ok) {
      app.libraryNotices = [
        { tone: 'error', text: `${id} is not downloaded (npm run test:corpus).` },
      ];
      return;
    }
    await add([new File([await res.blob()], `${id}.epub`, { type: 'application/epub+zip' })]);
  }
</script>

<section class="room" aria-labelledby="bibliotheca-title">
  <h1 id="bibliotheca-title">Bibliotheca</h1>
  <p class="lead">Your library. Books are kept in this browser only.</p>

  <div class="toolbar">
    <label class="button primary">
      Add EPUB books
      <input
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        disabled={busy}
        onchange={(e) => {
          const input = e.currentTarget;
          void add([...(input.files ?? [])]);
          input.value = '';
        }}
      />
    </label>
    <span class="hint">or drop them anywhere on this page</span>
    {#if import.meta.env.DEV && corpus.length > 0}
      <select aria-label="Add a test book" onchange={addFromCorpus}>
        <option value="">Test corpus…</option>
        {#each corpus as id (id)}<option value={id}>{id}</option>{/each}
      </select>
    {/if}
  </div>

  <div role="status" class="notices">
    {#if busy}<p>Adding…</p>{/if}
    {#each app.libraryNotices as notice, i (i)}
      <p class={notice.tone}>{notice.text}</p>
      {#if notice.details?.length}
        <ul class="details">
          {#each notice.details as detail (detail)}<li>{detail}</li>{/each}
        </ul>
      {/if}
    {/each}
    {#if removeError}<p class="error">{removeError}</p>{/if}
  </div>

  {#if app.shelf.length === 0}
    <p class="empty">No books yet. Add an EPUB file to start reading.</p>
  {:else}
    <ul class="shelf" aria-label="Books">
      {#each app.shelf as book (book.id)}
        <li class="card">
          <a
            class="cover"
            href={hashOf({ room: 'lectorium', bookId: book.id })}
            tabindex="-1"
            aria-hidden="true"
          >
            {#if covers.get(book.id)}
              <img src={covers.get(book.id)} alt="" />
            {:else}
              <span>{book.title}</span>
            {/if}
          </a>
          <h2>{book.title}</h2>
          <p class="authors">{book.authors.join(', ') || 'Unknown author'}</p>
          <div class="actions">
            <button type="button" onclick={() => go({ room: 'lectorium', bookId: book.id })}>
              Read<span class="sr-only"> {book.title}</span>
            </button>
            <button type="button" onclick={() => remove(book.id, book.title)}>
              Remove<span class="sr-only"> {book.title}</span>
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>
