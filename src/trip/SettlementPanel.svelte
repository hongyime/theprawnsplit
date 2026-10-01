<script lang="ts">
  // T63 (STRUCT-001): settlement panel view extracted from Trip.svelte.
  // Controller retains authority evaluation, signing, and all commands —
  // this panel only renders and calls back through explicit props.
  import Icon from "@/lib/Icon.svelte";
  import { formatMinor, formatMinorInput } from "@/lib/money";
  import { canConfirmSettlement, hasActiveClaimAnomaly } from "@/lib/settlement-command";
  import { canVoidRecordedSettlement, settlementClaimView } from "@/lib/settlement-history";
  import type { Anomaly, Event, VerificationContext } from "@theprawnsplit/core";

  interface Participant { pid: string; name: string }
  interface Transfer { from: string; to: string; minor: bigint }
  interface Settlement {
    sid: string; from: string; to: string; minor: bigint;
    confirmed: boolean; disputed: boolean; pending: boolean;
    contestedConfirmation: boolean; cashUnconfirmable: boolean;
  }
  interface FrozenPolicy { allowSettlementActions: boolean }
  interface GroupLike { events: Event[]; identities: { pid: string }[] }

  export let archived: boolean;
  export let currency: string;
  export let participants: Participant[];
  export let suggestedSettlements: Transfer[];
  export let settlements: Settlement[];
  export let frozenPolicy: FrozenPolicy;
  export let group: GroupLike;
  export let anomalies: Anomaly[];
  export let verificationContext: VerificationContext | undefined;
  export let canRecordManualSettlement: boolean;

  export let settleFrom: string;
  export let settleTo: string;
  export let settleAmount: string;

  export let recordSettlement: (from: string, to: string, amount: string) => void | Promise<void>;
  export let confirmSettlement: (sid: string) => void | Promise<void>;
  export let disputeSettlement: (sid: string) => void | Promise<void>;
  export let voidSettlement: (sid: string) => void | Promise<void>;
  export let participantLabel: (pid: string) => string;
  export let localIdentityForPid: (pid: string) => unknown;
</script>

<article class="panel settlements">
  <h2><Icon name="refresh-ccw" size={18} /> Settle</h2>
  {#if !frozenPolicy.allowSettlementActions}
    <p class="warning compact-warning">Settlement Is Frozen Until The Newer Retained Event Can Be Folded.</p>
  {:else}
    {#each suggestedSettlements as transfer}
      <button type="button" class="settle-suggestion" disabled={archived} on:click={() => recordSettlement(transfer.from, transfer.to, formatMinorInput(transfer.minor))}>
        {participantLabel(transfer.from)} Pays {participantLabel(transfer.to)} {formatMinor(transfer.minor, currency)}
      </button>
    {/each}
    <div class="form-grid">
      <select bind:value={settleFrom} disabled={archived}><option value="">From</option>{#each participants as p}<option value={p.pid}>{p.name}</option>{/each}</select>
      <select bind:value={settleTo} disabled={archived}><option value="">To</option>{#each participants as p}<option value={p.pid}>{p.name}</option>{/each}</select>
      <input bind:value={settleAmount} inputmode="decimal" placeholder="Amount" disabled={archived} />
      <button type="button" disabled={!canRecordManualSettlement} on:click={() => recordSettlement(settleFrom, settleTo, settleAmount)}>Record</button>
    </div>
  {/if}
  {#if settlements.length && frozenPolicy.allowSettlementActions}
    <div class="settlement-list">
      {#each settlements as settlement}
        {@const claims = settlementClaimView(group.events, settlement.sid)}
        <div class="settlement-row">
          <span class="settlement-claims">
            <strong>{participantLabel(settlement.from)} Paid {participantLabel(settlement.to)} {formatMinor(settlement.minor, currency)}</strong>
            {#if claims.dispute}
              <span>Dispute: {claims.dispute.note || "Payment Disputed"}</span>
            {/if}
          </span>
          <span class="settlement-state">
            <strong class:positive={settlement.confirmed} class:negative={settlement.disputed || settlement.contestedConfirmation}>
              {settlement.disputed ? "Disputed" : settlement.contestedConfirmation ? "Contested" : settlement.confirmed ? "Confirmed" : settlement.cashUnconfirmable ? "Cash" : "Pending"}
            </strong>
            {#if canConfirmSettlement({
              archived,
              allowSettlementActions: frozenPolicy.allowSettlementActions,
              pending: settlement.pending,
              hasLocalPayeeIdentity: Boolean(localIdentityForPid(settlement.to)),
              payeeHasActiveClaimAnomaly: hasActiveClaimAnomaly(anomalies, settlement.to),
            })}
              <button type="button" disabled={archived} on:click={() => confirmSettlement(settlement.sid)}>Confirm</button>
            {/if}
            {#if !settlement.disputed}
              <button type="button" class="secondary" disabled={archived} on:click={() => disputeSettlement(settlement.sid)}>Dispute</button>
            {/if}
            {#if verificationContext && canVoidRecordedSettlement(group.events, settlement.sid, group.identities.map((identity) => identity.pid), verificationContext)}
              <button type="button" class="secondary danger-action" disabled={archived} on:click={() => voidSettlement(settlement.sid)}>Void</button>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</article>
