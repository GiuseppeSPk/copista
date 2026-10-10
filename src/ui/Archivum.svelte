<script lang="ts">
  import { onMount } from 'svelte';
  import { deleteAllData, storageUsage, type Settings } from '../rooms/archivum';
  import Icon from './Icon.svelte';
  import RoomHero from './RoomHero.svelte';
  import { app, changeSettings, loadSettings, refreshShelf } from './state.svelte';
  import { errorMessage, megabytes } from './text';
  import { forgetTheme } from './theme.svelte';

  let usage = $state<{ usedBytes: number; quotaBytes: number } | null>(null);
  let message = $state<{ tone: 'ok' | 'error'; text: string }>();

  async function measure(): Promise<void> {
    usage = await storageUsage().catch(() => null);
  }

  onMount(() => {
    void measure();
  });

  async function setSettings(patch: Partial<Settings>): Promise<void> {
    try {
      await changeSettings(patch);
    } catch (e) {
      message = { tone: 'error', text: errorMessage(e) };
    }
  }

  async function eraseAll(): Promise<void> {
    if (
      !confirm(
        'Delete every book, reading position, bookmark, note and setting kept by Copista in this browser? This cannot be undone.',
      )
    ) {
      return;
    }
    try {
      await deleteAllData();
      forgetTheme();
      app.lastBookId = undefined;
      app.libraryNotices = [];
      await Promise.all([loadSettings(), refreshShelf(), measure()]);
      message = { tone: 'ok', text: 'Everything Copista kept in this browser has been deleted.' };
    } catch (e) {
      message = { tone: 'error', text: errorMessage(e) };
    }
  }
</script>

<section class="room archivum" aria-labelledby="archivum-title">
  <RoomHero room="archivum" />

  <h2>In this browser</h2>
  <dl class="facts">
    <dt>Books kept</dt>
    <dd>{app.shelf.length}</dd>
    <dt>Space used</dt>
    <dd>
      {#if usage}
        {megabytes(usage.usedBytes)}{#if usage.quotaBytes > 0}{' '}of {megabytes(usage.quotaBytes)} allowed{/if}
      {:else}
        The browser does not say.
      {/if}
    </dd>
    <dt>Sent anywhere</dt>
    <dd>Nothing. Books never leave this device.</dd>
  </dl>

  <h2>Reading settings</h2>
  <div class="fields">
    <label>
      Text size
      <select
        value={String(app.settings.fontSizePercent)}
        onchange={(e) => setSettings({ fontSizePercent: Number(e.currentTarget.value) })}
      >
        {#each [80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200] as size (size)}
          <option value={String(size)}>{size}%</option>
        {/each}
      </select>
    </label>
    <label>
      Page colours
      <select
        value={app.settings.theme}
        onchange={(e) => setSettings({ theme: e.currentTarget.value as Settings['theme'] })}
      >
        <option value="light">Light</option>
        <option value="sepia">Sepia</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  </div>

  <h2 id="privacy">Privacy</h2>
  <div class="prose">
    <p>
      Copista runs entirely in your browser. There is no account, no server of ours, no analytics,
      no cookies and no advertising.
    </p>
    <p>
      The books you add, your reading position, your bookmarks and notes, the month's draw and these
      settings are stored in this browser's own storage (IndexedDB) on this device. They are not
      uploaded and nobody else can see them. Your choice of light or dark interface is kept in the
      browser's local storage. Files you convert in the Scriptorium are read in memory and are not
      kept.
    </p>
    <p>
      The app files themselves come from the site that hosts Copista. Like any web host, it may
      record ordinary request logs, such as your IP address, when your browser downloads them. The
      public copy is hosted on GitHub Pages, where
      <a
        href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
        target="_blank"
        rel="noopener noreferrer">GitHub's privacy statement</a
      > applies. After the first visit the app works offline.
    </p>
    <p>Deleting your data below removes everything Copista has kept in this browser.</p>
  </div>

  <h2>Delete everything</h2>
  <p>
    <button type="button" class="danger" onclick={eraseAll}>
      <Icon name="trash" size={18} /> Delete all my data
    </button>
  </p>

  <div role="status" class="notices">
    {#if message}<p class={message.tone}>{message.text}</p>{/if}
  </div>
</section>
