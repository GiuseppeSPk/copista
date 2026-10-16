<script lang="ts">
  import { DOWNLOAD_BYTES, VOICE_HOST } from '../rooms/voice';
  import Icon from './Icon.svelte';
  import { app } from './state.svelte';
  import { megabytes } from './text';
  import type { Lang } from '../voice/text';
  import {
    READERS,
    SAMPLE_LANGS,
    cancelDownload,
    chooseReader,
    downloadVoice,
    removeVoiceHere,
    voice,
  } from './voice.svelte';

  let { lang, onListen, onClose }: { lang: Lang; onListen: () => void; onClose: () => void } =
    $props();

  let listenHere: HTMLButtonElement | undefined = $state();
  // The samples are first heard in the open book's language, until the reader picks the other.
  let chosen: Lang | undefined = $state();
  const heard = $derived(chosen ?? lang);

  // The Download button is gone once the voice is in, so its focus moves on to the next thing to
  // do, which also brings it into view.
  $effect(() => {
    listenHere?.focus();
  });
</script>

<section id="voice-sheet" class="voice-sheet" aria-labelledby="voice-sheet-title">
  <header>
    <h2 id="voice-sheet-title">The Lector <span class="beta">Beta</span></h2>
    <button type="button" class="close" aria-label="Close" title="Close" onclick={onClose}>
      <Icon name="close" size={18} />
    </button>
  </header>

  <div class="prose">
    <p>
      The Lector reads your books aloud on this device, and the Lectrix, the Lector's female voice,
      reads too: choose whichever you prefer.
    </p>
    <p class="note">
      The voice is new. It may stumble over a name or a number; it gets better with each version.
    </p>
  </div>

  <h3>Hear them first</h3>
  <p class="note">Both read the same few lines, so you can compare them.</p>
  <div class="sample-langs" role="group" aria-label="Language of the samples">
    {#each SAMPLE_LANGS as { lang: value, name } (value)}
      <button
        type="button"
        lang={value}
        aria-pressed={heard === value}
        onclick={() => (chosen = value)}>{name}</button
      >
    {/each}
  </div>
  <ul class="samples">
    {#each READERS as reader (reader.id)}
      <li>
        <span class="sample-name">{reader.name}</span>
        <!-- A new element for the other language, since a source changed in place is not loaded.
             Opus in WebM for most browsers, AAC for older Safari. -->
        {#key heard}
          <audio controls preload="none" lang={heard}>
            <source src="voice/{heard}/{reader.sample}.webm" type="audio/webm" />
            <source src="voice/{heard}/{reader.sample}.m4a" type="audio/mp4" />
          </audio>
        {/key}
      </li>
    {/each}
  </ul>

  {#if voice.status?.installed}
    <h3>Who reads</h3>
    <fieldset class="readers">
      <legend class="sr-only">Who reads aloud</legend>
      {#each READERS as reader (reader.id)}
        <label>
          <input
            type="radio"
            name="reader"
            value={reader.id}
            checked={app.settings.voice === reader.id}
            onchange={() => chooseReader(reader.id)}
          />
          {reader.name}
        </label>
      {/each}
    </fieldset>

    <dl class="facts">
      <dt>Space used</dt>
      <dd>{megabytes(voice.status.bytes)}</dd>
    </dl>
    <p>
      <button type="button" class="danger" onclick={removeVoiceHere}>
        <Icon name="trash" size={18} /> Remove the voice
      </button>
    </p>
  {:else if voice.status}
    <h3>Set up the voice</h3>
    <p class="note">Works best on recent phones and computers.</p>
    <dl class="facts">
      <dt>Download</dt>
      <dd>About {megabytes(DOWNLOAD_BYTES)}, once</dd>
      <dt>From</dt>
      <dd>{VOICE_HOST}, and this site</dd>
      <dt>Then</dt>
      <dd>It reads offline. Nothing you read leaves this device.</dd>
    </dl>

    <h4>Licence</h4>
    <div class="prose">
      <p>
        The voice is Supertonic 3 by Supertone Inc., in a lighter copy made for Copista, under the
        OpenRAIL-M licence. Its terms forbid using it to break the law; to harm or exploit minors;
        to harass, defame or impersonate anyone; to spread false or personal information to harm
        others; or to publish what it says without making clear that it is machine generated.
      </p>
      <p>
        <a href="licences/openrail-m.txt" target="_blank" rel="noopener">The full licence</a> ·
        <a href="licences/notices.txt" target="_blank" rel="noopener">Notices</a>
      </p>
    </div>

    <label class="accept">
      <input type="checkbox" bind:checked={voice.accepted} disabled={voice.progress !== null} />
      I accept the licence and its use restrictions
    </label>

    {#if voice.progress}
      <div class="download">
        <progress max={voice.progress.total} value={voice.progress.done} aria-label="Download"
        ></progress>
        <span>{megabytes(voice.progress.done)} of {megabytes(voice.progress.total)}</span>
        <button type="button" onclick={cancelDownload}>Cancel</button>
      </div>
    {:else}
      <p>
        <button type="button" class="primary" disabled={!voice.accepted} onclick={downloadVoice}>
          Download the voice
        </button>
      </p>
    {/if}
  {/if}

  <div role="status" class="notices">
    {#if voice.message}<p class={voice.message.tone}>{voice.message.text}</p>{/if}
  </div>

  <!-- Where Download was, under the news that the voice is in. -->
  {#if voice.status?.installed && voice.ready}
    <p class="next">
      <button type="button" class="primary" bind:this={listenHere} onclick={onListen}>
        <Icon name="listen" size={18} /> Listen from here
      </button>
    </p>
  {/if}
</section>
