<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    reader,
    paused,
    waiting,
    starting,
    onToggle,
    onSkip,
    rate,
    onRate,
    sheetOpen,
    onVoice,
    onClose,
  }: {
    /** The name of the voice reading, which opens the voice sheet. */
    reader: string;
    paused: boolean;
    /** The voice is being made and nothing is playing yet. */
    waiting: boolean;
    /** Nothing has been heard yet since the reading started or moved. */
    starting: boolean;
    onToggle: () => void;
    onSkip: (by: 1 | -1) => void;
    /** How fast the voice is heard, as a multiple of its own pace. */
    rate: number;
    /** Steps on to the next speed. */
    onRate: () => void;
    /** The voice sheet is open. */
    sheetOpen: boolean;
    /** Opens or closes the voice sheet; focus goes back to the button pressed when it closes. */
    onVoice: (from: HTMLElement) => void;
    onClose: () => void;
  } = $props();
</script>

<div class="listen-bar" class:playing={!paused && !waiting} role="region" aria-label="Listening">
  <button type="button" aria-label="Previous" title="The piece before" onclick={() => onSkip(-1)}
    ><Icon name="previous" size={18} /></button
  >
  <button
    type="button"
    class="play"
    aria-label={paused ? 'Play' : 'Pause'}
    aria-keyshortcuts="Space"
    aria-busy={waiting && !paused}
    title={paused ? 'Go on reading (Space)' : 'Pause the reading (Space)'}
    onclick={onToggle}><Icon name={paused ? 'play' : 'pause'} size={18} /></button
  >
  <button type="button" aria-label="Next" title="The piece after" onclick={() => onSkip(1)}
    ><Icon name="next" size={18} /></button
  >
  <button
    type="button"
    class="rate"
    aria-label={`Speed ${rate} times`}
    title="Read faster or slower"
    onclick={onRate}>{rate}×</button
  >
  <button
    type="button"
    class="reader"
    aria-controls="voice-sheet"
    aria-expanded={sheetOpen}
    title="Change the voice"
    onclick={(event) => onVoice(event.currentTarget)}>{reader}<span class="beta">Beta</span></button
  >
  <button type="button" aria-label="Stop listening" title="Stop listening" onclick={onClose}
    ><Icon name="close" size={18} /></button
  >
  <span class="listen-wait" role="status"
    >{#if waiting && !paused}<span class="sound-bars" aria-hidden="true"
        ><i></i><i></i><i></i><i></i></span
      >{#if starting}{reader} is getting ready…<small>Hold on a sentence to read from there.</small
        >{:else}{reader} is catching up…{/if}{/if}</span
  >
</div>
