<script lang="ts">
  /** The mark a finished job receives. The status text next to it says the same in words. */
  let { label, note }: { label: string; note: string } = $props();
</script>

<div class="stamp" aria-hidden="true">
  <span class="stamp-label">{label}</span>
  <span class="stamp-note">{note}</span>
</div>
