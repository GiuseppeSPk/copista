<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DEFAULT_PRINT,
    PAGE_SIZES,
    PRINT_STYLE_ID,
    printCss,
    type PrintOptions,
  } from '../core/convert/to-html';
  import type { PrintCopy } from '../rooms/scriptorium';
  import Icon from './Icon.svelte';
  import Inking from './Inking.svelte';

  let {
    title,
    full,
    withoutPictures,
    onsave,
    onclose,
  }: {
    title: string;
    full: PrintCopy;
    withoutPictures: () => PrintCopy;
    /** Called just before the print dialog opens, with the copy it prints. */
    onsave: (copy: PrintCopy, pictures: boolean) => void;
    onclose: () => void;
  } = $props();

  /** Above this, the print dialog takes long to lay the book out: say how to make it quick. */
  const HEAVY = 8_000_000;
  const SHEET_GUTTER = 48;

  let dialog = $state<HTMLDialogElement>();
  let frame = $state<HTMLIFrameElement>();
  let options = $state<PrintOptions>({ ...DEFAULT_PRINT });
  let pictures = $state(true);
  let loading = $state(true);
  let boxWidth = $state(0);
  let boxHeight = $state(0);

  const copy = $derived(pictures ? full : withoutPictures());
  const url = $derived(URL.createObjectURL(new Blob([copy.html], { type: 'text/html' })));
  const heavy = $derived(full.html.length > HEAVY);
  const megabytes = $derived(Math.round(full.html.length / 1_000_000));

  // The sheet keeps the width of the paper and is scaled down to fit a narrow screen.
  const sheet = $derived(PAGE_SIZES[options.page].px + SHEET_GUTTER);
  const scale = $derived(boxWidth > 0 ? Math.min(1, boxWidth / sheet) : 1);

  $effect(() => {
    const current = url;
    loading = true;
    return () => URL.revokeObjectURL(current);
  });

  /** Writes the chosen page rules into the preview, which is the page that gets printed. */
  function applyOptions(): void {
    const style = frame?.contentDocument?.getElementById(PRINT_STYLE_ID);
    if (style) style.textContent = printCss(options);
  }

  $effect(() => {
    // Read every option so a change to any of them rewrites the rules.
    void [options.page, options.text, options.margins, options.breaks, options.contents];
    if (!loading) applyOptions();
  });

  function save(): void {
    applyOptions();
    onsave(copy, pictures);
    frame?.contentWindow?.print();
  }

  onMount(() => {
    dialog?.showModal();
  });
</script>

<dialog bind:this={dialog} class="print-preview" aria-labelledby="print-preview-title" {onclose}>
  <header class="print-head">
    <div>
      <h2 id="print-preview-title">Save as PDF</h2>
      <p class="hint">{title}</p>
    </div>
    <button type="button" class="icon-only" title="Close" onclick={() => dialog?.close()}>
      <Icon name="close" size={18} /><span class="sr-only">Close the preview</span>
    </button>
  </header>

  <div class="print-sheet" bind:clientWidth={boxWidth} bind:clientHeight={boxHeight}>
    <iframe
      bind:this={frame}
      title="Preview of the pages"
      src={url}
      style:width="{sheet}px"
      style:height="{boxHeight / scale}px"
      style:transform="scale({scale})"
      style:left="{Math.max(0, (boxWidth - sheet * scale) / 2)}px"
      onload={() => {
        applyOptions();
        loading = false;
      }}
    ></iframe>
    {#if loading}
      <p class="print-loading working" role="status"><Inking />Laying out the pages…</p>
    {/if}
  </div>

  <form class="print-options" onsubmit={(e) => e.preventDefault()}>
    <label>
      Page
      <select bind:value={options.page}>
        <option value="a4">A4</option>
        <option value="a5">A5, book size</option>
        <option value="letter">Letter</option>
      </select>
    </label>
    <label>
      Text
      <select bind:value={options.text}>
        <option value="small">Small</option>
        <option value="normal">Normal</option>
        <option value="large">Large</option>
      </select>
    </label>
    <label>
      Margins
      <select bind:value={options.margins}>
        <option value="narrow">Narrow</option>
        <option value="normal">Normal</option>
        <option value="wide">Wide</option>
      </select>
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={pictures} />
      Pictures
    </label>
    {#if heavy && pictures}
      <p class="hint">
        The pictures make this book {megabytes} MB. Without them the print window opens much faster.
      </p>
    {/if}
    <label class="check">
      <input type="checkbox" bind:checked={options.breaks} />
      Each chapter on a new page
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={options.contents} />
      Table of contents
    </label>

    <div class="print-save">
      <button type="button" class="primary" disabled={loading} onclick={save}>
        <Icon name="file" size={18} />
        Save as PDF
      </button>
      <p class="hint">
        Your browser's print window opens. Set the destination or printer to “Save as PDF”, then
        save. The preview stays here.
      </p>
    </div>
  </form>
</dialog>
