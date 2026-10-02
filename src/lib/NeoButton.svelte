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
  /* The coral stamp: reserved for the one primary action on a screen. */
  .neo-btn {
    border: 1.5px solid var(--coral);
    background: var(--coral);
    color: #fff;
    font-family: var(--font-mono);
    font-weight: 600;
    letter-spacing: 0.04em;
    border-radius: var(--radius);
    box-shadow: none;
  }
  .neo-btn:not(:disabled):hover {
    transform: translate(-1px, -1px);
    box-shadow: 3px 3px 0 var(--ink);
  }
  .neo-btn:not(:disabled):active {
    transform: translate(1px, 1px);
    box-shadow: none;
  }
</style>
