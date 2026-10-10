<script lang="ts">
  import Icon from './Icon.svelte';
  import { roomInfo, type RoomName } from './rooms';

  /** The opening of a room's page: its Latin name, what it is, and what can be done there. */
  let { room }: { room: RoomName } = $props();

  const info = $derived(roomInfo(room));
</script>

<header class="hero">
  <a class="back" href="#/"><Icon name="back" size={16} /> All rooms</a>
  <h1 id="{room}-title" class="room-name" style:--vt="title-{room}">{info.name}</h1>
  <div class="hero-text">
    <p class="about">{info.about}</p>
    <ul class="can" aria-label="In this room">
      {#each info.can as item, i (item)}
        <li style:--i={i}><Icon name="check" size={16} />{item}</li>
      {/each}
    </ul>
  </div>
</header>
