<script lang="ts">
  import { onMount } from 'svelte';
  import type { Settings } from '../rooms/archivum';
  import {
    addBookmark,
    openSession,
    progressPercent,
    removeBookmark,
    type ReadingSession,
  } from '../rooms/lectorium';
  import { ReadingController } from '../rooms/lectorium/controller';
  import type { BookmarkRecord } from '../storage/db';
  import type { TocEntry } from '../core/model/book';
  import { app, changeSettings } from './state.svelte';
  import Bookcase from './Bookcase.svelte';
  import Contents from './Contents.svelte';
  import RoomHero from './RoomHero.svelte';
  import Icon from './Icon.svelte';
  import { errorMessage } from './text';

  let { bookId }: { bookId?: string | undefined } = $props();

  let host: HTMLDivElement | undefined = $state();
  let session = $state.raw<ReadingSession>();
  let ctrl: ReadingController | undefined;
  let marks = $state<BookmarkRecord[]>([]);
  let error = $state('');
  let panelOpen = $state(false);
  let where = $state({ chapter: 0, page: 0, pages: 0, percent: 0 });

  const book = $derived(session?.book);
  const contents = $derived<TocEntry[]>(
    !book
      ? []
      : book.toc.length > 0
        ? book.toc
        : book.chapters.map((c, i) => ({
            label: c.title ?? `Chapter ${i + 1}`,
            chapter: i,
            children: [],
          })),
  );
  const chapterTitle = $derived(book?.chapters[where.chapter]?.title);

  function look(): Settings {
    return { ...app.settings };
  }

  function refreshWhere(): void {
    if (!ctrl || !session) return;
    const pos = ctrl.position();
    where = {
      chapter: pos.spineIndex,
      page: ctrl.page,
      pages: ctrl.pageCount,
      percent: progressPercent(session.book, pos),
    };
  }

  onMount(() => {
    if (!bookId || !host) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The paginator lays pages out again on resize; the counts follow it.
    const resize = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(refreshWhere, 300);
    });
    resize.observe(host);

    openSession(bookId)
      .then(async (opened) => {
        if (cancelled || !host) return;
        session = opened;
        marks = opened.bookmarks;
        ctrl = new ReadingController(host, opened, look(), refreshWhere);
        await ctrl.open();
        host.focus();
      })
      .catch((e: unknown) => {
        if (!cancelled) error = errorMessage(e);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      resize.disconnect();
      ctrl?.destroy();
      ctrl = undefined;
    };
  });

  function turn(forward: boolean): void {
    if (!ctrl) return;
    void (forward ? ctrl.next() : ctrl.prev()).catch((e: unknown) => (error = errorMessage(e)));
  }

  function onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, [contenteditable]')) return;
    // Space presses a focused button or link; the arrows have no such use there.
    if (event.key === ' ' && target?.closest('button, a')) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      turn(true);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      turn(false);
    }
  }

  /** A tap on the outer thirds of the page turns it; links are handled by the paginator. */
  function onPageClick(event: MouseEvent): void {
    if (event.defaultPrevented || !host) return;
    const box = host.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    if (x < 1 / 3) turn(false);
    else if (x > 2 / 3) turn(true);
  }

  function goTo(chapter: number, fragment?: string): void {
    panelOpen = false;
    void ctrl?.goTo({ spineIndex: chapter, ...(fragment ? { fragment } : {}) });
  }

  async function mark(): Promise<void> {
    if (!ctrl || !session) return;
    const pos = ctrl.position();
    const label = session.book.chapters[pos.spineIndex]?.title ?? `Chapter ${pos.spineIndex + 1}`;
    try {
      marks = [...marks, await addBookmark(session.bookId, pos, label)];
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function unmark(id: string): Promise<void> {
    await removeBookmark(id);
    marks = marks.filter((m) => m.id !== id);
  }

  async function restyle(patch: Partial<Settings>): Promise<void> {
    await changeSettings(patch);
    await ctrl?.setLook(look());
    refreshWhere();
  }
</script>

<svelte:window onkeydown={onKey} />

<section class="room lectorium" class:open-book={bookId} aria-labelledby="lectorium-title">
  {#if !bookId}
    <RoomHero room="lectorium" />
    {#if app.shelf.length > 0}
      <h2 class="pick-title">Choose a book</h2>
      <Bookcase books={app.shelf} current={app.lastBookId} />
    {:else}
      <Bookcase books={[]} />
      <p class="empty">
        No books yet. Add one in the <a href="#/bibliotheca">library</a>, where you can also find
        free ones, and it opens here.
      </p>
    {/if}
  {:else}
    <div class="reading-bar">
      <div class="reading-title">
        <span class="room-tag" aria-hidden="true">Lectorium</span>
        <h1 id="lectorium-title">{book?.meta.title ?? 'Opening…'}</h1>
      </div>
      <div class="toolbar">
        <button
          type="button"
          class="panel-toggle"
          aria-expanded={panelOpen}
          aria-controls="reader-panel"
          onclick={() => (panelOpen = !panelOpen)}>Contents</button
        >
        <button type="button" onclick={mark} disabled={!session}>Bookmark this page</button>
        <div class="group" role="group" aria-label="Text size">
          <button
            type="button"
            aria-label="Smaller text"
            disabled={app.settings.fontSizePercent <= 80}
            onclick={() => restyle({ fontSizePercent: app.settings.fontSizePercent - 10 })}
            >A−</button
          >
          <span class="size">{app.settings.fontSizePercent}%</span>
          <button
            type="button"
            aria-label="Larger text"
            disabled={app.settings.fontSizePercent >= 200}
            onclick={() => restyle({ fontSizePercent: app.settings.fontSizePercent + 10 })}
            >A+</button
          >
        </div>
        <label class="theme">
          <span class="sr-only">Page colours</span>
          <select
            value={app.settings.theme}
            onchange={(e) => restyle({ theme: e.currentTarget.value as Settings['theme'] })}
          >
            <option value="light">Light</option>
            <option value="sepia">Sepia</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
    </div>

    {#if error}
      <p class="error" role="alert">{error} <a href="#/bibliotheca">Back to the library</a></p>
    {/if}

    <div class="reading" class:panel-open={panelOpen}>
      <aside id="reader-panel" aria-label="Contents and bookmarks">
        <h2>Contents</h2>
        <Contents entries={contents} onpick={goTo} />
        <h2>Bookmarks</h2>
        {#if marks.length === 0}
          <p class="empty">No bookmarks yet.</p>
        {:else}
          <ul class="marks">
            {#each marks as m (m.id)}
              <li>
                <button
                  type="button"
                  class="link"
                  onclick={() => {
                    panelOpen = false;
                    void ctrl?.goTo({ spineIndex: m.spineIndex, fraction: m.fraction });
                  }}
                >
                  {m.snippet || `Chapter ${m.spineIndex + 1}`}
                  <small>{book ? Math.round(progressPercent(book, m)) : 0}%</small>
                </button>
                <button
                  type="button"
                  class="remove"
                  aria-label="Delete bookmark"
                  onclick={() => unmark(m.id)}><Icon name="trash" size={16} /></button
                >
              </li>
            {/each}
          </ul>
        {/if}
      </aside>

      <div class="page-area">
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div
          class="pages"
          bind:this={host}
          tabindex="0"
          role="document"
          aria-label="Book page. Use the arrow keys to turn pages."
          onclick={onPageClick}
        ></div>
        <div class="page-nav">
          <button type="button" onclick={() => turn(false)} disabled={!session}>
            <Icon name="back" size={18} /> Previous
          </button>
          <p class="where" aria-live="polite">
            {#if session && where.pages > 0}
              Page {where.page + 1} of {where.pages} · chapter {where.chapter + 1} of {book
                ?.chapters.length} · {Math.round(where.percent)}%{#if chapterTitle}<span
                  class="chapter">{` · ${chapterTitle}`}</span
                >{/if}
            {/if}
          </p>
          <button type="button" onclick={() => turn(true)} disabled={!session}>
            Next <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>
    </div>
  {/if}
</section>
