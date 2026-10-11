<script lang="ts">
  import { flushSync, onMount, tick } from 'svelte';
  import { getDraw, putDraw, type DrawRecord } from '../rooms/bibliotheca/draw';
  import Icon from './Icon.svelte';
  import { hashOf } from './route';
  import {
    DECK,
    LENGTHS,
    MOODS,
    SOURCE,
    asked,
    deal,
    headline,
    lengthsFor,
    lotBySlug,
    monthKey,
    monthName,
    nextDraw,
    pace,
    readingTime,
    type LengthChoice,
    type Lot,
    type MoodChoice,
  } from './sortes';
  import Stamp from './Stamp.svelte';
  import TitleCover from './TitleCover.svelte';

  /** The month's book, drawn from three cards after two questions. One redraw a month. */
  let { delay = 0 }: { delay?: number } = $props();

  const now = new Date();
  const month = monthKey(now);
  const FLIP_MS = 900;

  type Phase = 'loading' | 'mood' | 'length' | 'cards' | 'drawn';
  let phase = $state<Phase>('loading');
  let draw = $state<DrawRecord | null>(null);
  let mood = $state<MoodChoice | null>(null);
  let length = $state<LengthChoice | null>(null);
  let hand = $state<Lot[]>([]);
  let dealt = $state(0);
  let picked = $state<number | null>(null);
  let morphing = $state(false);
  let unsaved = $state(false);
  let spoken = $state('');
  // Drawn in this visit, so the stamp is pressed now; a reload finds it already there.
  let fresh = $state(false);
  let section: HTMLElement;

  const lot = $derived(draw ? lotBySlug(draw.slug) : undefined);
  const redrawing = $derived(draw !== null && phase !== 'drawn');
  const moodLabel = $derived(MOODS.find((m) => m.value === mood)?.label);
  const lengthLabel = $derived(LENGTHS.find((l) => l.value === length)?.label);
  const lengths = $derived(mood ? LENGTHS.filter((l) => lengthsFor(mood!).includes(l.value)) : []);

  const binding = (l: Lot) => DECK.indexOf(l) % 4;
  const reduced = () =>
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  onMount(async () => {
    try {
      draw = await getDraw(month);
    } catch {
      draw = null;
    }
    // A book that has left the deck since it was drawn counts as no draw.
    phase = draw && lotBySlug(draw.slug) ? 'drawn' : 'mood';
    if (phase === 'mood') draw = null;
  });

  async function focusFirst(selector: string): Promise<void> {
    await tick();
    section.querySelector<HTMLElement>(selector)?.focus();
  }

  function chooseMood(value: MoodChoice): void {
    mood = value;
    phase = 'length';
    void focusFirst('.sortes-choices button');
  }

  function chooseLength(value: LengthChoice): void {
    length = value;
    hand = deal(mood!, value, Math.random, draw?.slug);
    dealt += 1;
    picked = null;
    phase = 'cards';
    void focusFirst('.lot');
  }

  function restart(): void {
    mood = null;
    length = null;
    hand = [];
    picked = null;
    phase = 'mood';
    void focusFirst('.sortes-choices button');
  }

  async function keep(): Promise<void> {
    phase = 'drawn';
    await focusFirst('.draw-title');
  }

  async function choose(index: number): Promise<void> {
    if (picked !== null) return;
    picked = index;
    const chosen = hand[index]!;
    const record: DrawRecord = {
      month,
      slug: chosen.slug,
      mood: mood!,
      length: length!,
      redrawn: draw !== null,
    };
    try {
      await putDraw(record);
      unsaved = false;
    } catch {
      unsaved = true;
    }
    // Let the card land face up before the page settles around it.
    if (!reduced()) await wait(FLIP_MS);
    await reveal(record);
  }

  async function reveal(record: DrawRecord): Promise<void> {
    const settle = () => {
      draw = record;
      fresh = true;
      phase = 'drawn';
      flushSync();
    };
    const start = document.startViewTransition?.bind(document);
    if (start && !reduced() && !document.documentElement.dataset.nav) {
      // The chosen card carries its name across, so it glides into place instead of jumping.
      morphing = true;
      flushSync();
      const transition = start(settle);
      const done = () => (morphing = false);
      void transition.ready.catch(() => undefined);
      void transition.finished.then(done, done);
      // The page changes inside the transition, a frame or so later: wait for it before focusing.
      await transition.updateCallbackDone.catch(() => {});
    } else {
      settle();
    }
    const found = lotBySlug(record.slug)!;
    spoken = `${headline(record.month + record.slug)} ${found.title}, by ${found.author}.`;
    await focusFirst('.draw-title');
  }
</script>

<section
  class="sortes"
  class:morphing
  style:--d="{delay}ms"
  aria-labelledby="sortes-title"
  bind:this={section}
>
  <h2 class="incipit-when" id="sortes-title">A book for {monthName(now)}</h2>
  <p class="sr-only" aria-live="polite">{spoken}</p>

  {#if phase === 'drawn' && draw && lot}
    <div class="draw" class:fresh>
      <div class="draw-card">
        <span class="lot-morph"><TitleCover book={lot} binding={binding(lot)} /></span>
        <Stamp label="Drawn" note="{monthName(now)} {now.getFullYear()}" />
      </div>
      <div class="draw-text">
        <p class="draw-headline">{headline(draw.month + draw.slug)}</p>
        <h3 class="draw-title" tabindex="-1"><cite>{lot.title}</cite></h3>
        <p class="draw-by">{lot.author}</p>
        <p class="draw-hook">{lot.hook}</p>
        <p class="draw-stats">
          <span>{lot.words.toLocaleString('en-GB')} words</span>
          <span aria-hidden="true">·</span>
          <span>{readingTime(lot.minutes)}</span>
          <span class="draw-pace">{pace(lot.minutes)}</span>
        </p>
        <div class="draw-actions">
          <a class="button primary" href={lot.href} target="_blank" rel="noopener noreferrer">
            Get it free
            <span class="sr-only">, at {SOURCE} (opens in a new tab)</span>
            <Icon name="external" size={16} />
          </a>
          {#if !draw.redrawn}
            <button type="button" class="incipit-next" onclick={restart}>Draw again</button>
          {/if}
        </div>
        <p class="draw-next">
          {#if draw.redrawn}
            Your next draw opens on {nextDraw(now)}.
          {:else}
            No take-backs. Well, one.
          {/if}
        </p>
        <p class="incipit-note">
          At {SOURCE}, which also gives the count and the reading time. Download the EPUB there, add
          it to your <a href={hashOf({ room: 'bibliotheca' })}>library</a>, and read it here.
        </p>
        {#if asked(draw.mood, draw.length)}
          <p class="draw-asked">{asked(draw.mood, draw.length)}</p>
        {/if}
        {#if unsaved}
          <p class="draw-unsaved">
            This browser would not keep the draw, so it will be gone after a reload.
          </p>
        {/if}
      </div>
    </div>
  {:else if phase !== 'loading'}
    <p class="sortes-lead">
      The Romans opened Virgil at random to learn their future. Answer two questions and turn a card
      to learn your next book.
    </p>
    <ol class="script" aria-label="The draw so far">
      <li class="script-line">
        <span class="speaker">Copista</span>
        <p>
          {#if redrawing}Again? Very well.{/if}
          What are you in the mood for?
        </p>
      </li>
      {#if mood}
        <li class="script-line you">
          <span class="speaker">You</span>
          <p>{moodLabel}.</p>
        </li>
        <li class="script-line">
          <span class="speaker">Copista</span>
          <p>And how much time have you got?</p>
        </li>
      {/if}
      {#if length}
        <li class="script-line you">
          <span class="speaker">You</span>
          <p>{lengthLabel}.</p>
        </li>
        <li class="script-line">
          <span class="speaker">Copista</span>
          <p>Pick a card. Any card.</p>
        </li>
      {/if}
    </ol>

    {#if phase === 'mood'}
      <div class="sortes-choices" role="group" aria-label="Your mood">
        {#each MOODS as choice, n (choice.value)}
          <button type="button" style:--n={n} onclick={() => chooseMood(choice.value)}
            >{choice.label}</button
          >
        {/each}
      </div>
    {:else if phase === 'length'}
      <div class="sortes-choices" role="group" aria-label="Your time">
        {#each lengths as choice, n (choice.value)}
          <button type="button" style:--n={n} onclick={() => chooseLength(choice.value)}
            >{choice.label}</button
          >
        {/each}
      </div>
    {:else if phase === 'cards'}
      {#key dealt}
        <ul class="hand" aria-label="Three cards">
          {#each hand as card, i (card.slug)}
            <li style:--i={i}>
              <button
                type="button"
                class="lot"
                class:turned={picked === i}
                class:passed={picked !== null && picked !== i}
                disabled={picked !== null}
                aria-label={picked === i
                  ? `${card.title}, by ${card.author}`
                  : `Card ${i + 1} of ${hand.length}, face down`}
                onclick={() => choose(i)}
              >
                <span class="lot-inner">
                  <span class="lot-back" aria-hidden="true"><span>C</span></span>
                  <span class="lot-face" class:lot-morph={picked === i}>
                    <TitleCover book={card} binding={binding(card)} />
                  </span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/key}
    {/if}

    {#if phase !== 'mood' || redrawing}
      <div class="sortes-after">
        {#if phase !== 'mood'}
          <button type="button" class="link" onclick={restart} disabled={picked !== null}
            >Start over</button
          >
        {/if}
        {#if redrawing && lot}
          <button type="button" class="link" onclick={keep} disabled={picked !== null}
            >Keep <cite>{lot.title}</cite></button
          >
        {/if}
      </div>
    {/if}
  {/if}
</section>
