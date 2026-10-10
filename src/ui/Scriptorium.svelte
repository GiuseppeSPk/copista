<script lang="ts">
  import {
    LIBRARY_TARGETS,
    convert,
    convertLibraryBook,
    inspect,
    type OutputFormat,
  } from '../rooms/scriptorium';
  import type { Collation } from '../core/convert/census';
  import { app } from './state.svelte';
  import { CONVERTIBLE_FILES, download, printHtml } from './files';
  import Icon from './Icon.svelte';
  import RoomHero from './RoomHero.svelte';
  import Stamp from './Stamp.svelte';
  import { FORMAT_LABELS, errorMessage } from './text';
  import { collationNote, collationRows, type CollationRow } from './collation';

  interface Picked {
    source: { file: File } | { bookId: string };
    name: string;
    format: string;
    needsMeta: boolean;
    targets: OutputFormat[];
  }

  let picked = $state.raw<Picked>();
  let title = $state('');
  let author = $state('');
  let shelfChoice = $state('');
  let busy = $state(false);
  let message = $state<{ tone: 'ok' | 'error'; text: string }>();
  /** The stamp of the last finished job; `job` counts jobs so each one presses its own. */
  let stamp = $state<{ job: number; label: string; note: string }>();
  let jobs = 0;
  /** What the copy, read back, holds of the original; `pending` while it is being read. */
  let collation = $state<
    | { job: number; pending: true }
    | { job: number; pending: false; rows: CollationRow[]; note?: string }
    | { job: number; pending: false; failed: true }
  >();

  async function check(job: number, target: OutputFormat, run: () => Promise<Collation>) {
    collation = { job, pending: true };
    try {
      const result = await run();
      if (collation?.job !== job) return;
      const note = collationNote(target);
      collation = {
        job,
        pending: false,
        rows: collationRows(result, target),
        ...(note ? { note } : {}),
      };
    } catch {
      if (collation?.job === job) collation = { job, pending: false, failed: true };
    }
  }

  function today(): string {
    return new Date()
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      .toUpperCase();
  }

  async function choose(file: File): Promise<void> {
    picked = undefined;
    message = undefined;
    stamp = undefined;
    collation = undefined;
    title = '';
    author = '';
    shelfChoice = '';
    try {
      const info = await inspect(file);
      picked = { source: { file }, name: file.name, ...info };
    } catch (e) {
      message = { tone: 'error', text: `${file.name}: ${errorMessage(e)}` };
    }
  }

  function chooseBook(id: string): void {
    const book = app.shelf.find((b) => b.id === id);
    message = undefined;
    stamp = undefined;
    collation = undefined;
    picked = book && {
      source: { bookId: book.id },
      name: book.title,
      format: 'epub',
      needsMeta: false,
      targets: LIBRARY_TARGETS,
    };
  }

  // A file dropped in another room lands here.
  $effect(() => {
    const file = app.pendingConversion;
    if (!file) return;
    app.pendingConversion = undefined;
    void choose(file);
  });

  // So does a book sent from its card in the Bibliotheca.
  $effect(() => {
    const id = app.pendingBookId;
    if (!id) return;
    app.pendingBookId = undefined;
    shelfChoice = id;
    chooseBook(id);
  });

  async function run(target: OutputFormat): Promise<void> {
    if (!picked) return;
    busy = true;
    message = undefined;
    stamp = undefined;
    collation = undefined;
    try {
      const meta = picked.needsMeta
        ? {
            ...(title.trim() ? { title: title.trim() } : {}),
            ...(author.trim() ? { author: author.trim() } : {}),
          }
        : {};
      const out =
        'file' in picked.source
          ? await convert(picked.source.file, target, meta)
          : await convertLibraryBook(picked.source.bookId, target);
      const job = ++jobs;
      if (out.kind === 'print') {
        printHtml(out.html);
        message = {
          tone: 'ok',
          text: 'Print view ready: choose “Save as PDF” in the print dialog.',
        };
        stamp = { job, label: 'Ready', note: today() };
      } else {
        download(out.blob, out.fileName);
        message = { tone: 'ok', text: `Saved “${out.fileName}”.` };
        stamp = { job, label: 'Copied', note: today() };
      }
      void check(job, target, out.check);
    } catch (e) {
      message = { tone: 'error', text: errorMessage(e) };
    } finally {
      busy = false;
    }
  }
</script>

<section class="room scriptorium" aria-labelledby="scriptorium-title">
  <RoomHero room="scriptorium" />

  <div class="ticket">
    <section class="leg" aria-labelledby="leg-from">
      <h2 id="leg-from">From</h2>
      <label class="button primary">
        <Icon name="file" />
        Choose a file
        <input
          type="file"
          accept={CONVERTIBLE_FILES}
          disabled={busy}
          onchange={(e) => {
            const input = e.currentTarget;
            const file = input.files?.[0];
            input.value = '';
            if (file) void choose(file);
          }}
        />
      </label>
      <p class="hint">EPUB, Word (.docx), Markdown or plain text. You can also drop it here.</p>

      {#if app.shelf.length > 0}
        <label class="library-pick">
          Or a book from your library
          <select
            bind:value={shelfChoice}
            disabled={busy}
            onchange={() => {
              if (shelfChoice) chooseBook(shelfChoice);
            }}
          >
            <option value="">Choose a book…</option>
            {#each app.shelf as book (book.id)}
              <option value={book.id}>
                {book.title}{book.authors.length ? ` — ${book.authors.join(', ')}` : ''}
              </option>
            {/each}
          </select>
        </label>
      {/if}

      {#if picked}
        <p class="picked">
          <strong>{picked.name}</strong>
          <span class="format">{FORMAT_LABELS[picked.format as OutputFormat] ?? picked.format}</span
          >
        </p>
      {/if}
    </section>

    <section class="leg" aria-labelledby="leg-to">
      <h2 id="leg-to">To</h2>
      {#if picked}
        {#if picked.needsMeta}
          <div class="fields">
            <label>
              Title
              <input type="text" bind:value={title} placeholder="From the file name if empty" />
            </label>
            <label>
              Author
              <input type="text" bind:value={author} placeholder="Unknown if empty" />
            </label>
          </div>
        {/if}
        <div class="targets">
          {#each picked.targets as target (target)}
            <button type="button" disabled={busy} onclick={() => run(target)}>
              {FORMAT_LABELS[target]}
            </button>
          {/each}
        </div>
      {:else}
        <p class="hint">The formats your file can become appear here once you choose it.</p>
      {/if}
    </section>

    <section class="leg done" aria-labelledby="leg-done">
      <h2 id="leg-done">Done</h2>
      <div role="status" class="notices">
        {#if busy}<p>Converting…</p>{/if}
        {#if message}<p class={message.tone}>{message.text}</p>{/if}
        {#if !busy && !message}<p class="hint">
            Your file is saved where your browser keeps downloads.
          </p>{/if}
      </div>
      {#if stamp}
        {#key stamp.job}
          <Stamp label={stamp.label} note={stamp.note} />
        {/key}
      {/if}
      {#if collation}
        <section class="collation" aria-labelledby="collation-title" aria-live="polite">
          <h3 id="collation-title">Checked against the original</h3>
          {#if collation.pending}
            <p class="hint">Reading the copy back…</p>
          {:else if 'failed' in collation}
            <p class="hint">The copy could not be read back, so it was not checked.</p>
          {:else}
            <dl class="facts">
              {#each collation.rows as row (row.label)}
                <dt>{row.label}</dt>
                <dd class:lost={row.lost}>
                  {row.value}
                  {#if row.reason}<span class="why">{row.reason}</span>{/if}
                  {#if row.missing?.length}
                    <span class="why">Missing, for example: {row.missing.join(', ')}</span>
                  {/if}
                </dd>
              {/each}
            </dl>
            {#if collation.note}<p class="hint">{collation.note}</p>{/if}
          {/if}
        </section>
      {/if}
    </section>
  </div>
</section>
