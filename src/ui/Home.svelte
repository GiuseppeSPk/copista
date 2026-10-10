<script lang="ts">
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';
  import { hashOf } from './route';
  import { GITHUB_URL, roomInfo, type RoomName } from './rooms';
  import { app } from './state.svelte';

  const IN = ['EPUB', 'DOCX', 'MD', 'TXT'];
  const OUT = ['EPUB', 'DOCX', 'MD', 'TXT', 'HTML', 'PDF'];

  const lastBook = $derived(app.shelf.find((book) => book.id === app.lastBookId));
  const readHref = $derived(
    lastBook ? hashOf({ room: 'lectorium', bookId: lastBook.id }) : hashOf({ room: 'lectorium' }),
  );
  const stack = $derived(app.shelf.slice(0, 4));
  const count = $derived(app.shelf.length);

  /** The door's border catches the light where the pointer is. */
  function follow(event: PointerEvent): void {
    const door = event.currentTarget as HTMLElement;
    const box = door.getBoundingClientRect();
    door.style.setProperty('--mx', `${event.clientX - box.left}px`);
    door.style.setProperty('--my', `${event.clientY - box.top}px`);
  }

  const door = (room: RoomName) => roomInfo(room);

  // The doors rise in on arrival, but not when a room's name is flying back to its plaque.
  const enter = document.documentElement.dataset.nav !== 'out';
</script>

<section class="home" class:enter aria-labelledby="home-title">
  <header class="home-head">
    <h1 id="home-title" class="home-name">Copista</h1>
    <p class="lead">Read and convert books in your browser. Nothing you open leaves this device.</p>
  </header>

  <div class="doors">
    <a
      class="door door-convert"
      href={hashOf({ room: 'scriptorium' })}
      aria-labelledby="door-scriptorium"
      onpointermove={follow}
      style:--i={0}
    >
      <span class="door-icon"><Icon name="convert" size={22} /></span>
      <span class="door-title" id="door-scriptorium">{door('scriptorium').action}</span>
      <span class="door-body"> Put a file in, take the same text out in another format. </span>
      <span class="formats" aria-hidden="true">
        <span class="format-row">
          {#each IN as format (format)}<span class="tag">{format}</span>{/each}
        </span>
        <span class="format-arrow"><Icon name="arrow" size={18} /></span>
        <span class="format-row">
          {#each OUT as format (format)}<span class="tag tag-out">{format}</span>{/each}
        </span>
      </span>
      <span class="door-note">Or drop a file anywhere on this page.</span>
      <span class="door-foot">
        <span class="plaque" style:--vt="title-scriptorium">Scriptorium</span>
        <span class="door-go"><Icon name="arrow" size={18} /></span>
      </span>
    </a>

    <a
      class="door door-read"
      href={readHref}
      aria-labelledby="door-lectorium"
      onpointermove={follow}
      style:--i={1}
    >
      <span class="door-icon"><Icon name="read" size={22} /></span>
      {#if lastBook}
        <span class="door-title" id="door-lectorium">Continue reading</span>
        <span class="continue">
          <Cover book={lastBook} />
          <span class="continue-text">
            <span class="continue-title">{lastBook.title}</span>
            {#if lastBook.authors.length > 0}
              <span class="continue-by">{lastBook.authors.join(', ')}</span>
            {/if}
          </span>
        </span>
      {:else}
        <span class="door-title" id="door-lectorium">{door('lectorium').action}</span>
        <span class="door-body"
          >Pages that turn like a book, and your place kept for next time.</span
        >
      {/if}
      <span class="door-foot">
        <span class="plaque" style:--vt="title-lectorium">Lectorium</span>
        <span class="door-go"><Icon name="arrow" size={18} /></span>
      </span>
    </a>

    <a
      class="door door-library"
      href={hashOf({ room: 'bibliotheca' })}
      aria-labelledby="door-bibliotheca"
      onpointermove={follow}
      style:--i={2}
    >
      <span class="door-icon"><Icon name="library" size={22} /></span>
      <span class="door-title" id="door-bibliotheca">{door('bibliotheca').action}</span>
      {#if count > 0}
        <span class="door-body">
          <span class="count">{count}</span>
          {count === 1 ? 'book' : 'books'} on this device
        </span>
        <span class="stack" aria-hidden="true">
          {#each stack as book, i (book.id)}
            <span class="stack-item" style:--s={i}><Cover {book} /></span>
          {/each}
        </span>
      {:else}
        <span class="door-body">Your EPUB books, kept in this browser.</span>
      {/if}
      <span class="door-foot">
        <span class="plaque" style:--vt="title-bibliotheca">Bibliotheca</span>
        <span class="door-go"><Icon name="arrow" size={18} /></span>
      </span>
    </a>

    <a
      class="door door-data"
      href={hashOf({ room: 'archivum' })}
      aria-labelledby="door-archivum"
      onpointermove={follow}
      style:--i={3}
    >
      <span class="door-icon"><Icon name="archive" size={22} /></span>
      <span class="door-title" id="door-archivum">{door('archivum').action}</span>
      <span class="door-body">No account, no upload. See what is kept and erase it.</span>
      <span class="door-foot">
        <span class="plaque" style:--vt="title-archivum">Archivum</span>
        <span class="door-go"><Icon name="arrow" size={18} /></span>
      </span>
    </a>
  </div>

  <aside class="star-strip" aria-label="Support Copista">
    <p>
      <strong>Copista is free and open source.</strong>
      No account, no tracking. If it helps you, a star on GitHub helps others find it.
    </p>
    <a class="button star-link" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
      <Icon name="star" size={18} />
      Star on GitHub
    </a>
  </aside>
</section>
