<script lang="ts">
  import { removeBook } from '../rooms/bibliotheca';
  import Catalogues from './Catalogues.svelte';
  import { BOOK_FILES } from './files';
  import Icon from './Icon.svelte';
  import RoomHero from './RoomHero.svelte';
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

  function onPick(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    void add([...(input.files ?? [])]);
    input.value = '';
  }

  function convertBook(id: string): void {
    app.pendingBookId = id;
    go({ room: 'scriptorium' });
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
  <RoomHero room="bibliotheca" />

  <div class="toolbar">
    <label class="button primary">
      <Icon name="plus" size={18} />
      Add EPUB books
      <input type="file" accept={BOOK_FILES} multiple disabled={busy} onchange={onPick} />
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
    {#if !busy && app.landing.length > 0}
      <p class="landing-note">
        <a href={hashOf({ room: 'lectorium' })}
          >See {app.landing.length === 1 ? 'it' : 'them'} land on your shelf</a
        >
      </p>
    {/if}
  </div>

  {#if app.shelf.length === 0}
    <div class="drop-zone pick-area">
      <!-- The whole frame opens the file picker too; keyboards use the button above. -->
      <input
        class="area-input"
        type="file"
        accept={BOOK_FILES}
        multiple
        disabled={busy}
        tabindex="-1"
        aria-hidden="true"
        onchange={onPick}
      />
      <!-- A file comes down and stands on the shelf as a book: what adding one does. -->
      <div class="shelf-demo" aria-hidden="true">
        <span class="demo-file">EPUB</span>
        <span class="demo-spine" style:--h="54px"></span>
        <span class="demo-spine" style:--h="64px"></span>
        <span class="demo-spine new" style:--h="60px"></span>
        <span class="demo-spine" style:--h="50px"></span>
        <span class="demo-spine" style:--h="62px"></span>
      </div>
      <p class="empty">No books yet. Add an EPUB file and it goes on your shelf.</p>
      <p class="hint">
        Click here or drop EPUB files anywhere on this page, or find a free one below. To convert a
        document, open the <a href="#/scriptorium">Scriptorium</a>.
      </p>
    </div>
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
          <div class="about">
            <h2>{book.title}</h2>
            <p class="authors">{book.authors.join(', ') || 'Unknown author'}</p>
          </div>
          <div class="actions">
            <button
              type="button"
              class="primary"
              onclick={() => go({ room: 'lectorium', bookId: book.id })}
            >
              Read<span class="sr-only"> {book.title}</span>
            </button>
            <button type="button" onclick={() => convertBook(book.id)}>
              Convert<span class="sr-only"> {book.title}</span>
            </button>
            <button
              type="button"
              class="icon-only"
              title="Remove"
              onclick={() => remove(book.id, book.title)}
            >
              <Icon name="trash" size={18} /><span class="sr-only">Remove {book.title}</span>
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <Catalogues />
</section>
