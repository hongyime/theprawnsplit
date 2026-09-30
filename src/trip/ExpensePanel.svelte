<script lang="ts">
  // T60 (STRUCT-001): expense panel view extracted from Trip.svelte. Controller
  // (Trip.svelte) retains allocation, storage, and command ownership — this
  // panel only owns rendering and two-way input binding via `bind:` props.
  import Icon from "@/lib/Icon.svelte";
  import NeoButton from "@/lib/NeoButton.svelte";
  import { formatMinor } from "@/lib/money";
  import { normalizeCurrency } from "@/lib/multicurrency";
  import type { SplitMode } from "@/lib/money";
  import type { PayerMode } from "@/lib/payers";

  interface Participant { pid: string; name: string }
  interface SharePreview { ok: true; shares: { pid: string; minor: bigint }[]; remainderPid?: string }
  interface SharePreviewInvalid { ok: false; message: string }
  interface AmountPreview { ok: true; baseMinor: bigint; rate?: unknown }
  interface AmountPreviewInvalid { ok: false; message: string }
  interface SubgroupPreset { id: string; name: string; pids: string[] }

  export let archived: boolean;
  export let hasLocalClaim: boolean;
  export let currency: string;
  export let participants: Participant[];
  export let selectedParticipants: Participant[];
  export let expenseCurrencyOptions: string[];
  export let subgroupPresets: SubgroupPreset[];
  export let amountPreview: AmountPreview | AmountPreviewInvalid;
  export let sharePreview: SharePreview | SharePreviewInvalid;
  export let expenseBlockReason: string;
  export let canSaveExpense: boolean;

  export let expenseDesc: string;
  export let expenseTotal: string;
  export let expenseCurrency: string;
  export let exchangeRate: string;
  export let payerMode: PayerMode;
  export let payerPid: string;
  export let payerAmounts: Record<string, string>;
  export let splitMode: SplitMode;
  export let exactShares: Record<string, string>;
  export let shareWeights: Record<string, string>;
  export let percentages: Record<string, string>;
  export let subgroupName: string;
  export let showExpenseHint: boolean;

  export let changePayerMode: (mode: PayerMode) => void;
  export let changeSplitMode: (mode: SplitMode) => void;
  export let saveSubgroupPreset: () => void | Promise<void>;
  export let applySubgroup: (id: string) => void;
  export let deleteSubgroup: (id: string) => void | Promise<void>;
  export let addExpense: () => void | Promise<void>;
  export let participantLabel: (pid: string) => string;
  export let splitModeLabel: (mode: SplitMode) => string;
</script>

<article class="panel expense">
  <h2><Icon name="receipt-text" size={18} /> Add Expense</h2>
  <div class="form-grid">
    <input value={expenseDesc} placeholder="Description" disabled={archived} on:input={(e) => { expenseDesc = (e.currentTarget as HTMLInputElement).value; showExpenseHint = true; }} />
    <input value={expenseTotal} inputmode="decimal" placeholder="Total" disabled={archived} on:input={(e) => { expenseTotal = (e.currentTarget as HTMLInputElement).value; showExpenseHint = true; }} />
    <div class="currency-row">
      <select class="currency" bind:value={expenseCurrency} aria-label="Expense Currency" disabled={archived} on:change={() => (expenseCurrency = normalizeCurrency(expenseCurrency || currency))}>
        {#each expenseCurrencyOptions as code}
          <option value={code}>{code}</option>
        {/each}
      </select>
      {#if normalizeCurrency(expenseCurrency || currency) !== currency}
        <input bind:value={exchangeRate} inputmode="decimal" placeholder={`1 ${normalizeCurrency(expenseCurrency)} To ${currency}`} aria-label="Exchange Rate To Group Currency" disabled={archived} on:input={() => (showExpenseHint = true)} />
      {/if}
    </div>
    <div class="segmented payer-mode" aria-label="Payer Mode">
      <button type="button" class:active={payerMode === "single"} disabled={archived} on:click={() => changePayerMode("single")}>One Paid</button>
      <button type="button" class:active={payerMode === "multiple"} disabled={archived} on:click={() => changePayerMode("multiple")}>Many Paid</button>
    </div>
    {#if payerMode === "single"}
      <select bind:value={payerPid} disabled={archived}>
        {#each participants as participant}<option value={participant.pid}>{participant.name} Paid</option>{/each}
      </select>
    {:else}
      <div class="split-table payer-table">
        {#each participants as participant}
          <label>
            <span>{participant.name}</span>
            <input bind:value={payerAmounts[participant.pid]} inputmode="decimal" placeholder="0.00" disabled={archived} />
          </label>
        {/each}
      </div>
    {/if}
    <div class="segmented">
      {#each ["equal", "exact", "shares", "percentage"] as mode}
        <button type="button" class:active={splitMode === mode} disabled={archived} on:click={() => changeSplitMode(mode as SplitMode)}>{splitModeLabel(mode as SplitMode)}</button>
      {/each}
    </div>
  </div>

  {#if selectedParticipants.length}
    <div class="split-table">
      {#each selectedParticipants as participant}
        <label>
          <span>{participant.name}</span>
          {#if splitMode === "exact"}
            <input bind:value={exactShares[participant.pid]} inputmode="decimal" placeholder="0.00" disabled={archived} />
          {:else if splitMode === "shares"}
            <input bind:value={shareWeights[participant.pid]} inputmode="numeric" placeholder="1" disabled={archived} />
          {:else if splitMode === "percentage"}
            <input bind:value={percentages[participant.pid]} inputmode="decimal" placeholder="%" disabled={archived} />
          {:else}
            <span>{sharePreview.ok ? formatMinor(sharePreview.shares.find((s) => s.pid === participant.pid)?.minor ?? 0n, currency) : "—"}</span>
          {/if}
        </label>
      {/each}
    </div>
  {/if}
  <div class="subgroup-tools">
    <div class="row subgroup-save">
      <input bind:value={subgroupName} placeholder="Save Subgroup" disabled={archived} />
      <button type="button" class="secondary" disabled={archived || !subgroupName.trim() || selectedParticipants.length === 0} on:click={saveSubgroupPreset}>Save</button>
    </div>
    {#if subgroupPresets.length}
      <div class="subgroup-list" aria-label="Subgroups">
        {#each subgroupPresets as preset}
          <span>
            <button type="button" class="secondary" disabled={archived} on:click={() => applySubgroup(preset.id)}>{preset.name}</button>
            <button type="button" class="secondary" disabled={archived} on:click={() => deleteSubgroup(preset.id)} title="Delete Subgroup">x</button>
          </span>
        {/each}
      </div>
    {/if}
  </div>
  {#if expenseBlockReason && (showExpenseHint || !hasLocalClaim || archived)}<p class="hint action-hint">{expenseBlockReason}</p>{/if}
  {#if amountPreview.ok && sharePreview.ok && sharePreview.remainderPid}<p class="hint">Rounding Remainder Goes To {participantLabel(sharePreview.remainderPid)}.</p>{/if}
  <NeoButton class={!canSaveExpense ? 'blocked' : ''} disabled={!canSaveExpense} onclick={addExpense}><Icon name="plus" size={17} /> Save Expense</NeoButton>
</article>
