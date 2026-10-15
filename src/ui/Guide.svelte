<script lang="ts">
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
  <p class="guide-keys">
    Each number is also a key: press <kbd>1</kbd> to <kbd>4</kbd> to open that room, and
    <kbd>0</kbd> to come back to the hall.
  </p>
</section>
