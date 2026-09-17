<script lang="ts">
  let { children, class: className = '' } = $props();
</script>
<div class="neo-card {className}">{@render children()}</div>
<style>
  .neo-card {
    border: 2px solid var(--neo-border);
    box-shadow: 4px 4px 0 var(--neo-shadow);
    background: var(--neo-bg);
    border-radius: 0;
    padding: 16px;
  }
</style>
