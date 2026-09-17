<script lang="ts">
  let { children, onclick, class: className = '', type = 'button' as 'button' | 'submit' | 'reset', ...rest } = $props();
</script>
<button {type} class="neo-btn {className}" {onclick} {...rest}>{@render children()}</button>
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
