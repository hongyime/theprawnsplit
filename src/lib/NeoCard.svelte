<script lang="ts">
  // See NeoButton.svelte: this project compiles with runes:false, so `$props()`
  // and `{@render}` are unavailable and a `$`-prefixed identifier would be read
  // as a store auto-read of an undefined `props` variable.
  let className = "";
  export { className as class };
</script>
<div class="neo-card {className}"><slot /></div>
<style>
  .neo-card {
    border: 2px solid var(--neo-border);
    box-shadow: 4px 4px 0 var(--neo-shadow);
    background: var(--neo-bg);
    border-radius: 0;
    padding: 16px;
  }
</style>
