<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    reader,
    paused,
    waiting,
    onToggle,
    onSkip,
    onVoice,
    onClose,
  }: {
    /** The name of the voice reading, which opens the voice sheet. */
    reader: string;
    paused: boolean;
    /** The voice is being made and nothing is playing yet. */
    waiting: boolean;
    onToggle: () => void;
    onSkip: (by: 1 | -1) => void;
    onVoice: () => void;
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
    class="reader"
    aria-controls="voice-sheet"
    title="Change the voice"
    onclick={onVoice}>{reader}<span class="beta">Beta</span></button
  >
  <button type="button" aria-label="Stop listening" title="Stop listening" onclick={onClose}
    ><Icon name="close" size={18} /></button
  >
  <span class="sr-only" role="status">{waiting && !paused ? `${reader} is catching up…` : ''}</span>
</div>
