<script lang="ts">
  import { convert, inspect, type OutputFormat } from '../rooms/scriptorium';
  import { app } from './state.svelte';
  import { download, printHtml } from './files';
  import { FORMAT_LABELS, errorMessage } from './text';

  interface Picked {
    file: File;
    format: string;
    needsMeta: boolean;
    targets: OutputFormat[];
  }

  let picked = $state.raw<Picked>();
  let title = $state('');
  let author = $state('');
  let busy = $state(false);
  let message = $state<{ tone: 'ok' | 'error'; text: string }>();

  async function choose(file: File): Promise<void> {
    picked = undefined;
    message = undefined;
    title = '';
    author = '';
    try {
      const info = await inspect(file);
      picked = { file, ...info };
    } catch (e) {
      message = { tone: 'error', text: `${file.name}: ${errorMessage(e)}` };
    }
  }

  // A file dropped in another room lands here.
  $effect(() => {
    const file = app.pendingConversion;
    if (!file) return;
    app.pendingConversion = undefined;
    void choose(file);
  });

  async function run(target: OutputFormat): Promise<void> {
    if (!picked) return;
    busy = true;
    message = undefined;
    try {
      const meta = picked.needsMeta
        ? {
            ...(title.trim() ? { title: title.trim() } : {}),
            ...(author.trim() ? { author: author.trim() } : {}),
          }
        : {};
      const out = await convert(picked.file, target, meta);
      if (out.kind === 'print') {
        printHtml(out.html);
        message = {
          tone: 'ok',
          text: 'Print view ready: choose “Save as PDF” in the print dialog.',
        };
      } else {
        download(out.blob, out.fileName);
        message = { tone: 'ok', text: `Saved “${out.fileName}”.` };
      }
    } catch (e) {
      message = { tone: 'error', text: errorMessage(e) };
    } finally {
      busy = false;
    }
  }
</script>

<section class="room" aria-labelledby="scriptorium-title">
  <h1 id="scriptorium-title">Scriptorium</h1>
  <p class="lead">
    Convert a file to another format. The work happens in this browser; the file is not uploaded and
    not kept.
  </p>

  <div class="toolbar">
    <label class="button primary">
      Choose a file
      <input
        type="file"
        accept=".epub,.docx,.md,.markdown,.txt,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
        disabled={busy}
        onchange={(e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          input.value = '';
          if (file) void choose(file);
        }}
      />
    </label>
    <span class="hint">EPUB, Word (.docx), Markdown or plain text. You can also drop it here.</span>
  </div>

  {#if picked}
    <div class="panel">
      <p>
        <strong>{picked.file.name}</strong>
        <span class="muted">({FORMAT_LABELS[picked.format as OutputFormat] ?? picked.format})</span>
      </p>

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

      <p class="muted">Convert to:</p>
      <div class="targets">
        {#each picked.targets as target (target)}
          <button type="button" disabled={busy} onclick={() => run(target)}>
            {FORMAT_LABELS[target]}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div role="status" class="notices">
    {#if busy}<p>Converting…</p>{/if}
    {#if message}<p class={message.tone}>{message.text}</p>{/if}
  </div>
</section>
