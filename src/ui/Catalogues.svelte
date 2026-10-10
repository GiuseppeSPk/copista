<script lang="ts">
  import { CATALOGUES, catalogueHref } from './catalogues';
  import Icon from './Icon.svelte';
  import TitleCover from './TitleCover.svelte';

  /** Public-domain libraries, linked and never fetched: the reader brings the EPUB back. */
  let query = $state('');
  const searching = $derived(query.trim() !== '');
</script>

<section class="catalogues" aria-labelledby="catalogues-title">
  <div class="catalogues-head">
    <h2 id="catalogues-title">Find free books</h2>
    <p>
      These libraries give away books whose copyright has ended. Download the EPUB there, then drop
      it here: it stays on this device. The links open their sites in a new tab; Copista sends them
      nothing.
    </p>
    <label class="catalogue-search">
      <span class="sr-only">Title or author to search for</span>
      <input type="search" placeholder="Title or author" autocomplete="off" bind:value={query} />
    </label>
  </div>

  <ul class="catalogue-list">
    {#each CATALOGUES as catalogue, i (catalogue.name)}
      <li class="catalogue" style:--i={i}>
        <ul class="fan" aria-label="Books at {catalogue.name}">
          {#each catalogue.classics as book, b (book.title)}
            <li style:--s={b}>
              <a
                href={book.href}
                target="_blank"
                rel="noopener noreferrer"
                title="{book.title}, {book.author}"
              >
                <TitleCover {book} binding={i + b} />
                <span class="sr-only">Find {book.title} at {catalogue.name}</span>
              </a>
            </li>
          {/each}
        </ul>
        <div class="catalogue-text">
          <h3>{catalogue.name}</h3>
          <p class="catalogue-lang">{catalogue.languages}</p>
          <p>{catalogue.about}</p>
        </div>
        <a
          class="button catalogue-go"
          href={catalogueHref(catalogue, query)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {searching ? 'Search' : 'Visit'}<span class="sr-only"> {catalogue.name}</span>
          <Icon name="external" size={16} />
        </a>
      </li>
    {/each}
  </ul>
</section>
