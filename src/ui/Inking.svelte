<script lang="ts">
  /** Shown while Copista works: a nib writes a line of ink, which fades, and starts again. */
  const LINE = 'M2 15q1.75-3 3.5 0t3.5 0t3.5 0t3.5 0t3.5 0t3.5 0t3.5 0t3.5 0';
  // The nib's tip sits at its origin; the slit and the breather hole are cut out of it.
  const NIB =
    'M0 0L1.3-5.8C1.9-8.4 4.4-10.5 7-10.4L8.4-9.2C8.6-6.6 6.9-3.8 4.4-2.8Z' +
    'M.45-.55L3.15-5.25L3.6-5L.9-.3Z' +
    'M4.65-6.5a.75.75 0 1 0-1.5 0a.75.75 0 1 0 1.5 0Z';
  const DUR = '1.8s';
  const TIMES = '0;0.06;0.78;1';

  // Without motion the line stands written, the nib at its end.
  const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
</script>

<svg class="inking" viewBox="0 0 40 20" aria-hidden="true">
  <g>
    {#if !still}
      <animate
        attributeName="opacity"
        values="0;1;1;0"
        keyTimes="0;0.06;0.82;1"
        dur={DUR}
        repeatCount="indefinite"
      />
    {/if}
    <path
      class="inking-line"
      d={LINE}
      pathLength="1"
      fill="none"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-dasharray="1"
      stroke-dashoffset="0"
    >
      {#if !still}
        <animate
          attributeName="stroke-dashoffset"
          values="1;1;0;0"
          keyTimes={TIMES}
          dur={DUR}
          repeatCount="indefinite"
        />
      {/if}
    </path>
    <g transform={still ? 'translate(30 15)' : undefined}>
      {#if !still}
        <animateMotion
          path={LINE}
          keyPoints="0;0;1;1"
          keyTimes={TIMES}
          calcMode="linear"
          dur={DUR}
          repeatCount="indefinite"
        />
      {/if}
      <path d={NIB} fill="currentColor" fill-rule="evenodd" />
    </g>
  </g>
</svg>
