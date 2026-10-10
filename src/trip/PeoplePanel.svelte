<script lang="ts">
  // T61 (STRUCT-001): people/roster panel view extracted from Trip.svelte.
  // Controller retains claim signing, device linking, persistence and commands.
  import Icon from "@/lib/Icon.svelte";
  import type { Event } from "@theprawnsplit/core";
  import type { ParticipantNameMatch } from "@/lib/participants";

  interface Participant { pid: string; name: string; deactivated: boolean; devices: string[] }
  interface ClaimGroups { unclaimed: Participant[]; claimed: Participant[] }
  type NameMatch = ParticipantNameMatch;

  export let participants: Participant[];
  export let participantClaimGroups: ClaimGroups;
  export let localClaimPids: Set<string>;
  export let archived: boolean;
  export let joinBlocked: boolean;
  export let recoveryActive: boolean;
  export let syncing: boolean;
  export let participantNameMatch: NameMatch | null | undefined;

  export let participantName: string;
  export let selectedPids: Record<string, boolean>;
  export let participantNameInput: HTMLInputElement | undefined = undefined;

  export let addParticipant: () => void | Promise<void>;
  export let requestClaimParticipant: (pid: string) => void | Promise<void>;
  export let requestDeviceLink: (pid: string) => void | Promise<void>;
  export let voidParticipantClaim: (pid: string) => void | Promise<void>;
  export let deactivateParticipant: (pid: string) => void | Promise<void>;
  export let voidEvent: (id: string) => void | Promise<void>;
  export let activeDeactivationEvent: (pid: string) => Event | undefined;
  export let participantStatusText: (pid: string) => string;
  export let participantClaimAttribution: (pid: string) => string;
  export let matchText: (match: NameMatch) => string;
  export let runSync: () => void | Promise<void>;
  export let downloadExport: () => void | Promise<void>;
</script>

<article class="panel roster">
  <h2><Icon name="users" size={18} /> People</h2>
  {#if participants.length === 0}
    <div class="empty">
      {#if recoveryActive}
        <p>Waiting for recovered trip data.</p>
        <button type="button" disabled={syncing} on:click={runSync}><Icon name="refresh-ccw" size={17} /> Retry Sync</button>
      {:else}
        <p>Add people to start a trip ledger.</p>
        <div class="empty-actions">
          <button type="button" on:click={() => participantNameInput?.focus()}><Icon name="users" size={17} /> Add People</button>
          <button type="button" on:click={() => downloadExport()}><Icon name="download" size={17} /> Share trip file</button>
        </div>
      {/if}
    </div>
  {:else}
    {#if participantClaimGroups.unclaimed.length}
      <div class="claim-section primary-claim">
        <h3>Unclaimed</h3>
        <ul class="people-list">
          {#each participantClaimGroups.unclaimed as participant}
            {@const hiddenEvent = activeDeactivationEvent(participant.pid)}
            <li class:inactive-person={participant.deactivated}>
              <label>
                <input type="checkbox" bind:checked={selectedPids[participant.pid]} disabled={archived} />
                <span>
                  <strong>{participant.name}</strong>
                  <small>{participantStatusText(participant.pid)}</small>
                </span>
              </label>
              <span class="person-actions">
                <span class="person-status">{participant.deactivated ? "Hidden" : "Not claimed"}</span>
                {#if !archived}
                  <button type="button" on:click={() => requestClaimParticipant(participant.pid)} title="Claim Participant"><Icon name="key-round" size={15} /> Claim</button>
                  {#if hiddenEvent}
                    <button type="button" class="secondary" on:click={() => voidEvent(hiddenEvent.id)} title="Restore Default Splits">Restore</button>
                  {:else}
                    <button type="button" class="secondary" on:click={() => deactivateParticipant(participant.pid)} title="Hide From Default Splits">Hide</button>
                  {/if}
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if participantClaimGroups.claimed.length}
      <details class="claim-section claimed-section">
        <summary>Claimed People ({participantClaimGroups.claimed.length})</summary>
        <ul class="people-list">
          {#each participantClaimGroups.claimed as participant}
            {@const hiddenEvent = activeDeactivationEvent(participant.pid)}
            <li class:inactive-person={participant.deactivated}>
              <label>
                <input type="checkbox" bind:checked={selectedPids[participant.pid]} disabled={archived} />
                <span>
                  <strong>{participant.name}</strong>
                  <small>{participant.deactivated ? participantStatusText(participant.pid) : participantClaimAttribution(participant.pid)}</small>
                </span>
              </label>
              <span class="person-actions">
                <span class="person-status">
                  {participant.deactivated ? "Hidden" : `${participant.devices.length} device${participant.devices.length === 1 ? "" : "s"}`}
                  {#if localClaimPids.has(participant.pid)} · You{/if}
                </span>
                {#if !localClaimPids.has(participant.pid) && !archived}
                  <button type="button" class="secondary" on:click={() => requestDeviceLink(participant.pid)} title="Request Device Link"><Icon name="link" size={15} /> Link</button>
                {/if}
                {#if !archived}
                  {#if !localClaimPids.has(participant.pid)}
                    <button type="button" class="secondary danger-action" on:click={() => voidParticipantClaim(participant.pid)} title="Void Disputed Claim">Void Claim</button>
                  {/if}
                  {#if hiddenEvent}
                    <button type="button" class="secondary" on:click={() => voidEvent(hiddenEvent.id)} title="Restore Default Splits">Restore</button>
                  {:else}
                    <button type="button" class="secondary" on:click={() => deactivateParticipant(participant.pid)} title="Hide From Default Splits">Hide</button>
                  {/if}
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}
  <form class="row create-person" on:submit|preventDefault={addParticipant}>
    <input bind:this={participantNameInput} bind:value={participantName} placeholder="Add shadow participant" disabled={archived} />
    <button type="submit" disabled={joinBlocked || archived}><Icon name="plus" size={17} /> Add</button>
  </form>
  {#if participantNameMatch}
    <p class="hint duplicate-hint">{matchText(participantNameMatch)} Select the existing person before creating a new one.</p>
  {/if}
</article>
