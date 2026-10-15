<script lang="ts">
  import { DOWNLOAD_BYTES, VOICE_HOST } from '../rooms/auditorium';
  import Icon from './Icon.svelte';
  import { app } from './state.svelte';
  import { megabytes } from './text';
  import {
    READERS,
    cancelDownload,
    chooseReader,
    downloadVoice,
    removeVoiceHere,
    voice,
  } from './voice.svelte';

  let { onListen, onClose }: { onListen: () => void; onClose: () => void } = $props();

  let listenHere: HTMLButtonElement | undefined = $state();

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
  <ul class="samples">
    {#each READERS as reader (reader.id)}
      <li>
        <span class="sample-name">{reader.name} <small>reads {reader.from}</small></span>
        <!-- Opus in WebM for most browsers, AAC for older Safari. -->
        <audio controls preload="none">
          <source src="{reader.sample}.webm" type="audio/webm" />
          <source src="{reader.sample}.m4a" type="audio/mp4" />
        </audio>
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
