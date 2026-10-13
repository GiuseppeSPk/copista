<script lang="ts">
  import {
    BATCH_LIMIT,
    LIBRARY_TARGETS,
    commonTargets,
    convert,
    convertLibraryBook,
    inspect,
    isPicture,
    type OutputFormat,
    type PrintCopy,
    zipCopies,
  } from '../rooms/scriptorium';
  import { importBook } from '../rooms/bibliotheca';
  import type { Collation, Part } from '../core/convert/census';
  import { app, go, refreshShelf } from './state.svelte';
  import { CONVERTIBLE_FILES, download } from './files';
  import BatchList, { type BatchRow } from './BatchList.svelte';
  import Icon from './Icon.svelte';
  import Inking from './Inking.svelte';
  import PrintPreview from './PrintPreview.svelte';
  import RoomHero from './RoomHero.svelte';
  import Stamp from './Stamp.svelte';
  import { FORMAT_LABELS, errorMessage } from './text';
  import { collationNote, collationRows, type CollationRow } from './collation';

  interface Picked {
    key: number;
    source: { file: File } | { bookId: string };
    name: string;
    format: string;
    needsMeta: boolean;
    targets: OutputFormat[];
    /** The pictures a Markdown file shows by name. */
    pictures: string[];
  }

  /** The files chosen, or the one book from the library. More than one makes a batch. */
  let list = $state.raw<Picked[]>([]);
  let keys = 0;
  const picked = $derived(list.length === 1 ? list[0] : undefined);
  const several = $derived(list.length > 1);
  const targets = $derived(commonTargets(list.map((p) => p.targets)));
  /** Pictures chosen for the Markdown files, which find them by name. */
  let pictures = $state.raw<{ key: number; file: File }[]>([]);
  const pictureFiles = $derived(pictures.map((p) => p.file));
  /** Pictures the chosen Markdown files show that were not chosen with them. */
  const missing = $derived.by(() => {
    const chosen = new Set(pictures.map((p) => p.file.name.toLowerCase()));
    const names = new Map<string, string>();
    for (const name of list.flatMap((p) => p.pictures)) {
      if (!chosen.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
    return [...names.values()];
  });
  const MISSING_SHOWN = 5;
  const missingNote = $derived.by(() => {
    const names = missing.slice(0, MISSING_SHOWN).map((name) => `“${name}”`);
    const more = missing.length - names.length;
    if (more > 0) names.push(`${more} more`);
    const listed =
      names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    const them = missing.length > 1 ? 'them' : 'it';
    return (
      `${list.length > 1 ? 'Your Markdown files show' : 'Your Markdown file shows'} ` +
      `${listed}. ` +
      `Choose ${them} too, or the book leaves ${them} out.`
    );
  });
  /** The files of the last batch, each with its copy once it is made. */
  let batch = $state<{ job: number; target: OutputFormat; rows: BatchRow[] }>();
  const copies = $derived(
    batch?.rows.flatMap((row) => (row.copy ? [$state.snapshot(row.copy)] : [])) ?? [],
  );
  const working = $derived(batch?.rows.findIndex((row) => row.state === 'working') ?? -1);
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
  /** The pages of the last PDF, kept so the preview can be opened again. */
  let pages = $state.raw<{ title: string; full: PrintCopy; withoutPictures: () => PrintCopy }>();
  let previewOpen = $state(false);
  /** The last EPUB made, which the reader can open here instead of in another app. */
  let made = $state.raw<{ blob: Blob; fileName: string }>();
  let opening = $state(false);

  async function check(
    job: number,
    target: OutputFormat,
    run: () => Promise<Collation>,
    chosen: Partial<Record<Part, string>> = {},
  ) {
    collation = { job, pending: true };
    try {
      const result = await run();
      if (collation?.job !== job) return;
      const note = collationNote(target);
      collation = {
        job,
        pending: false,
        rows: collationRows(result, target, chosen),
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

  /** Forgets the copies of the previous file. */
  function clearCopies(): void {
    pages = undefined;
    previewOpen = false;
    made = undefined;
  }

  /** Forgets everything the last job left in the Done column. */
  function clearDone(): void {
    clearCopies();
    message = undefined;
    stamp = undefined;
    collation = undefined;
    batch = undefined;
  }

  const sameFile = (a: File, b: File): boolean =>
    a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

  /** Adds files to those already chosen. A library book is converted alone, so they replace it. */
  async function choose(files: File[]): Promise<void> {
    clearDone();
    let kept = list.filter((p) => 'file' in p.source);
    if (kept.length < list.length) shelfChoice = '';
    if (kept.length === 0) {
      title = '';
      author = '';
    }
    const problems: string[] = [];
    let over = 0;
    for (const file of files.filter(isPicture)) {
      // A picture with the name of one already chosen replaces it.
      const name = file.name.toLowerCase();
      pictures = [
        ...pictures.filter((p) => p.file.name.toLowerCase() !== name),
        { key: ++keys, file },
      ];
    }
    for (const file of files.filter((f) => !isPicture(f))) {
      if (kept.some((p) => 'file' in p.source && sameFile(p.source.file, file))) continue;
      if (kept.length >= BATCH_LIMIT) {
        over += 1;
        continue;
      }
      try {
        const info = await inspect(file);
        kept = [...kept, { key: ++keys, source: { file }, name: file.name, ...info }];
      } catch (e) {
        problems.push(`${file.name}: ${errorMessage(e)}`);
      }
    }
    list = kept;
    if (over > 0) problems.push(`Up to ${BATCH_LIMIT} files at a time: ${over} left out.`);
    if (problems.length > 0) message = { tone: 'error', text: problems.join(' ') };
  }

  function chooseBook(id: string): void {
    const book = app.shelf.find((b) => b.id === id);
    clearDone();
    pictures = [];
    list = book
      ? [
          {
            key: ++keys,
            source: { bookId: book.id },
            name: book.title,
            format: 'epub',
            needsMeta: false,
            targets: LIBRARY_TARGETS,
            pictures: [],
          },
        ]
      : [];
  }

  let fileInput = $state<HTMLInputElement>();

  /** Puts a file back, so a wrong pick can be dropped without choosing another. */
  function unpick(key: number): void {
    clearDone();
    list = list.filter((p) => p.key !== key);
    if (list.length > 0) return;
    title = '';
    author = '';
    shelfChoice = '';
    fileInput?.focus();
  }

  function unpickPicture(key: number): void {
    clearDone();
    pictures = pictures.filter((p) => p.key !== key);
  }

  // Files dropped in another room land here.
  $effect(() => {
    const files = app.pendingConversion;
    if (!files) return;
    app.pendingConversion = undefined;
    void choose(files);
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
    if (several) return runBatch(target);
    if (!picked) return;
    busy = true;
    clearDone();
    try {
      const meta = picked.needsMeta
        ? {
            ...(title.trim() ? { title: title.trim() } : {}),
            ...(author.trim() ? { author: author.trim() } : {}),
          }
        : {};
      const out =
        'file' in picked.source
          ? await convert(picked.source.file, target, meta, pictureFiles)
          : await convertLibraryBook(picked.source.bookId, target);
      if (out.kind === 'print') {
        pages = {
          title: out.title,
          full: { html: out.html, check: out.check },
          withoutPictures: out.withoutPictures,
        };
        previewOpen = true;
        message = { tone: 'ok', text: 'Choose how the pages look, then save them as a PDF.' };
      } else {
        const job = ++jobs;
        download(out.blob, out.fileName);
        if (target === 'epub') made = { blob: out.blob, fileName: out.fileName };
        message = { tone: 'ok', text: `Saved “${out.fileName}”.` };
        stamp = { job, label: 'Copied', note: today() };
        void check(job, target, out.check);
      }
    } catch (e) {
      message = { tone: 'error', text: errorMessage(e) };
    } finally {
      busy = false;
    }
  }

  /** The print window is opening: stamp the job and check the pages it prints. */
  function onPrint(copy: PrintCopy, pictures: boolean): void {
    const job = ++jobs;
    message = {
      tone: 'ok',
      text: 'Print window opened: set the destination to “Save as PDF” to keep the file.',
    };
    stamp = { job, label: 'Ready', note: today() };
    void check(job, 'pdf', copy.check, pictures ? {} : { images: 'Left out, as you chose.' });
  }

  /**
   * Converts every chosen file in turn. A file that fails is marked and the
   * others go on; the copies are checked once they are all made.
   */
  async function runBatch(target: OutputFormat): Promise<void> {
    busy = true;
    clearDone();
    const job = ++jobs;
    const files = list.flatMap((p) => ('file' in p.source ? [p.source.file] : []));
    batch = {
      job,
      target,
      rows: list.map((p) => ({ key: p.key, name: p.name, state: 'waiting' })),
    };
    const rows = batch.rows;
    const checks: [BatchRow, () => Promise<Collation>][] = [];
    for (const [i, file] of files.entries()) {
      const row = rows[i]!;
      row.state = 'working';
      try {
        const out = await convert(file, target, {}, pictureFiles);
        if (out.kind !== 'file') throw new Error('PDF is made one book at a time.');
        row.copy = { blob: out.blob, fileName: out.fileName };
        row.state = 'done';
        checks.push([row, out.check]);
      } catch (e) {
        row.error = errorMessage(e);
        row.state = 'failed';
      }
    }
    busy = false;
    const done = checks.length;
    message =
      done === rows.length
        ? { tone: 'ok', text: `All ${done} files copied. Download them below.` }
        : { tone: done > 0 ? 'ok' : 'error', text: `${done} of ${rows.length} files copied.` };
    if (done > 0) stamp = { job, label: 'Copied', note: today() };
    for (const [row, read] of checks) {
      if (batch?.job !== job) return;
      row.check = { pending: true };
      try {
        row.check = { pending: false, rows: collationRows(await read(), target) };
      } catch {
        row.check = { failed: true };
      }
    }
  }

  async function downloadAll(): Promise<void> {
    if (!batch) return;
    download(await zipCopies(copies), `Copista copies (${FORMAT_LABELS[batch.target]}).zip`);
  }

  /** Puts every new EPUB on the shelf and shows them there. */
  async function shelveAll(): Promise<void> {
    opening = true;
    const problems: string[] = [];
    for (const { blob, fileName } of copies) {
      try {
        await importBook(new File([blob], fileName, { type: 'application/epub+zip' }));
      } catch (e) {
        problems.push(`${fileName}: ${errorMessage(e)}`);
      }
    }
    await refreshShelf();
    opening = false;
    if (problems.length > 0) message = { tone: 'error', text: problems.join(' ') };
    else go({ room: 'lectorium' });
  }

  /** Puts the new EPUB on the shelf and opens it in the Lectorium. */
  async function readHere(): Promise<void> {
    if (!made) return;
    opening = true;
    try {
      const file = new File([made.blob], made.fileName, { type: 'application/epub+zip' });
      const { book } = await importBook(file);
      await refreshShelf();
      go({ room: 'lectorium', bookId: book.id });
    } catch (e) {
      message = { tone: 'error', text: errorMessage(e) };
    } finally {
      opening = false;
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
        Choose files
        <input
          bind:this={fileInput}
          type="file"
          accept={CONVERTIBLE_FILES}
          multiple
          disabled={busy}
          onchange={(e) => {
            const input = e.currentTarget;
            const files = [...(input.files ?? [])];
            input.value = '';
            if (files.length > 0) void choose(files);
          }}
        />
      </label>
      <p class="hint">
        EPUB, Word (.docx), Markdown or plain text, with the pictures a Markdown file shows. Choose
        several to convert them together, or drop them here.
      </p>

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

      {#if list.length > 0}
        <ul class="picked-list" aria-label="Chosen">
          {#each list as p (p.key)}
            <li class="picked">
              <span class="picked-name">
                <strong>{p.name}</strong>
                <span class="format">{FORMAT_LABELS[p.format as OutputFormat] ?? p.format}</span>
              </span>
              <button
                type="button"
                class="icon-only unpick"
                title="Remove"
                disabled={busy}
                onclick={() => unpick(p.key)}
              >
                <Icon name="close" size={16} /><span class="sr-only">Remove {p.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if pictures.length > 0}
        <ul class="picked-list" aria-label="Pictures">
          {#each pictures as p (p.key)}
            <li class="picked">
              <span class="picked-name">
                <strong>{p.file.name}</strong>
                <span class="format">Picture</span>
              </span>
              <button
                type="button"
                class="icon-only unpick"
                title="Remove"
                disabled={busy}
                onclick={() => unpickPicture(p.key)}
              >
                <Icon name="close" size={16} /><span class="sr-only">Remove {p.file.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if missing.length > 0}
        <p class="hint">{missingNote}</p>
      {:else if pictures.length > 0 && !list.some((p) => p.format === 'md')}
        <p class="hint">Pictures go into a Markdown file that shows them: choose the file too.</p>
      {/if}
    </section>

    <section class="leg" aria-labelledby="leg-to">
      <h2 id="leg-to">To</h2>
      {#if list.length > 0}
        {#if picked?.needsMeta}
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
        {#if several}
          <p class="hint">
            {targets.length > 0
              ? `All ${list.length} files go to the format you choose.`
              : 'These files have no format in common. Remove the ones that differ.'}
            {#if targets.length > 0 && list.some((p) => p.needsMeta)}
              Titles come from the file names.
            {/if}
          </p>
        {/if}
        <div class="targets">
          {#each targets as target (target)}
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
        {#if busy}
          <p class="working">
            <Inking />{batch && working >= 0
              ? `Converting ${working + 1} of ${batch.rows.length}…`
              : 'Converting…'}
          </p>
        {/if}
        {#if message}<p class={message.tone}>{message.text}</p>{/if}
        {#if !busy && !message}<p class="hint">
            Your file is saved where your browser keeps downloads.
          </p>{/if}
      </div>
      {#if made}
        <button type="button" class="primary" disabled={opening} onclick={readHere}>
          <Icon name="read" size={18} />
          Read it here
        </button>
      {/if}
      {#if batch && !busy && copies.length > 0}
        <div class="batch-actions">
          <button
            type="button"
            class:primary={batch.target !== 'epub'}
            disabled={opening}
            onclick={downloadAll}
          >
            <Icon name="archive" size={18} />
            Download all (.zip)
          </button>
          {#if batch.target === 'epub'}
            <button type="button" class="primary" disabled={opening} onclick={shelveAll}>
              <Icon name="library" size={18} />
              Put them all on the shelf
            </button>
          {/if}
        </div>
      {/if}
      {#if batch}
        <BatchList rows={batch.rows} />
      {/if}
      {#if pages && !previewOpen}
        <button type="button" onclick={() => (previewOpen = true)}>Open the preview again</button>
      {/if}
      {#if stamp}
        {#key stamp.job}
          <Stamp label={stamp.label} note={stamp.note} />
        {/key}
      {/if}
      {#if collation}
        <section class="collation" aria-labelledby="collation-title" aria-live="polite">
          <h3 id="collation-title">Checked against the original</h3>
          {#if collation.pending}
            <p class="hint working"><Inking />Reading the copy back…</p>
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

{#if pages && previewOpen}
  <PrintPreview
    title={pages.title}
    full={pages.full}
    withoutPictures={pages.withoutPictures}
    onsave={onPrint}
    onclose={() => (previewOpen = false)}
  />
{/if}
