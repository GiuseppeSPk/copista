<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DOWNLOAD_BYTES,
    VOICE_HOST,
    installVoice,
    removeVoice,
    voiceStatus,
    type VoiceStatus,
  } from '../rooms/auditorium';
  import type { VoiceId } from '../rooms/archivum';
  import Icon from './Icon.svelte';
  import RoomHero from './RoomHero.svelte';
  import { app, changeSettings } from './state.svelte';
  import { errorMessage, megabytes } from './text';

  /** The two readers, each with a recorded sample: Collodi for the Lector, Manzoni for the Lectrix. */
  const READERS: { id: VoiceId; name: string; sample: string; from: string }[] = [
    { id: 'M2', name: 'The Lector', sample: 'voice/lector', from: 'Pinocchio, Collodi' },
    { id: 'F1', name: 'The Lectrix', sample: 'voice/lectrix', from: 'I promessi sposi, Manzoni' },
  ];

  let status = $state<VoiceStatus | null>(null);
  let accepted = $state(false);
  let progress = $state<{ done: number; total: number } | null>(null);
  let controller: AbortController | undefined;
  let message = $state<{ tone: 'ok' | 'error'; text: string }>();

  async function measure(): Promise<void> {
    status = await voiceStatus().catch(() => ({ installed: false, bytes: 0 }));
  }

  onMount(() => {
    void measure();
    return () => controller?.abort();
  });

  async function download(): Promise<void> {
    controller = new AbortController();
    progress = { done: 0, total: DOWNLOAD_BYTES };
    message = undefined;
    try {
      await installVoice((done, total) => (progress = { done, total }), controller.signal);
      await measure();
      message = { tone: 'ok', text: 'The voice is ready. Open a book in the Lectorium to listen.' };
    } catch (e) {
      message =
        e instanceof DOMException && e.name === 'AbortError'
          ? { tone: 'ok', text: 'Download stopped. Next time it picks up where it left off.' }
          : { tone: 'error', text: errorMessage(e) };
    } finally {
      progress = null;
      controller = undefined;
    }
  }

  async function remove(): Promise<void> {
    try {
      await removeVoice();
      await measure();
      accepted = false;
      message = { tone: 'ok', text: 'The voice has been removed from this device.' };
    } catch (e) {
      message = { tone: 'error', text: errorMessage(e) };
    }
  }

  async function choose(voice: VoiceId): Promise<void> {
    try {
      await changeSettings({ voice });
    } catch (e) {
      message = { tone: 'error', text: errorMessage(e) };
    }
  }
</script>

<section class="room auditorium" aria-labelledby="auditorium-title">
  <RoomHero room="auditorium" />

  <h2>The Lector</h2>
  <div class="prose">
    <p>
      The Lector reads your books aloud. Open a book in the Lectorium, press Listen, and the page
      stays on screen while each sentence is read. The Lectrix, the Lector's female voice, reads
      too: choose whichever you prefer.
    </p>
    <p>The voice runs on this device. Once it is set up, it reads offline and sends nothing.</p>
  </div>

  <h2>Hear them first</h2>
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

  {#if status?.installed}
    <h2>Who reads</h2>
    <fieldset class="readers">
      <legend class="sr-only">Who reads aloud</legend>
      {#each READERS as reader (reader.id)}
        <label>
          <input
            type="radio"
            name="reader"
            value={reader.id}
            checked={app.settings.voice === reader.id}
            onchange={() => choose(reader.id)}
          />
          {reader.name}
        </label>
      {/each}
    </fieldset>

    <dl class="facts">
      <dt>Space used</dt>
      <dd>{megabytes(status.bytes)}</dd>
    </dl>
    <p>
      <button type="button" class="danger" onclick={remove}>
        <Icon name="trash" size={18} /> Remove the voice
      </button>
    </p>
  {:else if status}
    <h2>Set up the voice</h2>
    <p class="note">Works best on recent phones and computers.</p>
    <dl class="facts">
      <dt>Download</dt>
      <dd>About {megabytes(DOWNLOAD_BYTES)}, once</dd>
      <dt>From</dt>
      <dd>{VOICE_HOST}, and this site</dd>
      <dt>Then</dt>
      <dd>It reads offline. Nothing you read leaves this device.</dd>
    </dl>

    <h3>Licence</h3>
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
      <input type="checkbox" bind:checked={accepted} disabled={progress !== null} />
      I accept the licence and its use restrictions
    </label>

    {#if progress}
      <div class="download">
        <progress max={progress.total} value={progress.done} aria-label="Download"></progress>
        <span>{megabytes(progress.done)} of {megabytes(progress.total)}</span>
        <button type="button" onclick={() => controller?.abort()}>Cancel</button>
      </div>
    {:else}
      <p>
        <button type="button" class="primary" disabled={!accepted} onclick={download}>
          Download the voice
        </button>
      </p>
    {/if}
  {/if}

  <div role="status" class="notices">
    {#if message}<p class={message.tone}>{message.text}</p>{/if}
  </div>
</section>
