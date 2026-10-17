<script lang="ts">
  import { onMount } from 'svelte';
  import Archivum from './Archivum.svelte';
  import Bibliotheca from './Bibliotheca.svelte';
  import Home from './Home.svelte';
  import Icon from './Icon.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import InstallOffer from './InstallOffer.svelte';
  import Lectorium from './Lectorium.svelte';
  import Mark from './Mark.svelte';
  import Scriptorium from './Scriptorium.svelte';
  import {
    addFiles,
    app,
    followHash,
    go,
    hurryMotion,
    loadSettings,
    refreshShelf,
  } from './state.svelte';
  import { hashOf, type Route } from './route';
  import { GITHUB_URL, ROOMS, type RoomName } from './rooms';
  import { look, toggleTheme, watchTheme } from './theme.svelte';

  let ready = $state(false);
  let dragDepth = $state(0);

  function routeFor(room: RoomName): Route {
    if (room === 'lectorium' && app.lastBookId) return { room, bookId: app.lastBookId };
    return { room } as Route;
  }

  function hasFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes('Files') ?? false;
  }

  const isBook = (file: File): boolean => /\.epub$/i.test(file.name);

  function onDrop(event: DragEvent): void {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    const room = app.route.room;
    if (onShelf() && files.every(isBook)) {
      void addFiles(files, 'lectorium');
    } else if (room === 'bibliotheca' || (room === 'home' && files.every(isBook))) {
      void addFiles(files);
      if (room === 'home') go({ room: 'bibliotheca' });
    } else {
      app.pendingConversion = files;
      go({ room: 'scriptorium' });
    }
  }

  /** The Lectorium with no book open shows the bookcase, where dropped books land. */
  function onShelf(): boolean {
    return app.route.room === 'lectorium' && app.route.bookId === undefined;
  }

  const dropText = $derived(
    app.route.room === 'bibliotheca'
      ? 'Drop to add to the library'
      : onShelf()
        ? 'Drop books to put them on the shelf'
        : app.route.room === 'home'
          ? 'Drop books to keep them, other files to convert'
          : 'Drop to convert',
  );

  /** Key 0 goes back to the hall and keys 1 to 4 open the rooms, unless the reader is typing. */
  function onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const index = '01234'.indexOf(event.key);
    if (index < 0 || event.key.length !== 1) return;
    const target = event.target as HTMLElement | null;
    // An open dialog (the print preview) keeps the keys to itself.
    if (target?.closest('input, select, textarea, [contenteditable], dialog')) return;
    event.preventDefault();
    go(index === 0 ? { room: 'home' } : routeFor(ROOMS[index - 1]!.room));
  }

  /**
   * A pressed control sends a ring of light out from the point it was pressed. One listener
   * serves the whole app: it places the ring with CSS variables and adds no elements.
   */
  function onPress(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = (event.target as Element | null)?.closest<HTMLElement>(
      'button:not(.link), .button, .door, .tab, .star-top',
    );
    if (!target || target.matches(':disabled')) return;
    const box = target.getBoundingClientRect();
    target.style.setProperty('--rx', `${event.clientX - box.left}px`);
    target.style.setProperty('--ry', `${event.clientY - box.top}px`);
    target.style.setProperty('--rs', `${Math.hypot(box.width, box.height) * 2}px`);
    target.classList.remove('rippling');
    void target.offsetWidth;
    target.classList.add('rippling');
  }

  /** A press made while the screen moves between rooms, to be given to what lies under it. */
  let pressed: { x: number; y: number; settled: Promise<void> } | undefined;

  function onPressEarly(event: PointerEvent): void {
    const settled = event.button === 0 ? hurryMotion() : undefined;
    pressed = settled && { x: event.clientX, y: event.clientY, settled };
  }

  function onClickEarly(event: MouseEvent): void {
    const press = pressed;
    pressed = undefined;
    if (!press || event.target !== document.documentElement) return;
    // Given in a task of its own: a click passed on while this one is still being dispatched
    // may not be allowed to open a file picker.
    void press.settled.then(() =>
      setTimeout(() => {
        const under = document.elementFromPoint(press.x, press.y);
        if (under instanceof HTMLElement && under !== document.documentElement) under.click();
      }),
    );
  }

  function onRippleEnd(event: AnimationEvent): void {
    if (event.animationName === 'ripple') {
      (event.target as HTMLElement).classList.remove('rippling');
    }
  }

  // The dash: one stroke slides under the tabs to the room that is open, the hall first.
  let strip: HTMLUListElement | undefined = $state();
  let dashAt = $state({ x: 0, width: 0 });
  let dashLive = $state(false);
  const current = $derived(ROOMS.findIndex((r) => r.room === app.route.room) + 1);

  function placeDash(): void {
    const tab = strip?.querySelectorAll('a')[current];
    if (!tab) return;
    dashAt = { x: tab.offsetLeft, width: tab.offsetWidth };
  }

  $effect(() => {
    void current;
    placeDash();
    // Only slide once the stroke has a first position to slide from.
    if (!dashLive && strip) requestAnimationFrame(() => (dashLive = true));
  });

  $effect(() => {
    if (!strip) {
      dashLive = false;
      return;
    }
    const resize = new ResizeObserver(placeDash);
    resize.observe(strip);
    return () => resize.disconnect();
  });

  const nextTheme = $derived(look.theme === 'dark' ? 'light' : 'dark');

  function switchTheme(event: MouseEvent): void {
    // A keyboard press reports no point: the circle then grows from the switch itself.
    const button = event.currentTarget as HTMLElement;
    const box = button.getBoundingClientRect();
    const fromPointer = event.detail > 0;
    toggleTheme({
      x: fromPointer ? event.clientX : box.left + box.width / 2,
      y: fromPointer ? event.clientY : box.top + box.height / 2,
    });
  }

  onMount(() => {
    const stopWatching = watchTheme();
    followHash();
    void Promise.all([loadSettings(), refreshShelf()]).finally(() => (ready = true));
    return stopWatching;
  });
</script>

<svelte:window
  onhashchange={followHash}
  onkeydown={onKey}
  onpointerdowncapture={onPressEarly}
  onclickcapture={onClickEarly}
/>
<svelte:document
  onpointerdown={onPress}
  onanimationend={onRippleEnd}
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
<header class="masthead" class:at-home={app.route.room === 'home'}>
  <a class="brand" href="#/" aria-label="Copista, all rooms">
    <Mark />
    <span class="brand-name">Copista</span>
  </a>
  <nav aria-label="Rooms">
    <ul bind:this={strip}>
      <li>
        <a
          class="tab tab-hall"
          href="#/"
          aria-current={app.route.room === 'home' ? 'page' : undefined}
          aria-keyshortcuts="0"
          title="Hall, all rooms (0)"
        >
          <Icon name="hall" />
          <span class="tab-name">Hall</span>
          <span class="tab-short" aria-hidden="true">Hall</span>
        </a>
      </li>
      {#each ROOMS as r, i (r.room)}
        <li>
          <a
            class="tab"
            href={hashOf(routeFor(r.room))}
            aria-current={app.route.room === r.room ? 'page' : undefined}
            aria-keyshortcuts={String(i + 1)}
            title="{r.name} ({i + 1})"
          >
            <Icon name={r.icon} />
            <span class="tab-name">{r.action}</span>
            <span class="tab-short" aria-hidden="true">{r.short}</span>
          </a>
        </li>
      {/each}
    </ul>
    <span
      class="dash"
      class:live={dashLive}
      style:transform="translateX({dashAt.x}px) scaleX({dashAt.width})"
      aria-hidden="true"
    ></span>
  </nav>
  <div class="tools">
    <a class="star-top" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
      <Icon name="star" size={16} />
      <span>Star</span>
    </a>
    <button
      class="theme-switch"
      type="button"
      aria-label="Switch to {nextTheme} theme"
      title="Switch to {nextTheme} theme"
      onclick={switchTheme}
    >
      {#key look.theme}
        <span class="theme-glyph"><Icon name={look.theme === 'dark' ? 'sun' : 'moon'} /></span>
      {/key}
    </button>
  </div>
</header>

<main id="main" tabindex="-1">
  {#if ready}
    {#key app.route.room}
      <div class="stage">
        {#if app.route.room === 'home'}
          <Home />
        {:else if app.route.room === 'bibliotheca'}
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
      </div>
    {/key}
  {/if}
</main>

{#if ready}
  <InstallOffer />
{/if}

<ConfirmDialog />

{#if dragDepth > 0}
  <div class="drop-veil" aria-hidden="true">{dropText}</div>
{/if}
