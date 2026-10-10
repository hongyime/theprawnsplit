<script lang="ts">
  import Icon from "@/lib/Icon.svelte";

  type RecoveryMode = "first-join" | "evicted";

  export let mode: RecoveryMode;
  export let message: string;
  export let syncing: boolean;
  export let onModeChange: (mode: RecoveryMode) => void;
  export let onImport: () => void;
  export let onRetry: () => void | Promise<void>;
</script>

<section class="recovery-panel" aria-label="Trip Recovery">
  <div>
    <h2>{mode === "evicted" ? "Device storage empty" : "Join Trip"}</h2>
    <p>{message}</p>
    <div class="recovery-mode" aria-label="Recovery Mode">
      <button type="button" class:active={mode === "first-join"} on:click={() => onModeChange("first-join")}>First time here</button>
      <button type="button" class:active={mode === "evicted"} on:click={() => onModeChange("evicted")}>Had it before</button>
    </div>
  </div>
  <div class="recovery-actions">
    {#if mode === "evicted"}
      <button type="button" on:click={onImport}>Import JSON</button>
      <button type="button" disabled={syncing} on:click={onRetry}><Icon name="refresh-ccw" size={17} /> {syncing ? "Recovering" : "Retry Sync"}</button>
    {:else}
      <button type="button" disabled={syncing} on:click={onRetry}><Icon name="refresh-ccw" size={17} /> {syncing ? "Recovering" : "Retry Sync"}</button>
      <button type="button" class="secondary" on:click={onImport}>Import JSON</button>
    {/if}
  </div>
</section>
