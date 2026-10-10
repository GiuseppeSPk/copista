<script lang="ts">
  import { CATALOGUES } from './catalogues';
  import Icon from './Icon.svelte';
  import { INCIPITS, incipitIndex, partOfDay } from './incipits';
  import { hashOf } from './route';

  /** The day's first line from a free classic, with the way to the rest of the book. */
  let { delay = 0 }: { delay?: number } = $props();

  const now = new Date();
  const WHEN = {
    morning: 'A first line for this morning',
    afternoon: 'A first line for this afternoon',
    evening: 'A first line for this evening',
    night: 'A first line for tonight',
  };

  let index = $state(incipitIndex(now));
  const line = $derived(INCIPITS[index]!);
  const catalogue = $derived(CATALOGUES.find((c) => c.name === line.catalogue) ?? CATALOGUES[0]!);
  const verse = $derived(line.text.includes('\n'));

  function another(): void {
    index = (index + 1) % INCIPITS.length;
  }
</script>

<section class="incipit" style:--d="{delay}ms" aria-labelledby="incipit-when">
  <h2 class="incipit-when" id="incipit-when">{WHEN[partOfDay(now)]}</h2>
  <div class="incipit-live" aria-live="polite">
    {#key index}
      <div class="incipit-body">
        <blockquote class:verse lang={line.lang}>
          <p>{line.text}</p>
        </blockquote>
        <p class="incipit-source">
          <cite lang={line.lang}>{line.title}</cite>
          <span class="incipit-by"
            >{line.author}{#if line.translator}, translated by {line.translator}{/if}</span
          >
        </p>
      </div>
    {/key}
  </div>
  <div class="incipit-actions">
    <a class="button primary" href={line.href} target="_blank" rel="noopener noreferrer">
      Read the rest, free
      <span class="sr-only">, at {catalogue.name} (opens in a new tab)</span>
      <Icon name="external" size={16} />
    </a>
    <button type="button" class="incipit-next" onclick={another}>Another first line</button>
  </div>
  <p class="incipit-note">
    At {catalogue.name}. Download the EPUB there, add it to your
    <a href={hashOf({ room: 'bibliotheca' })}>library</a>, and read it here.
  </p>
</section>
