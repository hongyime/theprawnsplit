<script lang="ts">
  import { onDestroy } from "svelte";
  import Trip from "@/Trip.svelte";
  import NeoCard from "@/lib/NeoCard.svelte";
  import NeoButton from "@/lib/NeoButton.svelte";
  import { createGroup, ensureGroup, listGroups, readGroup, type GroupRecord, type StoredGroup } from "@/db/repo";
  import { decodeJoinSeed } from "@/lib/join-link";

  let loading = true;
  let error = "";
  let storedGroups: StoredGroup[] = [];
  let navigation = 0;
  let selection: { group: GroupRecord; version: number; joining: boolean; recovery: "first-join" | "evicted" } | null = null;

  async function navigate(read: () => Promise<GroupRecord | null>, joining = false, recovery: "first-join" | "evicted" = "first-join"): Promise<void> {
    const version = ++navigation;
    selection = null;
    loading = true;
    error = "";
    try {
      const group = await read();
      const groups = group ? [] : await listGroups();
      if (version !== navigation) return;
      if (group) selection = { group, version, joining, recovery };
      else storedGroups = groups;
    } catch (err) {
      if (version === navigation) error = err instanceof Error ? err.message : String(err);
    } finally {
      if (version === navigation) loading = false;
    }
  }

  function load(): void {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const encoded = params.get("join");
    void navigate(async () => {
      if (encoded === null) return null;
      let seed;
      try { seed = decodeJoinSeed(encoded); }
      catch { throw new Error("Join link is malformed."); }
      return ensureGroup(seed);
    }, encoded !== null, params.get("recovery") === "evicted" ? "evicted" : "first-join");
  }
  function startNewTrip(): void { void navigate(() => createGroup()); }
  function selectTrip(groupId: string): void { void navigate(() => readGroup(groupId)); }
  function showTripList(): void { void navigate(async () => null); }

  window.addEventListener("hashchange", load);
  onDestroy(() => { navigation++; window.removeEventListener("hashchange", load); });
  load();
</script>

{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if loading}
  <main class="center">Loading local ledger...</main>
{:else if !selection && storedGroups.length === 0}
  <main class="landing-screen">
    <NeoCard class="landing-content">
      <div class="landing-receipt-head">
        <img src="/favicon.svg" alt="The Prawn Split" class="landing-logo" width="64" height="64" />
        <span class="receipt-kicker">Shared trip ledger</span>
      </div>
      <h1>The Prawn <em>Split</em></h1>
      <p class="tagline">
        Split trip costs with friends.<br />
        No accounts. No ads. Works offline.
      </p>
      <NeoButton class="landing-btn" onclick={startNewTrip}>Start a new trip</NeoButton>
      <p class="hint-note">Got a link from a friend? Just open it.</p>
      <dl class="landing-footer" aria-label="How it works">
        <div><dt>Where your data lives</dt><dd>Only on your devices</dd></div>
        <div><dt>Who can read it</dt><dd>Only people with the link</dd></div>
        <div><dt>When it works</dt><dd>Offline, syncs later</dd></div>
      </dl>
    </NeoCard>
  </main>
{:else if !selection && storedGroups.length > 0}
  <main class="landing-screen group-list-screen">
    <div class="landing-content group-list-content">
      <div class="brand-header">
        <img src="/favicon.svg" alt="The Prawn Split" width="40" height="40" />
        <h1>The Prawn Split</h1>
      </div>
      <div class="trips-header">
        <h2>Your Trips</h2>
        <NeoButton onclick={startNewTrip}>+ Start a new trip</NeoButton>
      </div>
      <div class="trips-list" role="list">
        {#each storedGroups as g}
          <button type="button" class="trip-card" on:click={() => selectTrip(g.groupId)}>
            <div class="trip-card-info">
              <strong>{g.name || "Trip"}</strong>
              <span>{g.currency} · Created {new Date(g.createdAt).toLocaleDateString()}</span>
            </div>
            <span class="trip-arrow">→</span>
          </button>
        {/each}
      </div>
    </div>
  </main>
{:else if selection}
  {@const active = selection}
  {#key active.version}
    <Trip initialGroup={active.group} joiningFromLink={active.joining} recoveryMode={active.recovery}
      showTripList={() => { if (navigation === active.version) showTripList(); }}
      openImportedTrip={(id) => { if (navigation === active.version) selectTrip(id); }} />
  {/key}
{/if}
