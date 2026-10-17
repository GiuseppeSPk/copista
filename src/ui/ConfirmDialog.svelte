<script lang="ts">
  import { asking } from './confirm.svelte';

  function show(dialog: HTMLDialogElement): void {
    dialog.showModal();
  }
</script>

{#if asking.question}
  {@const question = asking.question}
  {#key question}
    <dialog
      class="confirm"
      aria-describedby="confirm-text"
      aria-label={question.action}
      use:show
      onclose={(e) => question.answer(e.currentTarget.returnValue === 'yes')}
    >
      <form method="dialog">
        <p id="confirm-text">{question.text}</p>
        <div class="confirm-actions">
          <!-- svelte-ignore a11y_autofocus -->
          <button type="submit" value="no" autofocus>Cancel</button>
          <button type="submit" value="yes" class="danger">{question.action}</button>
        </div>
      </form>
    </dialog>
  {/key}
{/if}
