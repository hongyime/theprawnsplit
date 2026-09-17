<!-- Vitest-only stub for src/lib/NeoButton.svelte (CR-prawn-ui):
     The runes component's {@render children()} fails in jsdom because legacy
     components pass slots, not snippets. This stub renders a real <button>
     so getByRole('button') and click-event assertions still work. -->
<script>
  export let type = 'button';
  export let disabled = false;
  export let onclick = undefined;
</script>
<button {type} {disabled} class={$$props.class ?? ''} on:click={onclick}><slot /></button>
