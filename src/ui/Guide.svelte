<script module lang="ts">
  import { app, go } from './state.svelte';
  import { stillMotion } from './theme.svelte';

  /** Asked from another room: the guide is shown once the hall is there. */
  let wanted = false;

  /**
   * Down to the guide, which takes the focus so the keyboard carries on from
   * there; from another room, back to the hall first.
   */
  export function showGuide(): void {
    if (app.route.room !== 'home') {
      wanted = true;
      go({ room: 'home' });
      return;
    }
    const title = document.getElementById('guide-title');
    title?.scrollIntoView({ behavior: stillMotion() ? 'auto' : 'smooth', block: 'start' });
    title?.focus({ preventScroll: true });
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { hashOf } from './route';
  import { ROOMS, type RoomName } from './rooms';

  /** What each room is for and how to use it, in the order of the keys that open the rooms. */
  const STEPS: Record<RoomName, { title: string; how: string }> = {
    bibliotheca: {
      title: 'Keep a copy of your books',
      how: 'Drop EPUB files anywhere, or press Add EPUB books. Each one is saved in this browser and opens without a connection. Need a book? The Bibliotheca links to free classics.',
    },
    lectorium: {
      title: 'Read where you left off',
      how: 'Choose a spine on the shelf. Turn the page with the arrow keys, or tap or swipe its sides. Your page, bookmarks and the notes you pin to a page are kept.',
    },
    scriptorium: {
      title: 'Convert a document',
      how: 'Drop a Word, Markdown or text file, or an EPUB, and pick PDF, a web page or an e-book. Every copy is checked against the original.',
    },
    archivum: {
      title: 'Keep it to yourself',
      how: 'No account, nothing uploaded. The Archivum shows what is kept in this browser and erases it in one click.',
    },
  };

  onMount(() => {
    if (!wanted) return;
    wanted = false;
    showGuide();
  });
</script>

<section class="guide" aria-labelledby="guide-title">
  <h2 class="guide-title" id="guide-title" tabindex="-1">How it works</h2>
  <ol class="guide-steps">
    {#each ROOMS as info, i (info.room)}
      <li class="guide-step" style:--i={i}>
        <span class="guide-key" aria-hidden="true">{i + 1}</span>
        <h3>{STEPS[info.room].title}</h3>
        <p>{STEPS[info.room].how}</p>
        <a class="guide-go" href={hashOf({ room: info.room })}
          >Open the {info.name}<span class="sr-only">, or press {i + 1}</span></a
        >
      </li>
    {/each}
  </ol>
  <!-- Not a room, so not a number: the voice is heard from a book open in the Lectorium. -->
  <div class="guide-step guide-voice">
    <span class="guide-key" aria-hidden="true"><Icon name="listen" size={30} /></span>
    <h3>Listen to a book <span class="beta">Beta</span></h3>
    <p>
      Open a book and press Listen. The first time, set up the voice in the panel that opens: one
      download, then the Lector or the Lectrix reads aloud on this device, even offline.
    </p>
    <a class="guide-go" href={hashOf({ room: 'lectorium' })}>Choose a book to hear</a>
  </div>
  <p class="guide-keys">
    Each number is also a key: press <kbd>1</kbd> to <kbd>4</kbd> to open that room, and
    <kbd>0</kbd> to come back to the hall.
  </p>
</section>
