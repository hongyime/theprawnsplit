<script lang="ts">
  // svelte.config.js sets compilerOptions.runes = false, so this component is
  // compiled in legacy mode. `$props()`/`{@render}` are runes-only: in legacy
  // mode a `$`-prefixed identifier is read as a store auto-read of a variable
  // named `props`, producing a runtime `ReferenceError: props is not defined`
  // that crashed the whole app on boot. Legacy `export let` + <slot> is the
  // equivalent that actually works under this project's compiler settings.
  export let onclick: ((event: MouseEvent) => void) | undefined = undefined;
  let className = "";
  export { className as class };
  export let type: "button" | "submit" | "reset" = "button";
  export let disabled = false;
</script>
<button {type} class="neo-btn {className}" {disabled} on:click={onclick}><slot /></button>
<style>
  .neo-btn {
    border: 2px solid var(--neo-border);
    box-shadow: 3px 3px 0 var(--neo-border);
    background: var(--neo-bg);
    color: var(--neo-fg);
    font-weight: 600;
    cursor: pointer;
    padding: 8px 16px;
    font-family: inherit;
    border-radius: 0;
  }
  .neo-btn:active {
    box-shadow: 0 0 0;
    transform: translate(2px, 2px);
  }
</style>
