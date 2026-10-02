<script lang="ts">
  // See NeoButton.svelte: this project compiles with runes:false, so `$props()`
  // and `{@render}` are unavailable and a `$`-prefixed identifier would be read
  // as a store auto-read of an undefined `props` variable.
  let className = "";
  export { className as class };
</script>
<div class="neo-card {className}"><slot /></div>
<style>
  /* A sheet of paper laid on the desk: hairline edge, hard stamp shadow. */
  .neo-card {
    border: 1.5px solid var(--ink);
    box-shadow: var(--shadow-stamp);
    background: var(--paper);
    border-radius: var(--radius);
    padding: 1.5rem;
  }
</style>
