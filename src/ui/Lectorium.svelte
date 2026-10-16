<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { VOICE_RATES, type Settings } from '../rooms/archivum';
  import {
    addBookmark,
    addNote,
    NOTE_LENGTH,
    openSession,
    progressPercent,
    removeBookmark,
    removeNote,
    saveNote,
    type ReadingSession,
  } from '../rooms/lectorium';
  import { ReadingController } from '../rooms/lectorium/controller';
  import { PACES, stepPace } from '../reader/autoscroll';
  import { pageForFraction } from '../reader/location';
  import { BookNotFoundError, type BookmarkRecord, type NoteRecord } from '../storage/db';
  import type { TocEntry } from '../core/model/book';
  import { BOOK_FILES } from './files';
  import { addFiles, app, changeSettings, landed } from './state.svelte';
  import Bookcase from './Bookcase.svelte';
  import Incipit from './Incipit.svelte';
  import Contents from './Contents.svelte';
  import RoomHero from './RoomHero.svelte';
  import Icon from './Icon.svelte';
  import { errorMessage } from './text';
  import VoiceSheet from './VoiceSheet.svelte';
  import ListenBar from './ListenBar.svelte';
  import { cancelDownload, measureVoice, READERS, voice as voiceState } from './voice.svelte';
  import { voiceService } from '../voice/index';
  import { voiceOutput, type Output } from '../voice/stream';
  import type { Narrator } from '../voice/narrator';
  import { mediaSession, type LockScreen } from '../voice/session';
  import type { Lang } from '../voice/text';
  import { ReadAloud, type AloudState } from '../rooms/lectorium/aloud';

  let { bookId }: { bookId?: string | undefined } = $props();

  let host: HTMLDivElement | undefined = $state();
  let session = $state.raw<ReadingSession>();
  let ctrl: ReadingController | undefined;
  let marks = $state<BookmarkRecord[]>([]);
  let error = $state('');
  let panelOpen = $state(false);
  // The panel shows one list at a time: the contents, the bookmarks or the notes.
  let tab = $state<'contents' | 'marks' | 'notes'>('contents');
  // Text size and page colours sit together behind one button.
  let lookOpen = $state(false);
  let lookBox: HTMLDivElement | undefined = $state();
  let where = $state({ chapter: 0, page: 0, pages: 0, percent: 0 });
  let notes = $state<NoteRecord[]>([]);
  let folded = $state<string[]>([]);
  // The page fills the window and the chrome steps away.
  let fitted = $state(false);
  // The tap zones show for a moment when a book opens or the page is fitted.
  let hinting = $state(false);
  let zone = $state<'prev' | 'next' | undefined>();
  // The text moves by itself, in scroll mode only.
  let playing = $state(false);
  // The voice reads the chapter aloud once it is set up; until then Listen opens the voice sheet.
  let sheetOpen = $state(false);
  let listenButton: HTMLButtonElement | undefined = $state();
  let sheetBox: HTMLDivElement | undefined = $state();
  /** The button that opened the voice sheet, which gets the focus back when it closes. */
  let sheetOpener: HTMLElement | undefined;
  let aloud: ReadAloud | undefined;
  // What the listening bar shows; null when nothing is being read.
  let aloudState = $state.raw<AloudState | null>(null);
  let lock: LockScreen | undefined;
  let listenError = $state('');
  let narrator: Narrator | undefined;
  let speaker: Output | undefined;

  // The window behind a fitted page shows no scrollbar. Only the scrollbar is
  // hidden: flipping the root's overflow while the page is still being laid out
  // crashes WebKit.
  $effect(() => {
    const root = document.documentElement;
    root.classList.toggle('page-fitted', fitted);
    return () => root.classList.remove('page-fitted');
  });

  // Anything that takes the reader's eyes off the text stops it moving.
  $effect(() => {
    if (panelOpen || lookOpen || sheetOpen || error) ctrl?.pause();
  });

  // The voice reading; a derived value, so another setting saved leaves the reading alone.
  const voiceId = $derived(app.settings.voice);
  const readerName = $derived(READERS.find((r) => r.id === voiceId)?.name ?? 'The Lector');
  // The voice reads English books in English and every other book in Italian.
  const bookLang: Lang = $derived(session && /^en/i.test(session.book.meta.language) ? 'en' : 'it');

  // Another reader chosen takes up the reading from the page on screen.
  $effect(() => {
    void voiceId;
    untrack(() => aloud?.restart());
  });

  // A voice taken off this device stops the reading that uses it, and lets go of the model it holds.
  $effect(() => {
    if (voiceState.status?.installed) return;
    untrack(() => {
      if (aloudState) stopListening();
      narrator?.destroy();
      narrator = undefined;
    });
  });

  // The lock screen and the system's media controls show whether the reading plays.
  $effect(() => {
    if (aloudState) lock?.playing(!aloudState.paused);
  });

  const scrolling = $derived(app.settings.mode === 'scroll');
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
  const pageNotes = $derived(
    where.pages === 0
      ? []
      : notes.filter(
          (note) =>
            note.spineIndex === where.chapter &&
            pageForFraction(note.fraction, where.pages) === where.page,
        ),
  );

  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  let hintTimer: ReturnType<typeof setTimeout> | undefined;

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
    void measureVoice();

    openSession(bookId)
      .then(async (opened) => {
        if (cancelled || !host) return;
        session = opened;
        marks = opened.bookmarks;
        notes = opened.notes;
        ctrl = new ReadingController(
          host,
          opened,
          look(),
          refreshWhere,
          (p) => (playing = p),
          // The reader turned the page or went elsewhere: the reading follows.
          () => aloud?.restart(),
        );
        await ctrl.open();
        host.focus();
        hint();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        error = errorMessage(e);
        // A book that is not here is not one to come back to from the room's tab.
        if (e instanceof BookNotFoundError && app.lastBookId === bookId) app.lastBookId = undefined;
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(hintTimer);
      clearTimeout(tapTimer);
      endPress();
      for (const id of [...pending.keys()]) void storeNote(id);
      resize.disconnect();
      stopListening();
      cancelDownload();
      narrator?.destroy();
      speaker?.release();
      ctrl?.destroy();
      ctrl = undefined;
    };
  });

  function turn(forward: boolean): void {
    if (!ctrl) return;
    void (forward ? ctrl.next() : ctrl.prev()).catch((e: unknown) => (error = errorMessage(e)));
  }

  function onKey(event: KeyboardEvent): void {
    if (!bookId) return;
    const target = event.target as HTMLElement | null;
    if (event.key === 'Escape' && sheetOpen) {
      event.preventDefault();
      closeVoiceSheet();
      return;
    }
    if (event.key === 'Escape' && lookOpen) {
      event.preventDefault();
      lookOpen = false;
      lookBox?.querySelector<HTMLButtonElement>('.look-toggle')?.focus();
      return;
    }
    if (event.key === 'Escape' && fitted) {
      event.preventDefault();
      fit(false);
      return;
    }
    if (target?.closest('input, select, textarea, [contenteditable]')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Space presses a focused button or link; the arrows have no such use there.
    if (event.key === ' ' && target?.closest('button, a')) return;
    if (
      scrolling &&
      (event.key === ' ' || event.key === '+' || event.key === '=' || event.key === '-')
    ) {
      event.preventDefault();
      if (event.key === ' ') togglePlay();
      else changePace(event.key === '-' ? -1 : 1);
      return;
    }
    // In scroll mode the up and down arrows stay the browser's and scroll the text.
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      turn(true);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      turn(false);
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      fit(!fitted);
    }
  }

  /** The arrow keys move between the panel's tabs, as in any tab list. */
  function onTabKey(event: KeyboardEvent): void {
    const order = ['contents', 'marks', 'notes'] as const;
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    tab = order[(order.indexOf(tab) + step + order.length) % order.length]!;
    document.getElementById(`tab-${tab}`)?.focus();
  }

  /** A press anywhere outside the text settings puts them away. */
  function onWindowPointerDown(event: PointerEvent): void {
    const target = event.target as Node;
    if (lookOpen && !lookBox?.contains(target)) lookOpen = false;
    // The buttons that open the voice sheet toggle it themselves on click.
    const opener = (target as Element).closest?.('[aria-controls="voice-sheet"]');
    if (sheetOpen && !sheetBox?.contains(target) && !listenButton?.contains(target) && !opener) {
      sheetOpen = false;
    }
  }

  function fit(on: boolean): void {
    fitted = on;
    autoFitted = false;
    if (!on && fullscreened) {
      fullscreened = false;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    }
    lookOpen = false;
    sheetOpen = false;
    if (on) hint();
    host?.focus();
  }

  // Two taps in the middle fill the whole screen, the browser's bars too.
  let fullscreened = false;
  // A phone turned on its side fits the page by itself, and turned back gives the chrome back.
  let autoFitted = false;

  function toggleFullscreen(): void {
    if (fullscreened) return fit(false);
    fit(true);
    const root = document.documentElement;
    // Safari on the iPhone has no full screen for a page: the full page is all it gets.
    if (!root.requestFullscreen || document.fullscreenElement) return;
    root.requestFullscreen({ navigationUI: 'hide' }).then(
      () => (fullscreened = true),
      () => {},
    );
  }

  $effect(() => {
    if (!bookId) return;
    const short = matchMedia(
      '(pointer: coarse) and (orientation: landscape) and (max-height: 500px)',
    );
    const follow = (): void => {
      if (short.matches && !fitted) {
        fit(true);
        autoFitted = true;
      } else if (!short.matches && autoFitted) {
        fit(false);
      }
    };
    untrack(follow);
    short.addEventListener('change', follow);
    // Leaving the browser's full screen, with its own gesture or key, leaves the full page too.
    const left = (): void => {
      if (!document.fullscreenElement && fullscreened) fit(false);
    };
    document.addEventListener('fullscreenchange', left);
    return () => {
      short.removeEventListener('change', follow);
      document.removeEventListener('fullscreenchange', left);
      if (fullscreened && document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    };
  });

  function hint(): void {
    hinting = true;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => (hinting = false), 1800);
  }

  function zoneAt(clientX: number): 'prev' | 'next' | undefined {
    if (!host) return undefined;
    const box = host.getBoundingClientRect();
    const x = (clientX - box.left) / box.width;
    return x < 1 / 3 ? 'prev' : x > 2 / 3 ? 'next' : undefined;
  }

  // A horizontal swipe turns the page; the click that follows it is not a tap.
  let start: { x: number; y: number; id: number } | undefined;
  let swiped = false;
  // A finger held still on the text reads aloud from there; the click after it is not a tap.
  const PRESS_MS = 500;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressed = false;
  let pointerType = '';
  // A ring grows under the finger while it is held, so the wait shows before the voice starts.
  let pressRing = $state<{ x: number; y: number } | undefined>();
  // A single tap in the middle waits a moment, in case a second one follows.
  const DOUBLE_TAP_MS = 300;
  // Windows waits half a second for a second click.
  const DOUBLE_CLICK_MS = 500;
  let tapTimer: ReturnType<typeof setTimeout> | undefined;

  function endPress(): void {
    clearTimeout(pressTimer);
    pressTimer = undefined;
    pressRing = undefined;
  }

  function onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    swiped = false;
    pressed = false;
    pointerType = event.pointerType;
    endPress();
    if (event.button === 0) {
      const { clientX, clientY } = event;
      pressTimer = setTimeout(() => readFrom(clientX, clientY), PRESS_MS);
      const box = host?.parentElement?.getBoundingClientRect();
      if (box) pressRing = { x: clientX - box.left, y: clientY - box.top };
    }
  }

  function onPointerUp(event: PointerEvent): void {
    endPress();
    if (!start || event.pointerId !== start.id) return;
    if (scrolling) {
      start = undefined;
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = undefined;
    if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      swiped = true;
      turn(dx < 0);
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) endPress();
    zone = event.pointerType === 'mouse' && !scrolling ? zoneAt(event.clientX) : undefined;
  }

  /**
   * A tap on the outer thirds of the page turns it, and a tap in the middle
   * fits the page to the window or gives the chrome back. Links are handled by
   * the paginator. In scroll mode a tap starts or stops the text moving.
   */
  function onPageClick(event: MouseEvent): void {
    if (swiped || pressed) {
      swiped = false;
      pressed = false;
      return;
    }
    if (event.defaultPrevented || !host) return;
    if (scrolling) {
      togglePlay();
      return;
    }
    const side = zoneAt(event.clientX);
    if (side) return turn(side === 'next');
    // The system counts a mouse's clicks by its own setting, slower than a finger's taps.
    if (event.detail > 2) return;
    if (tapTimer !== undefined || event.detail === 2) {
      clearTimeout(tapTimer);
      tapTimer = undefined;
      return toggleFullscreen();
    }
    tapTimer = setTimeout(
      () => {
        tapTimer = undefined;
        fit(!fitted);
      },
      pointerType === 'mouse' ? DOUBLE_CLICK_MS : DOUBLE_TAP_MS,
    );
  }

  /** A long press on the text: the voice reads from the sentence under the finger. */
  function readFrom(clientX: number, clientY: number): void {
    pressTimer = undefined;
    pressRing = undefined;
    pressed = true;
    if (!voiceState.status?.installed) return openVoiceSheet();
    const place = ctrl?.listeningStartAt(clientX, clientY);
    if (!place) return;
    navigator.vibrate?.(15);
    if (aloud?.active) aloud.start(place);
    else listenFrom(place);
  }

  /** Space and a tap on the scrolling text: pause or go on with whatever moves, the voice first. */
  function togglePlay(): void {
    if (aloud?.active) return toggleAloud();
    if (!ctrl) return;
    if (ctrl.playing) ctrl.pause();
    else ctrl.play();
  }

  function toggleAloud(): void {
    if (aloudState?.paused) aloud?.resume();
    else aloud?.pause();
  }

  /** The toolbar's Autoscroll: from pages it switches to one scrolling column and starts at once. */
  async function autoscroll(): Promise<void> {
    stopListening();
    lookOpen = false;
    sheetOpen = false;
    if (!scrolling) await restyle({ mode: 'scroll' });
    togglePlay();
  }

  function stopListening(): void {
    aloud?.stop();
    aloud = undefined;
    speaker?.release();
    lock?.release();
    lock = undefined;
  }

  /** Opens or closes the voice sheet, from the button pressed or else the toolbar's Listen. */
  function openVoiceSheet(from?: HTMLElement): void {
    if (sheetOpen) return closeVoiceSheet();
    lookOpen = false;
    sheetOpener = from;
    sheetOpen = true;
  }

  /** Puts the voice sheet away and gives the focus back to what opened it. */
  function closeVoiceSheet(): void {
    sheetOpen = false;
    (sheetOpener?.isConnected ? sheetOpener : listenButton)?.focus();
    sheetOpener = undefined;
  }

  /**
   * The toolbar's Listen: reads the book aloud from the first paragraph on
   * screen, chapter after chapter, or stops. Without the voice it opens the
   * sheet that sets it up.
   */
  function toggleListen(): void {
    if (aloud?.active) return stopListening();
    if (!voiceState.status?.installed) return openVoiceSheet();
    listenFrom();
  }

  /** Reads aloud from the first paragraph on screen, or from a place chosen on it. */
  function listenFrom(place?: Parameters<ReadAloud['start']>[0]): void {
    if (!ctrl || !session) return;
    // One thing moves the page at a time: the voice takes over from the scrolling.
    if (ctrl.playing) ctrl.pause();
    const out = (speaker ??= voiceOutput());
    out.unlock();
    out.setRate(app.settings.voiceRate);
    const voice = (narrator ??= voiceService().narrator());
    const loaded = voice.load();
    const lang = bookLang;
    const reading = new ReadAloud({
      reader: ctrl,
      narrator: {
        speak: (text, l, v) => loaded.then(() => voice.speak(text, l, v)),
        // Known once the voice has loaded, before the first piece is made.
        get sampleRate() {
          return voice.sampleRate;
        },
      },
      player: {
        play: (samples, signal) => out.play(samples, voice.sampleRate, signal),
        pause: () => out.pause(),
        resume: () => out.resume(),
      },
      lang,
      voice: () => app.settings.voice,
      onState: (state) => {
        if (aloud !== reading) return;
        aloudState = state;
        if (state === null) stopListening();
      },
      onError: (e) => {
        if (aloud === reading) listenError = errorMessage(e);
      },
    });
    aloud = reading;
    listenError = '';
    if (!reading.start(place)) {
      aloud = undefined;
      return;
    }
    lookOpen = false;
    sheetOpen = false;
    voiceState.ready = false;
    voiceState.message = undefined;
    lock = mediaSession(
      { title: session.book.meta.title, artist: session.book.meta.authors.join(', ') },
      {
        play: () => reading.resume(),
        pause: () => reading.pause(),
        previous: () => reading.skip(-1),
        next: () => reading.skip(1),
      },
    );
  }

  // A turn of the wheel or a swipe of two fingers on a touchpad turns one page.
  // A touchpad sends a stream of small moves for one swipe, and goes on while
  // it glides, so the page turns once and the gesture ends after a short quiet.
  const WHEEL_STEP = 40;
  const WHEEL_QUIET_MS = 200;
  let wheelSum = 0;
  let wheelTurned = false;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;

  function onWheel(event: WheelEvent): void {
    // Ctrl with the wheel, or a pinch on a touchpad, zooms the browser.
    if (scrolling || event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (host?.clientWidth ?? 1) : 1;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelSum = 0;
      wheelTurned = false;
    }, WHEEL_QUIET_MS);
    if (wheelTurned) return;
    wheelSum += delta * unit;
    if (Math.abs(wheelSum) >= WHEEL_STEP) {
      wheelTurned = true;
      turn(wheelSum > 0);
    }
  }

  // Svelte adds wheel handlers as passive; this one has to keep the window still.
  $effect(() => {
    const el = host;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearTimeout(wheelTimer);
    };
  });

  /** One step slower or faster; a moving text changes speed at once. */
  function changePace(step: 1 | -1): void {
    const pace = stepPace(app.settings.pace, step);
    if (pace === app.settings.pace) return;
    ctrl?.setPace(pace);
    changeSettings({ pace }).catch((e: unknown) => (error = errorMessage(e)));
  }

  /** The listening bar's speed: the next of the steps, heard from the piece under way on. */
  function changeVoiceRate(): void {
    const at = VOICE_RATES.indexOf(app.settings.voiceRate);
    const voiceRate = VOICE_RATES[(at + 1) % VOICE_RATES.length]!;
    speaker?.setRate(voiceRate);
    changeSettings({ voiceRate }).catch((e: unknown) => (error = errorMessage(e)));
  }

  function goTo(chapter: number, fragment?: string): void {
    panelOpen = false;
    jump({ spineIndex: chapter, ...(fragment ? { fragment } : {}) });
  }

  function jump(target: Parameters<ReadingController['goTo']>[0]): void {
    void ctrl?.goTo(target).catch((e: unknown) => (error = errorMessage(e)));
  }

  async function mark(): Promise<void> {
    if (!ctrl || !session) return;
    const pos = ctrl.position();
    const label = session.book.chapters[pos.spineIndex]?.title ?? `Chapter ${pos.spineIndex + 1}`;
    try {
      marks = [...marks, await addBookmark(session.bookId, pos, label)];
      tab = 'marks';
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function unmark(id: string): Promise<void> {
    try {
      await removeBookmark(id);
      marks = marks.filter((m) => m.id !== id);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function pinNote(): Promise<void> {
    if (!ctrl || !session) return;
    try {
      const note = await addNote(session.bookId, ctrl.position());
      notes = [...notes, note];
      tab = 'notes';
      await tick();
      document.getElementById(`note-${note.id}`)?.focus();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function writeNote(id: string, text: string): void {
    notes = notes.map((note) => (note.id === id ? { ...note, text } : note));
    clearTimeout(pending.get(id));
    pending.set(
      id,
      setTimeout(() => void storeNote(id, false), 600),
    );
  }

  /** Keeps a note's text; a note left empty is taken off the page when it loses focus. */
  async function storeNote(id: string, final = true): Promise<void> {
    clearTimeout(pending.get(id));
    pending.delete(id);
    const note = notes.find((other) => other.id === id);
    if (!note || (!final && note.text.trim() === '')) return;
    try {
      if (!(await saveNote(note, note.text))) notes = notes.filter((other) => other.id !== id);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function unpin(id: string): Promise<void> {
    clearTimeout(pending.get(id));
    pending.delete(id);
    try {
      await removeNote(id);
      notes = notes.filter((note) => note.id !== id);
    } catch (e) {
      error = errorMessage(e);
    }
    host?.focus();
  }

  function fold(id: string): void {
    folded = folded.includes(id) ? folded.filter((other) => other !== id) : [...folded, id];
  }

  const firstLine = (text: string) => text.trim().split('\n')[0] || 'Empty note';

  function onBookFiles(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length > 0) void addFiles(files, 'lectorium');
  }

  async function restyle(patch: Partial<Settings>): Promise<void> {
    try {
      const mode = app.settings.mode;
      await changeSettings(patch);
      if (app.settings.mode !== mode) await ctrl?.setMode(app.settings.mode);
      else if (patch.fontSizePercent !== undefined || patch.theme !== undefined)
        await ctrl?.setLook(look());
      refreshWhere();
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:window onkeydown={onKey} onpointerdown={onWindowPointerDown} />

<section
  class="room lectorium"
  class:open-book={bookId}
  class:fitted
  class:scrolling={bookId && scrolling}
  aria-labelledby="lectorium-title"
>
  {#if !bookId}
    <RoomHero room="lectorium" />
    <div class="pick-head">
      <!-- Words that change are made anew, here and below: a page the browser translates has its
           words swapped for others, and a change made to the old ones would never be seen. -->
      {#key app.shelf.length > 0}
        <h2 class="pick-title">{app.shelf.length > 0 ? 'Choose a book' : 'Your shelf'}</h2>
      {/key}
      <label class="button primary">
        <Icon name="plus" size={18} />
        Add EPUB books
        <input type="file" accept={BOOK_FILES} multiple onchange={onBookFiles} />
      </label>
    </div>
    {#if app.shelf.length > 0}
      <Bookcase
        books={app.shelf}
        current={app.lastBookId}
        landing={app.landing}
        onlanded={landed}
      />
    {:else}
      <div class="pick-area">
        <!-- The empty shelf opens the file picker too; keyboards use the button above. -->
        <input
          class="area-input"
          type="file"
          accept={BOOK_FILES}
          multiple
          tabindex="-1"
          aria-hidden="true"
          onchange={onBookFiles}
        />
        <Bookcase books={[]} />
      </div>
    {/if}
    <div role="status" class="notices">
      {#if app.noticeRoom === 'lectorium'}
        {#each app.libraryNotices as notice (notice)}
          <p class={notice.tone}>{notice.text}</p>
          {#if notice.details?.length}
            <ul class="details">
              {#each notice.details as detail (detail)}<li>{detail}</li>{/each}
            </ul>
          {/if}
        {/each}
      {/if}
    </div>
    {#if app.shelf.length === 0}
      <p class="empty">
        No books yet. Click the shelf or drop an EPUB file on it and the book lands there, or add
        one in the
        <a href="#/bibliotheca">library</a>, where you can also find free ones. Choose a spine to
        read the book.
      </p>
      <Incipit delay={420} />
    {/if}
  {:else}
    <div class="reading-bar">
      <a class="to-shelf" href="#/lectorium" title="Back to the shelf">
        <Icon name="back" size={18} />
        <span>All books</span>
      </a>
      <div class="reading-title">
        <span class="room-tag" aria-hidden="true">Lectorium</span>
        <!-- The book's own words, here and on its pages, are never the browser's to translate. -->
        {#key book}
          <h1 id="lectorium-title" translate={book ? 'no' : undefined}>
            {book?.meta.title ?? 'Opening…'}
          </h1>
        {/key}
      </div>
      <div class="toolbar">
        <button
          type="button"
          class="panel-toggle"
          aria-expanded={panelOpen}
          aria-controls="reader-panel"
          onclick={() => (panelOpen = !panelOpen)}
        >
          <Icon name="contents" size={18} />
          <span class="tool-label">Contents</span>
        </button>
        <button type="button" onclick={mark} disabled={!session} title="Bookmark this page">
          <Icon name="bookmark" size={18} />
          <span class="tool-label">Bookmark<span class="sr-only"> this page</span></span>
        </button>
        <button type="button" onclick={pinNote} disabled={!session} title="Pin a note to this page">
          <Icon name="note" size={18} />
          <span class="tool-label">Add note</span>
        </button>
        <button
          type="button"
          onclick={() => fit(true)}
          disabled={!session}
          aria-keyshortcuts="F"
          title="Fit the page to the window (F)"
        >
          <Icon name="expand" size={18} />
          <span class="tool-label">Full page</span>
        </button>
        <button
          type="button"
          class="autoscroll-toggle"
          onclick={autoscroll}
          disabled={!session}
          aria-pressed={playing}
          title="Let the text scroll by itself at a reading pace"
        >
          <Icon name={playing ? 'pause' : 'play'} size={18} />
          <span class="tool-label">Auto<wbr />scroll</span>
        </button>
        {#if voiceState.status?.installed}
          <button
            type="button"
            class="listen-toggle"
            bind:this={listenButton}
            onclick={toggleListen}
            disabled={!session}
            aria-pressed={aloudState !== null}
            title={aloudState ? 'Stop listening' : 'Read the book aloud from this page'}
          >
            <Icon name="listen" size={18} />
            <span class="tool-label">Listen</span>
          </button>
        {:else}
          <button
            type="button"
            class="listen-toggle"
            bind:this={listenButton}
            onclick={toggleListen}
            aria-expanded={sheetOpen}
            aria-controls="voice-sheet"
            title="Have the book read aloud: set up the voice"
          >
            <Icon name="listen" size={18} />
            <span class="tool-label">Listen</span>
          </button>
        {/if}
        <div class="look" bind:this={lookBox}>
          <button
            type="button"
            class="look-toggle"
            aria-expanded={lookOpen}
            aria-controls="reader-look"
            title="Text size, page colours and reading mode"
            onclick={() => {
              lookOpen = !lookOpen;
              if (lookOpen) sheetOpen = false;
            }}
          >
            <Icon name="text" size={18} />
            <span class="tool-label">Look</span>
          </button>
          <div id="reader-look" class="look-panel" hidden={!lookOpen}>
            <div class="group" role="group" aria-label="Text size">
              <button
                type="button"
                aria-label="Smaller text"
                disabled={app.settings.fontSizePercent <= 80}
                onclick={() => restyle({ fontSizePercent: app.settings.fontSizePercent - 10 })}
                >A−</button
              >
              <span class="size" translate="no">{app.settings.fontSizePercent}%</span>
              <button
                type="button"
                aria-label="Larger text"
                disabled={app.settings.fontSizePercent >= 200}
                onclick={() => restyle({ fontSizePercent: app.settings.fontSizePercent + 10 })}
                >A+</button
              >
            </div>
            <div class="group swatches" role="group" aria-label="Page colours">
              {#each [['light', 'Light'], ['sepia', 'Sepia'], ['dark', 'Dark']] as const as [value, label] (value)}
                <button
                  type="button"
                  class="swatch {value}"
                  aria-label={label}
                  title={label}
                  aria-pressed={app.settings.theme === value}
                  onclick={() => restyle({ theme: value })}
                >
                  {#if app.settings.theme === value}<Icon name="check" size={18} />{/if}
                </button>
              {/each}
            </div>
            <div class="group modes" role="group" aria-label="Reading">
              {#each [['pages', 'Pages'], ['scroll', 'Scroll']] as const as [value, label] (value)}
                <button
                  type="button"
                  class="mode"
                  aria-pressed={app.settings.mode === value}
                  onclick={() => restyle({ mode: value })}>{label}</button
                >
              {/each}
            </div>
            {#if scrolling}
              <label class="guide-switch">
                <span>Guide line</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={app.settings.guideLine}
                  aria-label="Guide line"
                  onclick={() => restyle({ guideLine: !app.settings.guideLine })}
                  ><span class="knob" aria-hidden="true"></span></button
                >
              </label>
            {/if}
          </div>
        </div>
      </div>
      {#if sheetOpen}
        <div class="voice-sheet-box" bind:this={sheetBox}>
          <VoiceSheet lang={bookLang} onListen={toggleListen} onClose={closeVoiceSheet} />
        </div>
      {/if}
    </div>

    {#if error}
      <p class="error" role="alert">{error} <a href="#/bibliotheca">Back to the library</a></p>
    {/if}
    {#if listenError}
      <p class="error" role="alert">{listenError}</p>
    {/if}

    <div class="reading" class:panel-open={panelOpen}>
      <aside id="reader-panel" aria-label="Contents, bookmarks and notes">
        <div class="panel-tabs" role="tablist" aria-label="Lists">
          {#each [['contents', 'Contents', 0], ['marks', 'Bookmarks', marks.length], ['notes', 'Notes', notes.length]] as const as [id, label, count] (id)}
            <button
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`list-${id}`}
              tabindex={tab === id ? 0 : -1}
              onclick={() => (tab = id)}
              onkeydown={onTabKey}
              >{label}{#if count > 0}<span class="count">{count}</span>{/if}</button
            >
          {/each}
        </div>
        <div
          id="list-contents"
          role="tabpanel"
          aria-labelledby="tab-contents"
          hidden={tab !== 'contents'}
        >
          <Contents entries={contents} onpick={goTo} />
        </div>
        <div id="list-marks" role="tabpanel" aria-labelledby="tab-marks" hidden={tab !== 'marks'}>
          {#if marks.length === 0}
            <p class="empty">No bookmarks yet. Bookmark keeps the page you are reading.</p>
          {:else}
            <ul class="marks">
              {#each marks as m (m.id)}
                <li>
                  <button
                    type="button"
                    class="link"
                    onclick={() => {
                      panelOpen = false;
                      jump({ spineIndex: m.spineIndex, fraction: m.fraction });
                    }}
                  >
                    <span translate={m.snippet ? 'no' : undefined}
                      >{m.snippet || `Chapter ${m.spineIndex + 1}`}</span
                    >
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
        </div>
        <div id="list-notes" role="tabpanel" aria-labelledby="tab-notes" hidden={tab !== 'notes'}>
          {#if notes.length === 0}
            <p class="empty">No notes yet. Add note pins one to the page you are reading.</p>
          {:else}
            <ul class="marks notes-list">
              {#each notes as note (note.id)}
                <li>
                  <button
                    type="button"
                    class="link"
                    onclick={() => {
                      panelOpen = false;
                      jump({ spineIndex: note.spineIndex, fraction: note.fraction });
                    }}
                  >
                    <span class="note-line" translate="no">{firstLine(note.text)}</span>
                    <small>{book ? Math.round(progressPercent(book, note)) : 0}%</small>
                  </button>
                  <button
                    type="button"
                    class="remove"
                    aria-label="Delete note"
                    onclick={() => unpin(note.id)}><Icon name="trash" size={16} /></button
                  >
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </aside>

      <div class="page-area">
        <div
          class="sheet"
          class:hinting={hinting && !scrolling}
          class:zone-prev={zone === 'prev'}
          class:zone-next={zone === 'next'}
          class:listening={aloudState !== null}
        >
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <div
            class="pages"
            bind:this={host}
            tabindex="0"
            role="document"
            aria-label={scrolling
              ? 'Book text. Scroll to read. Tap or press Space to start or stop scrolling by itself.'
              : 'Book page. Tap or swipe the sides, or use the arrow keys, to turn pages. Tap the middle or press F to fit the page to the window.'}
            onclick={onPageClick}
            onpointerdown={onPointerDown}
            onpointerup={onPointerUp}
            onpointercancel={() => {
              start = undefined;
              endPress();
            }}
            oncontextmenu={(event) => {
              if (pointerType === 'mouse') return;
              // A finger held on the page reads from there instead of opening the menu.
              // The phone's own long press can come before the timer, or after a cancel.
              event.preventDefault();
              if (!pressed) {
                endPress();
                readFrom(event.clientX, event.clientY);
              }
            }}
            onpointermove={onPointerMove}
            onpointerleave={() => (zone = undefined)}
          ></div>
          {#if pressRing}
            <span
              class="press-ring"
              style:left={`${pressRing.x}px`}
              style:top={`${pressRing.y}px`}
              aria-hidden="true"
            ></span>
          {/if}
          <span class="turn-hint turn-prev" aria-hidden="true"><Icon name="back" size={22} /></span>
          <span class="turn-hint turn-next" aria-hidden="true"><Icon name="arrow" size={22} /></span
          >
          {#if scrolling && app.settings.guideLine}
            <div class="guide-line" aria-hidden="true"></div>
          {/if}

          {#if pageNotes.length > 0}
            <div class="page-notes">
              {#each pageNotes as note (note.id)}
                {@const isFolded = folded.includes(note.id)}
                <div class="page-note" class:folded={isFolded}>
                  <div class="note-head">
                    <button
                      type="button"
                      class="note-fold"
                      aria-expanded={!isFolded}
                      aria-controls={`note-${note.id}`}
                      onclick={() => fold(note.id)}
                    >
                      <Icon name="note" size={14} />
                      {#key isFolded}
                        <span class="note-line" translate={isFolded ? 'no' : undefined}
                          >{isFolded ? firstLine(note.text) : 'Note'}</span
                        >
                      {/key}
                    </button>
                    <button
                      type="button"
                      class="note-remove"
                      aria-label="Delete note"
                      onclick={() => unpin(note.id)}><Icon name="close" size={14} /></button
                    >
                  </div>
                  <textarea
                    id={`note-${note.id}`}
                    aria-label="Note on this page"
                    placeholder="Write a note…"
                    rows="3"
                    maxlength={NOTE_LENGTH}
                    hidden={isFolded}
                    value={note.text}
                    oninput={(e) => writeNote(note.id, e.currentTarget.value)}
                    onfocus={() => ctrl?.pause()}
                    onblur={() => storeNote(note.id)}></textarea>
                </div>
              {/each}
            </div>
          {/if}

          {#if aloudState}
            <ListenBar
              reader={readerName}
              paused={aloudState.paused}
              waiting={aloudState.waiting}
              starting={aloudState.piece === ''}
              onToggle={toggleAloud}
              onSkip={(by) => aloud?.skip(by)}
              rate={app.settings.voiceRate}
              onRate={changeVoiceRate}
              {sheetOpen}
              onVoice={openVoiceSheet}
              onClose={stopListening}
            />
          {:else if scrolling && session}
            <div class="autoscroll-bar" class:playing role="group" aria-label="Scrolling by itself">
              <button
                type="button"
                aria-label="Slower"
                aria-keyshortcuts="-"
                title="Slower (−)"
                disabled={app.settings.pace <= (PACES[0] ?? 0)}
                onclick={() => changePace(-1)}><Icon name="minus" size={18} /></button
              >
              {#key app.settings.pace}
                <span class="pace">{app.settings.pace} words/min</span>
              {/key}
              <button
                type="button"
                aria-label="Faster"
                aria-keyshortcuts="+"
                title="Faster (+)"
                disabled={app.settings.pace >= (PACES[PACES.length - 1] ?? Infinity)}
                onclick={() => changePace(1)}><Icon name="plus" size={18} /></button
              >
              <button type="button" class="play" aria-keyshortcuts="Space" onclick={togglePlay}>
                <Icon name={playing ? 'pause' : 'play'} size={18} />
                <!-- The button itself stays, keeping the focus a key press gave it. -->
                {#key playing}<span>{playing ? 'Pause' : 'Play'}</span>{/key}
              </button>
            </div>
          {/if}

          {#if fitted}
            <div class="fit-bar">
              {#if session && where.pages > 0 && !scrolling}
                <span class="fit-where" translate="no">{where.page + 1} / {where.pages}</span>
              {:else if session && scrolling}
                <span class="fit-where" translate="no">{Math.round(where.percent)}%</span>
              {/if}
              <button type="button" onclick={() => fit(false)} aria-keyshortcuts="Escape">
                <Icon name="close" size={16} />
                Exit full page
              </button>
            </div>
          {/if}
        </div>
        <div class="page-nav">
          <button type="button" onclick={() => turn(false)} disabled={!session}>
            <Icon name="back" size={18} /> <span class="nav-label">Previous</span>
          </button>
          <!-- The live region stays and what it says is made anew, so a change is still heard. -->
          <p class="where" aria-live="polite">
            {#key `${where.page} ${where.pages} ${where.chapter} ${Math.round(where.percent)} ${scrolling}`}
              <span>
                {#if session && scrolling}
                  <span class="of-chapters"
                    >{`Chapter ${where.chapter + 1} of ${book?.chapters.length} · `}</span
                  >{`${Math.round(where.percent)}%`}{#if chapterTitle}<span class="chapter"
                      ><span class="sep">{' · '}</span><span translate="no">{chapterTitle}</span
                      ></span
                    >{/if}
                {:else if session && where.pages > 0}
                  Page {where.page + 1} of {where.pages}<span class="of-chapters"
                    >{` · chapter ${where.chapter + 1} of ${book?.chapters.length}`}</span
                  >{` · ${Math.round(where.percent)}%`}{#if chapterTitle}<span class="chapter"
                      ><span class="sep">{' · '}</span><span translate="no">{chapterTitle}</span
                      ></span
                    >{/if}
                {/if}
              </span>
            {/key}
          </p>
          <button type="button" onclick={() => turn(true)} disabled={!session}>
            <span class="nav-label">Next</span>
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>
    </div>
  {/if}
</section>
